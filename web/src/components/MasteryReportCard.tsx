import { useState } from "react";
import type { MasteryReport } from "../lib/types";
import { printReport } from "../lib/reportExport";

function scoreClass(score: number): string {
  if (score >= 80) return "good";
  if (score >= 60) return "mid";
  return "low";
}

export function MasteryReportCard({ report, nickname, gradeLabel, topic }: { report: MasteryReport; nickname?: string; gradeLabel?: string; topic?: string }) {
  const [printError, setPrintError] = useState(false);
  const date = new Date(report.generatedAt);
  const meta = { nickname, gradeLabel, topic };

  function onPrint(): void {
    try {
      setPrintError(!printReport(report, meta));
    } catch {
      setPrintError(true);
    }
  }

  return (
    <section className="report">
      <h3><i className="ti ti-clipboard-list" aria-hidden="true"></i> 本次掌握报告</h3>
      <p className="report-date">
        {date.getFullYear()}-{String(date.getMonth() + 1).padStart(2, "0")}-
        {String(date.getDate()).padStart(2, "0")}
        <span className="report-tip"> · 可以截图保存给家长看</span>
      </p>
      <div className="report-actions">
        <button className="btn small" onClick={onPrint}>
          <i className="ti ti-printer" aria-hidden="true"></i> 打印 / 保存为 PDF
        </button>
      </div>
      {printError && <p className="report-print-error">浏览器阻止了打印窗口，请允许本站弹出窗口后重试。</p>}
      <ul>
        {report.knowledge.map((k, i) => (
          <li key={i} className="report-item">
            <div className="report-head">
              <span className="report-name">{k.name}</span>
              <span className={`report-score ${scoreClass(k.score)}`}>{k.score} 分</span>
            </div>
            <div
              className="report-bar"
              role="progressbar"
              aria-label={`${k.name} 掌握度`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(100, Math.max(0, Math.round(k.score)))}
            >
              <div className={`report-fill ${scoreClass(k.score)}`} style={{ width: `${Math.min(100, Math.max(0, k.score))}%` }} />
            </div>
            {k.status && <p className="report-status">{k.status}</p>}
            {k.advice && (
              <p className="report-advice">
                <b>复习建议：</b>
                {k.advice}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
