import type { PracticeItem } from "../types";
import { sanitizePhysicsSvg } from "./composeLesson";
import { validateCircuit, verifyCircuitResult, type CircuitNode } from "./circuit";

const fmt = (value: number) => Number(value.toPrecision(6)).toString();
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
function questionBlock(topic?: string): string {
  const text = topic?.trim();
  return text ? `<p><strong>题目：</strong>${escape(text.slice(0, 500))}</p>` : "";
}

function describe(node: CircuitNode): string {
  if (node.kind === "resistor") return `${node.id}（${fmt(node.resistance)} Ω）`;
  return `（${node.children.map(describe).join("、")}）${node.kind === "series" ? "串联" : "并联"}`;
}

function connection(node: CircuitNode): string {
  const kinds = new Set<string>();
  function visit(item: CircuitNode): void {
    if (item.kind === "resistor") return;
    kinds.add(item.kind);
    item.children.forEach(visit);
  }
  visit(node);
  return kinds.size === 0 ? "只有一个电阻" : kinds.size === 2 ? "串联与并联组合" : kinds.has("series") ? "纯串联" : "纯并联";
}

export function composeCircuitLesson(input: unknown, output: unknown, svg: string, topic?: string): string {
  const checked = validateCircuit(input);
  if (!checked.ok || !verifyCircuitResult(checked.model, output)) throw new Error("电路计算结果未通过核对");
  const graphic = sanitizePhysicsSvg(svg);
  const model = checked.model;
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:18px/1.6 system-ui,sans-serif;color:#1d3330;margin:0;padding:24px}main{max-width:860px;margin:auto}h1{font-size:1.5rem}.diagram{border:1px solid #d5e6de;border-radius:12px;padding:16px}.diagram svg{display:block;width:min(100%,640px);height:auto;margin:auto}li{margin:.5rem 0}@media(max-width:480px){body{padding:16px}}</style></head><body><main><h1>一起看直流电路</h1>${questionBlock(topic)}<p>图中 V 表示理想直流电源，R 表示电阻。先按题意核对每个连接。</p><div class="diagram">${graphic}</div><ul><li>电源电压 ${fmt(model.voltage)} V；电阻网络为 ${describe(model.network)}。</li><li>整个电阻网络的等效电阻约 ${fmt(output.resistance)} Ω。</li><li>电源的总电流约 ${fmt(output.current)} A。</li></ul><p>这里仅处理理想直流电源与纯电阻网络。</p></main></body></html>`;
}

export function buildCircuitPractices(input: unknown, output: unknown): PracticeItem[] {
  const checked = validateCircuit(input);
  if (!checked.ok || !verifyCircuitResult(checked.model, output)) throw new Error("电路练习的条件或结果未通过核对");
  const model = checked.model;
  const setup = `理想直流电源电压为 ${fmt(model.voltage)} V，电阻网络为 ${describe(model.network)}。`;
  return [
    { difficulty: "持平", question: `${setup}这个网络属于哪种连接结构？`, answer: connection(model.network), analysis: "沿电路从整体到局部，分别识别串联和并联部分。" },
    { difficulty: "进阶", question: `${setup}求网络的等效电阻。`, answer: `约 ${fmt(output.resistance)} Ω。`, analysis: "先化简内部网络，再按串联电阻相加、并联电阻倒数相加逐层化简。" },
    { difficulty: "培优", question: `${setup}求电源提供的总电流。`, answer: `约 ${fmt(output.current)} A。`, analysis: "先求等效电阻，再用总电压除以等效电阻。" },
  ];
}
