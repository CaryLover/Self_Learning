import type { MasteryReport } from "./types";

const escape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const clampScore = (value: number): number => Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));

function dateText(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return "日期未知";
  const date = new Date(ts);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** 生成可打印的独立报告页；所有文本转义，页面不含脚本或外部资源。 */
export function buildReportDocument(
  report: MasteryReport,
  meta: { nickname?: string; gradeLabel?: string; topic?: string } = {},
): string {
  const who = [meta.nickname ? `孩子：${escape(meta.nickname)}` : "", meta.gradeLabel ? `学段：${escape(meta.gradeLabel)}` : ""]
    .filter(Boolean)
    .join(" · ");
  const topic = meta.topic ? `<p class="meta">主题：${escape(meta.topic)}</p>` : "";
  const items = report.knowledge
    .map((item) => {
      const score = clampScore(item.score);
      const status = item.status ? `<p>状态：${escape(item.status)}</p>` : "";
      const advice = item.advice ? `<p>复习建议：${escape(item.advice)}</p>` : "";
      return `<section class="item"><div class="head"><span class="name">${escape(item.name)}</span><span class="score">${score} 分</span></div><div class="bar"><div class="fill" style="width:${score}%"></div></div>${status}${advice}</section>`;
    })
    .join("");
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>掌握报告</title><style>
body{font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif;color:#1d3330;margin:0;padding:32px;background:#fff}
main{max-width:720px;margin:auto}
h1{font-size:1.6rem;margin:0 0 6px}
.meta{color:#5b6b68;margin:0 0 6px}
.item{border:1px solid #d5e6de;border-radius:10px;padding:12px 14px;margin:12px 0;break-inside:avoid}
.head{display:flex;justify-content:space-between;gap:12px;align-items:baseline}
.name{font-weight:600}.score{font-weight:600;white-space:nowrap}
.bar{height:6px;background:#e3f2e9;border-radius:3px;overflow:hidden;margin:8px 0}
.fill{height:100%;background:#0e9f7e}
p{margin:.35em 0}
.footer{margin-top:24px;color:#5b6b68;font-size:.9em}
@media print{body{padding:0}main{max-width:none}}
</style></head><body><main><h1>掌握报告</h1><p class="meta">${escape(dateText(report.generatedAt))}${who ? ` · ${who}` : ""}</p>${topic}${items}<p class="footer">本报告根据本次学习对话中的作答情况生成，供家长参考。</p></main></body></html>`;
}

/** 打开独立窗口并触发打印；浏览器阻止弹窗时返回 false。 */
export function printReport(
  report: MasteryReport,
  meta: { nickname?: string; gradeLabel?: string; topic?: string } = {},
): boolean {
  if (typeof window === "undefined") return false;
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.open();
  win.document.write(buildReportDocument(report, meta));
  win.document.close();
  win.focus();
  setTimeout(() => {
    try {
      win.print();
    } catch {
      /* 用户可手动打印 */
    }
  }, 250);
  return true;
}
