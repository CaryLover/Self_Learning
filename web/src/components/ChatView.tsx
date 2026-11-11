import { Fragment, useEffect, useRef } from "react";
import type { ChatMsg, MasteryReport, SkillMap } from "../lib/types";
import { stickerFor, dailyTip } from "../lib/encourage";
import { MessageBubble } from "./MessageBubble";
import { SkillMapPanel } from "./SkillMapPanel";
import { PracticeCards } from "./PracticeCards";
import { MasteryReportCard } from "./MasteryReportCard";

export function ChatView({
  messages,
  streamText,
  busy,
  reportBusy,
  skillMap,
  report,
  showMap,
  onEnd,
  onStop,
}: {
  messages: ChatMsg[];
  streamText: string;
  busy: boolean;
  reportBusy: boolean;
  skillMap?: SkillMap;
  report?: MasteryReport;
  showMap: boolean;
  onEnd: () => void;
  onStop: () => void;
}) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, streamText, report]);

  const streamingMsg: ChatMsg | null =
    busy && streamText !== "" ? { id: "__streaming", role: "assistant", content: streamText, ts: 0 } : null;

  const empty = messages.length === 0 && !busy;

  return (
    <div className="chat">
      {empty && (
        <div className="welcome">
          <div className="welcome-emoji"><i className="ti ti-school" aria-hidden="true"></i></div>
          <h2>苏格拉底辅导</h2>
          <p>
            在下方输入你想学的内容（<b>一次一个题目或知识点</b>）。
          </p>
          <div className="steps">
            <span>① 输入题目</span>
            <span>② 跟着问题一步步想</span>
            <span>③ 涨等级 · 拿报告</span>
          </div>
          <p className="welcome-note">
            老师会先问几个小问题摸摸底，再一步一步<b>引导你自己想出来</b>——
            这里的老师不会直接给答案哦，遇到卡住可以说「给个提示」或「换个说法」。
          </p>
          <p className="tip-line">💡 {dailyTip()}</p>
        </div>
      )}
      <div className="msg-list">
        {messages.map((m, i) => (
          <Fragment key={m.id}>
            <MessageBubble msg={m} />
            {m.role === "assistant" && !m.error && i % 2 === 1 && (
              <div className="sticker">{stickerFor(m.ts)}</div>
            )}
          </Fragment>
        ))}
        {streamingMsg && <MessageBubble msg={streamingMsg} streaming />}
        {reportBusy && <div className="report-busy">正在为你生成本次掌握报告…</div>}
      </div>
      {report && <MasteryReportCard report={report} />}
      <div ref={bottomRef} />
    </div>
  );
}

export function ChatSidePanel({
  skillMap,
  ended,
  onEnd,
  busy,
}: {
  skillMap?: SkillMap;
  ended?: boolean;
  onEnd: () => void;
  busy: boolean;
}) {
  // 技能地图尚未生成（诊断未完成）时不显示「结束本次学习」，避免空按钮
  if (!skillMap) {
    return (
      <div className="skillmap-empty">
        <span className="skillmap-empty-icon"><i className="ti ti-map-2" aria-hidden="true"></i></span>
        <p>老师先通过几道小问题了解你的水平，<b>诊断完成后这里会出现技能地图</b>，那时才可以「结束本次学习」并生成掌握报告。</p>
      </div>
    );
  }
  return (
    <>
      <SkillMapPanel map={skillMap} />
      {ended ? (
        <div className="skillmap-ended">本次学习已结束，可用左侧「＋ 新建学习」继续</div>
      ) : (
        <button className="btn-end" onClick={onEnd} disabled={busy} title="生成掌握报告并结束本次学习">
          结束本次学习
        </button>
      )}
    </>
  );
}

export { PracticeCards };
