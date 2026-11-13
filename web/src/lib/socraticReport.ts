import type { MasteryReport } from "./types";

/**
 * 产品硬规则：没有作答证据时，报告分数只能是 0–10，状态必须以“未作答，无法评定”开头。
 * 提示词已要求模型遵守；前端在落盘前再做一次兜底，避免模型评分造成误导。
 */
export function enforceReportPolicy(report: MasteryReport, answers: number): MasteryReport {
  if (answers > 0) return report;
  return {
    ...report,
    knowledge: report.knowledge.map((item) => ({
      ...item,
      score: Math.min(10, Math.max(0, Math.round(Number(item.score) || 0))),
      status: item.status.startsWith("未作答，无法评定") ? item.status : "未作答，无法评定",
    })),
  };
}
