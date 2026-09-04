import type { AgentRole } from "@/domain/contracts";
import {
  advanceAgentStep,
  assembleContextStep,
  executeAgentToolStep,
  failureStep,
  fetchDataStep,
  finalizeStep,
  initializeStep,
  mergeFindingsStep,
  modelTurnStep,
  prepareAgentStep,
} from "./steps";

async function runAgent(
  runId: string,
  role: AgentRole,
  contextId: string,
  pass = 0,
) {
  const agent = await prepareAgentStep(runId, role, contextId, pass);
  let stateId = agent.stateId;
  for (let iteration = 0; iteration < agent.maxIterations; iteration++) {
    const turn = await modelTurnStep(
      runId,
      stateId,
      iteration,
      iteration === agent.maxIterations - 1,
    );
    const resultIds = await Promise.all(
      Array.from({ length: turn.callCount }, (_, index) =>
        executeAgentToolStep(runId, stateId, turn.turnId, index),
      ),
    );
    const result = await advanceAgentStep(
      runId,
      stateId,
      turn.turnId,
      resultIds,
      iteration,
    );
    if (result.done) return result.findingId;
    stateId = result.stateId;
  }
  throw new Error(
    JSON.stringify({
      code: "AGENT_ITERATION_LIMIT",
      message: `${role} 在轮次上限内未提交有效分析。`,
      retryable: false,
    }),
  );
}

export async function executeResearchGraph(runId: string) {
  const plan = await initializeStep(runId);
  const supervisorId = await runAgent(runId, "supervisor", plan.contextId);
  const dataIds: string[] = [];
  for (let i = 0; i < plan.requests.length; i += 2)
    dataIds.push(
      ...(await Promise.all(
        plan.requests
          .slice(i, i + 2)
          .map((request) => fetchDataStep(runId, request)),
      )),
    );
  let contextId = await assembleContextStep(
    runId,
    plan.contextId,
    dataIds,
    supervisorId,
  );
  const specialistIds = await Promise.all(
    plan.roles.map((role) => runAgent(runId, role, contextId)),
  );
  contextId = await mergeFindingsStep(
    runId,
    contextId,
    specialistIds,
    "specialists",
  );
  if (plan.mode !== "portfolio") {
    for (let round = 0; round < plan.rounds; round++) {
      const debateIds = await Promise.all([
        runAgent(runId, "bull", contextId, round),
        runAgent(runId, "bear", contextId, round),
      ]);
      contextId = await mergeFindingsStep(
        runId,
        contextId,
        debateIds,
        `debate:${round}`,
      );
    }
  }
  const riskId = await runAgent(runId, "risk", contextId);
  contextId = await mergeFindingsStep(runId, contextId, [riskId], "reviewed");
  const reportId = await runAgent(runId, "report", contextId);
  return await finalizeStep(runId, contextId, reportId);
}

export async function researchWorkflow(runId: string) {
  "use workflow";
  try {
    return await executeResearchGraph(runId);
  } catch (error) {
    return await failureStep(
      runId,
      error instanceof Error ? error.message : "Run failed",
    );
  }
}
