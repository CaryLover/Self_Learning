import { useRef } from "react";
import type { Eli5State } from "../lib/types";
import { PracticeCards } from "./PracticeCards";

const STAGE_LABEL: Record<Eli5State["stage"], string | null> = {
  idle: null,
  explaining: "正在画讲解图…（约需几十秒）",
  practicing: "正在生成巩固练习…",
  done: null,
  error: null,
};

export function Eli5View({ eli5 }: { eli5?: Eli5State }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  function goFullscreen(): void {
    frameRef.current?.requestFullscreen?.().catch(() => undefined);
  }

  return (
    <div className="eli5">
      {eli5 && STAGE_LABEL[eli5.stage] && <div className="eli5-stage">{STAGE_LABEL[eli5.stage]}</div>}
      {eli5?.physicsPreview && <div className="error-card">物理图仅供开发测试：题目理解、图形和讲解尚需人工审核。</div>}
      {eli5?.html && (
        <div className="explain-wrap">
          <iframe className="explain-frame" title="看图讲解" sandbox="" srcDoc={eli5.html} ref={frameRef} />
          <div className="explain-foot">
            <span>看不清？</span>
            <button className="btn-link" onClick={goFullscreen}>
              全屏查看 ⤢
            </button>
          </div>
        </div>
      )}
      {eli5?.stage === "done" && !!eli5.practices?.length && (
        <div className="done-banner">
          太棒了，讲解看完啦！下面几道小题试试手，看看学会了没有～
        </div>
      )}
      {eli5?.stage === "error" && eli5.error && <div className="error-card">😢 {eli5.error}</div>}
      {eli5?.practices && <PracticeCards items={eli5.practices} />}
    </div>
  );
}
