import { executeConfirmedActionStep } from "./action-steps";

export async function actionWorkflow(actionId: string, userId: string) {
  "use workflow";
  return executeConfirmedActionStep(actionId, userId);
}
