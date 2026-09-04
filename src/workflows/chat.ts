import { executeResearchGraph } from "./research";
import {
  attachResearchResultStep,
  classifyChatStep,
  failChatStep,
  proposeActionStep,
  replyChatStep,
  startResearchFromChatStep,
} from "./chat-steps";

export async function chatWorkflow(runId: string) {
  "use workflow";
  try {
    const classified = await classifyChatStep(runId);
    if (classified.confirm)
      return await replyChatStep(
        runId,
        "聊天里输入“确认”不会执行任何交易或划转。请使用动作卡并输入当前账号密码。",
      );
    const plan = classified.plan;
    if (plan.needsClarification && plan.taskKind !== "action")
      return await replyChatStep(
        runId,
        plan.clarificationQuestions.join("\n") ||
          "请补充更具体的交易对或研究范围。",
      );
    if (plan.taskKind === "action") return await proposeActionStep(runId, plan);
    if (plan.taskKind === "general")
      return await replyChatStep(
        runId,
        "我可以帮你做市场研究、现货账户体检、策略回测，或生成需密码确认的现货/划转预览。直接说交易对和目标即可。",
      );
    const researchRunId = await startResearchFromChatStep(runId, plan);
    try {
      await executeResearchGraph(researchRunId);
    } catch (error) {
      return await attachResearchResultStep(runId, researchRunId).catch(() =>
        failChatStep(
          runId,
          error instanceof Error ? error.message : "Run failed",
        ),
      );
    }
    return await attachResearchResultStep(runId, researchRunId);
  } catch (error) {
    return await failChatStep(
      runId,
      error instanceof Error ? error.message : "Run failed",
    );
  }
}
