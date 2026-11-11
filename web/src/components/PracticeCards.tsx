import { useMemo } from "react";
import type { PracticeItem } from "../lib/types";
import { renderMarkdown } from "../lib/markdown";

const DIFF_LABEL: Record<PracticeItem["difficulty"], string> = {
  持平: "基础 · 持平",
  进阶: "进阶",
  培优: "培优 · 挑战",
};

function Md({ text }: { text: string }) {
  const html = useMemo(() => renderMarkdown(text), [text]);
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function PracticeCards({ items }: { items: PracticeItem[] }) {
  if (!items.length) return null;
  return (
    <section className="practice">
      <h3><i className="ti ti-pencil" aria-hidden="true"></i> 巩固练习</h3>
      <p className="practice-hint">先自己做一做，再点开核对答案。</p>
      <ol>
        {items.map((it, i) => (
          <li key={i} className="practice-card">
            <div className="practice-head">
              <span className={`diff diff-${i < items.length ? it.difficulty : "持平"}`}>
                {DIFF_LABEL[it.difficulty] ?? it.difficulty}
              </span>
              <span className="practice-no">第 {i + 1} 题</span>
            </div>
            <div className="practice-q">
              <Md text={it.question} />
            </div>
            <details>
              <summary>参考答案与解析</summary>
              <div className="practice-answer">
                <Md text={`**参考答案：** ${it.answer}`} />
                {it.analysis && <Md text={`**解析：** ${it.analysis}`} />}
              </div>
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}
