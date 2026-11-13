import type { Session } from "./types";

/** A saved in-progress request cannot survive a page reload or a closed tab. */
export function recoverSession(session: Session): Session {
  const eli5 = session.eli5;
  if (!eli5) return session;

  if (eli5.stage === "practicing") {
    const retryPractice = !!eli5.html && !!eli5.topic;
    const retryLesson = !retryPractice && !!eli5.topic;
    return { ...session, eli5: { ...eli5, stage: "error", retryPractice, retryLesson, error: retryPractice ? "上次生成练习时页面已关闭或刷新。讲解已保留，可以重新生成练习。" : retryLesson ? "上次生成练习被中断，讲解未能恢复，可以重新生成讲解。" : "上次生成练习被中断，请重新提交题目。" } };
  }
  if (eli5.stage === "physics_explaining") {
    const retryPhysicsExplanation = !!eli5.html && !!eli5.topic && !!eli5.physicsPreview && !!eli5.pendingPhysicsPractices;
    const retryLesson = !retryPhysicsExplanation && !!eli5.topic;
    return { ...session, eli5: { ...eli5, stage: "error", retryPhysicsExplanation, retryLesson, error: retryPhysicsExplanation ? "上次生成讲解时页面已关闭或刷新。物理图和结果已保留，可以重新生成讲解。" : retryLesson ? "上次生成讲解被中断，物理结果未能恢复，可以重新生成讲解。" : "上次生成讲解被中断，请重新提交题目。" } };
  }
  if (eli5.stage === "explaining") {
    return { ...session, eli5: { ...eli5, stage: "error", retryLesson: !!eli5.topic, error: eli5.topic ? "上次生成讲解时页面已关闭或刷新，可以重新生成讲解。" : "上次生成讲解被中断，请重新提交题目。" } };
  }
  return session;
}
