import { useRef } from "react";
import type { Eli5State } from "../lib/types";
import { PracticeCards } from "./PracticeCards";
import { protectExplainDocument } from "../lib/explainDocument";

const STAGE_LABEL: Record<Eli5State["stage"], string | null> = {
  idle: null,
  explaining: "正在画讲解图…（约需几十秒）",
  physics_explaining: "物理图已生成，正在组织讲解…",
  clarification: null,
  practicing: "正在生成巩固练习…",
  done: null,
  error: null,
};

export function Eli5View({ eli5, busy, onRetryLesson, onRetryPractice, onSkipPractice, onRetryPhysicsExplanation, onSkipPhysicsExplanation, onContinueUnverified, onEditTopic, physicsRetryEnabled }: { eli5?: Eli5State; busy: boolean; onRetryLesson: () => void; onRetryPractice: () => void; onSkipPractice: () => void; onRetryPhysicsExplanation: () => void; onSkipPhysicsExplanation: () => void; onContinueUnverified: () => void; onEditTopic?: () => void; physicsRetryEnabled: boolean }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  function goFullscreen(): void {
    frameRef.current?.requestFullscreen?.().catch(() => undefined);
  }

  return (
    <div className="eli5">
      {eli5 && STAGE_LABEL[eli5.stage] && <div className="eli5-stage">{STAGE_LABEL[eli5.stage]}</div>}
      {eli5?.physicsPreview && <div className="error-card">物理图仅供开发测试：题目理解、图形和讲解尚需人工审核。</div>}
      {eli5?.physicsUnverified && eli5.html && <div className="eli5-note" role="note">{eli5.physicsTextOnly ? "这道题没有经过物理工具核验：以下是模型文字讲解，请结合题目复核。" : "图文与计算由模型生成，请结合题目复核；如涉及物理内容，本次未使用物理工具核验。"}</div>}
      {eli5?.html && (
        <div className="explain-wrap">
            <iframe className="explain-frame" title="看图讲解" sandbox="" srcDoc={protectExplainDocument(eli5.html)} ref={frameRef} />
          <div className="explain-foot">
            <span>看不清？</span>
            <button className="btn-link" onClick={goFullscreen}>
              全屏查看 ⤢
            </button>
          </div>
        </div>
      )}
      {eli5?.stage === "clarification" && (
        <div className="error-card">
          请根据讲解中的提示补充信息，然后重新发送完整题目；如有图片，请一并重新上传。
          {onEditTopic && <><br /><button className="btn-link" onClick={onEditTopic}>把原题放回输入框修改 →</button></>}
        </div>
      )}
      {eli5?.stage === "done" && !!eli5.practices?.length && (
        <div className="done-banner">
          太棒了，讲解看完啦！下面几道小题试试手，看看学会了没有～
        </div>
      )}
      {eli5?.stage === "error" && eli5.error && (
        <div className="error-card">
          😢 {eli5.error}
          {onEditTopic && <><br /><button className="btn-link" onClick={onEditTopic}>修改题目后重新提交 →</button></>}
        </div>
      )}
      {eli5?.stage === "error" && eli5.unverifiedFallback && !eli5.html && (
        <div className="eli5-note" role="note">
          {eli5.physicsTextOnly
            ? "这道题没有经过物理工具核验：以下只生成模型文字讲解。"
            : "物理工具本次没有完成核对，因此不会生成物理图。你可以换一个模型后重试，或改用普通讲解——普通讲解不经过物理工具核验。"}
        </div>
      )}
      {eli5?.stage === "error" && eli5.retryLesson && <button className="btn" onClick={onRetryLesson} disabled={busy}>重新生成讲解</button>}
      {eli5?.stage === "error" && eli5.unverifiedFallback && !eli5.physicsTextOnly && (
        <button className="btn" onClick={onContinueUnverified} disabled={busy}>改用普通讲解（不做物理核验）</button>
      )}
      {eli5?.stage === "error" && eli5.retryPractice && <button className="btn" onClick={onRetryPractice} disabled={busy}>重新生成练习</button>}
      {eli5?.stage === "error" && eli5.retryPractice && eli5.html && (
        <button className="btn" onClick={onSkipPractice} disabled={busy}>只看讲解，不做练习</button>
      )}
      {eli5?.stage === "error" && eli5.retryPhysicsExplanation && physicsRetryEnabled && <button className="btn" onClick={onRetryPhysicsExplanation} disabled={busy}>重新生成物理讲解</button>}
      {eli5?.stage === "error" && eli5.retryPhysicsExplanation && physicsRetryEnabled && (
        <button className="btn" onClick={onSkipPhysicsExplanation} disabled={busy}>保留物理图和练习，不生成补充讲解</button>
      )}
      {eli5?.stage === "error" && eli5.retryPhysicsExplanation && !physicsRetryEnabled && (
        <div className="error-card">当前版本未启用物理预览，暂时无法重试物理讲解。{eli5.pendingPhysicsPractices?.length ? "已保存的物理图和练习仍可使用。" : "你可以重新提交题目。"}</div>
      )}
      {eli5?.stage === "error" && !eli5.practices?.length && !!eli5.pendingPhysicsPractices?.length && (
        <PracticeCards items={eli5.pendingPhysicsPractices} />
      )}
      {eli5?.practices && <PracticeCards items={eli5.practices} textOnly={eli5.physicsTextOnly} />}
    </div>
  );
}
