import type { DeclaredValue } from "./model";
import type { PracticeItem } from "../types";

type Stated<T> = { value: T; source: "stated" };
export interface PersonBoardModel {
  kind: "person-board-rest";
  personMassKg: Stated<number>;
  boardMassKg: Stated<number>;
  gravity: DeclaredValue<number>;
  tensionN: Stated<number>;
  setup: Stated<"person-on-board-ground-rope-up">;
  motion: Stated<"rest">;
  extraForces: Stated<"none">;
  requested: Array<"forces" | "contact">;
}

type Force = { role: string; from: string; to: string; y: 1 | -1; magnitude: number };
export interface PersonBoardResult {
  status: "solved";
  model: "person-board-rest";
  person: Force[];
  board: Force[];
  system: Force[];
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validatePersonBoard(input: unknown):
  | { ok: true; model: PersonBoardModel; assumptions: string[] }
  | { ok: false; reasons: string[] } {
  if (!record(input)) return { ok: false, reasons: ["物理描述必须是对象"] };
  const data = input;
  const reasons: string[] = [];
  const keys = ["kind", "personMassKg", "boardMassKg", "gravity", "tensionN", "setup", "motion", "extraForces", "requested"];
  if (input.kind !== "person-board-rest" || Object.keys(input).some(k => !keys.includes(k))) reasons.push("不在当前人板模型范围内");
  function value(name: string, allowedSources: string[]): unknown {
    const item = data[name];
    if (!record(item) || Object.keys(item).some(k => k !== "source" && k !== "value") || typeof item.source !== "string" || !allowedSources.includes(item.source) || !("value" in item)) {
      reasons.push(`${name} 必须明确给出`);
      return undefined;
    }
    return item.value;
  }
  const person = value("personMassKg", ["stated"]);
  const board = value("boardMassKg", ["stated"]);
  const gravity = value("gravity", ["stated", "assumed"]);
  const tension = value("tensionN", ["stated"]);
  for (const [name, n, max] of [["personMassKg", person, 1e6], ["boardMassKg", board, 1e6], ["gravity", gravity, 100], ["tensionN", tension, 1e8]] as const) {
    if (typeof n !== "number" || !Number.isFinite(n) || n <= 0 || n >= max) reasons.push(`${name} 缺失或超出支持范围`);
  }
  for (const [name, expected] of [["setup", "person-on-board-ground-rope-up"], ["motion", "rest"], ["extraForces", "none"]] as const) {
    if (value(name, ["stated"]) !== expected) reasons.push(`${name} 的条件不符合支持范围`);
  }
  if (!Array.isArray(input.requested) || !input.requested.length || input.requested.some(x => x !== "forces" && x !== "contact") || new Set(input.requested).size !== input.requested.length) reasons.push("待求内容缺失或超出支持范围");
  if (typeof person === "number" && typeof gravity === "number" && typeof tension === "number" && tension >= person * gravity) reasons.push("人和板的接触力必须大于零");
  if (reasons.length) return { ok: false, reasons };
  const model = input as unknown as PersonBoardModel;
  return { ok: true, model, assumptions: model.gravity.source === "assumed" ? ["gravity"] : [] };
}

export function solvePersonBoard(input: unknown): { model: PersonBoardModel; result: PersonBoardResult; assumptions: string[] } {
  const checked = validatePersonBoard(input);
  if (!checked.ok) throw new Error(checked.reasons.join("；"));
  const m = checked.model;
  const wp = m.personMassKg.value * m.gravity.value;
  const wb = m.boardMassKg.value * m.gravity.value;
  const tension = m.tensionN.value;
  const contact = wp - tension;
  const ground = contact + wb;
  const person: Force[] = [
    { role: "person-weight", from: "earth", to: "person", y: -1, magnitude: wp },
    { role: "board-on-person", from: "board", to: "person", y: 1, magnitude: contact },
    { role: "rope-on-person", from: "rope", to: "person", y: 1, magnitude: tension },
  ];
  const board: Force[] = [
    { role: "board-weight", from: "earth", to: "board", y: -1, magnitude: wb },
    { role: "person-on-board", from: "person", to: "board", y: -1, magnitude: contact },
    { role: "ground-on-board", from: "ground", to: "board", y: 1, magnitude: ground },
  ];
  const system = [person[0], person[2], board[0], board[2]];
  return { ...checked, result: { status: "solved", model: "person-board-rest", person, board, system } };
}

const fmt = (n: number) => Number(n.toPrecision(4)).toString();
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
function questionBlock(topic?: string): string {
  const text = topic?.trim();
  return text ? `<p><strong>题目：</strong>${escape(text.slice(0, 500))}</p>` : "";
}

export function composePersonBoard(model: PersonBoardModel, result: PersonBoardResult, topic?: string): string {
  const expected = solvePersonBoard(model).result;
  if (JSON.stringify(result) !== JSON.stringify(expected)) throw new Error("人板受力结果未通过核对");
  const person = result.person;
  const board = result.board;
  const assumption = model.gravity.source === "assumed" ? "重力加速度为补充假设，请先确认。" : "";
  const panel = (title: string, object: string, forces: Force[], names: string[], note = "") => {
    const arrows = forces.map((force, index) => {
      const x = 65 + (270 * (index + 0.5)) / forces.length;
      const upward = force.y === 1;
      const start = upward ? 90 : 130;
      const end = upward ? 25 : 195;
      const head = upward ? `${x - 7},${end + 12} ${x},${end} ${x + 7},${end + 12}` : `${x - 7},${end - 12} ${x},${end} ${x + 7},${end - 12}`;
      return `<line x1="${x}" y1="${start}" x2="${x}" y2="${end}" stroke="#075f45" stroke-width="4"/><polygon points="${head}" fill="#075f45"/><text x="${x + 10}" y="${upward ? 35 : 195}" font-size="16" fill="#1d3330">${index + 1}</text>`;
    }).join("");
    const legend = forces.map((force, index) => `<li>${index + 1}. ${names[index]}：${force.y === 1 ? "向上" : "向下"}，${fmt(force.magnitude)} N</li>`).join("");
    return `<section><h2>${title}</h2><svg class="fbd" viewBox="0 0 400 220" role="img" aria-label="${object}的受力方向图，编号对应下方说明"><rect x="50" y="90" width="300" height="40" rx="10" fill="#e3f2e9" stroke="#55766a"/><text x="200" y="116" text-anchor="middle" font-size="18" fill="#1d3330">${object}</text>${arrows}</svg><ul>${legend}</ul>${note ? `<p>${note}</p>` : ""}</section>`;
  };
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:18px/1.6 system-ui,sans-serif;color:#1d3330;margin:0;padding:24px}main{max-width:860px;margin:auto}section{border:1px solid #d5e6de;border-radius:12px;padding:12px 18px;margin:16px 0}h1{font-size:1.5rem}h2{font-size:1.1rem}li{margin:.5rem 0}.scene,.fbd{display:block;width:min(100%,440px);height:auto;margin:auto}@media(max-width:480px){body{padding:16px}}</style></head><body><main><h1>人、板和整体分别受什么力？</h1>${questionBlock(topic)}<p>人站在水平板上，板由地面支持；竖直绷紧的固定绳只向上拉人。人和板均静止，并且没有其他外力。${assumption}</p>
<svg class="scene" viewBox="0 0 400 230" role="img" aria-label="示意图：人站在地面支持的板上，竖直固定绳向上拉人"><line x1="80" y1="20" x2="320" y2="20" stroke="#354c48" stroke-width="5"/><line x1="200" y1="20" x2="200" y2="55" stroke="#6a5744" stroke-width="3"/><circle cx="200" cy="70" r="15" fill="#e8b76d"/><path d="M200 85 L200 130 M200 98 L180 117 M200 98 L220 117 M200 130 L185 170 M200 130 L215 170" fill="none" stroke="#354c48" stroke-width="6" stroke-linecap="round"/><rect x="110" y="172" width="180" height="16" rx="3" fill="#b58a59"/><line x1="55" y1="190" x2="345" y2="190" stroke="#536963" stroke-width="5"/><text x="235" y="57" font-size="17" fill="#354c48">固定绳</text><text x="235" y="114" font-size="17" fill="#354c48">人</text><text x="300" y="185" font-size="17" fill="#354c48">板</text><text x="300" y="215" font-size="17" fill="#354c48">地面</text></svg>
<p>下面的箭头表示力的方向，长度不表示力的大小。每幅图下方都有编号说明。</p>
${panel("① 研究人", "人", person, ["人的重力", "板对人的支持力", "绳对人的拉力"])}
${panel("② 研究板", "板", board, ["板的重力", "人对板的压力", "地面对板的支持力"])}
${panel("③ 把人和板看作整体", "人和板整体", result.system, ["人的重力", "绳对人的拉力", "板的重力", "地面对板的支持力"], "人和板之间的压力与支持力是整体内部的相互作用，不计入整体所受的外力。")}
<p>分别看人和板时，板对人的支持力与人对板的压力大小相等、方向相反，作用在不同物体上。</p></main></body></html>`;
}

export function personBoardPractices(model: PersonBoardModel, result: PersonBoardResult): PracticeItem[] {
  if (JSON.stringify(result) !== JSON.stringify(solvePersonBoard(model).result)) throw new Error("人板练习结果未通过核对");
  const setup = `人质量 ${model.personMassKg.value} kg，板质量 ${model.boardMassKg.value} kg，人站在水平板上，板由地面支持；固定绳竖直向上拉人 ${model.tensionN.value} N，人和板均静止且没有其他外力，重力加速度 ${model.gravity.value} m/s²。`;
  const variant = { ...model, personMassKg: { ...model.personMassKg, value: model.personMassKg.value / 2 }, tensionN: { ...model.tensionN, value: model.tensionN.value / 2 } };
  const variantValid = validatePersonBoard(variant).ok;
  const exerciseModel = variantValid ? variant : model;
  const exerciseResult = variantValid ? solvePersonBoard(variant).result : result;
  const variantSetup = `人质量 ${exerciseModel.personMassKg.value} kg，板质量 ${exerciseModel.boardMassKg.value} kg，人站在水平板上，板由地面支持；固定绳竖直向上拉人 ${exerciseModel.tensionN.value} N，人和板均静止且没有其他外力，重力加速度 ${exerciseModel.gravity.value} m/s²。`;
  return [
    { difficulty: "持平", question: `${setup}人受到哪些力？`, answer: "重力、板对人的支持力和绳对人的拉力。", analysis: "以人为研究对象，只列作用在人的力。" },
    { difficulty: "进阶", question: `${variantSetup}板对人的支持力是多少？`, answer: `约 ${fmt(exerciseResult.person[1].magnitude)} N。`, analysis: "人静止，竖直方向合力为零，支持力等于人的重力减去绳的拉力。" },
    { difficulty: "培优", question: `${setup}人对板的压力是否是人板整体所受的外力？`, answer: "不是，它是整体内部的相互作用力。", analysis: "人和板都包含在选定的系统中，人与板之间的相互作用属于内力。" },
  ];
}
