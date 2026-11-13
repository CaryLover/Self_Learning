import { parseJsonLoose } from "../extract";
import { validateSmoothIncline, type SmoothInclineModel } from "./model";
import { validateHanging, type HangingModel } from "./hanging";
import { validatePersonBoard, type PersonBoardModel } from "./personBoard";
import type { CircuitModel } from "./circuit";
import { parseCircuitExtraction } from "./circuitExtraction";

type Field = "massKg" | "angleDeg" | "gravity" | "surface" | "extraForces" | "motion" | "rope" | "personMassKg" | "boardMassKg" | "tensionN" | "setup";
const FIELD_LABEL: Record<Field, string> = {
  massKg: "物体质量", angleDeg: "斜面角度", gravity: "重力加速度", surface: "斜面条件", extraForces: "其他外力条件", motion: "运动状态", rope: "绳的状态", personMassKg: "人的质量", boardMassKg: "板的质量", tensionN: "绳的拉力", setup: "物体连接条件",
};

const NUMERIC_UNITS: Partial<Record<Field, string>> = {
  massKg: "(?:kg(?![a-z/])|千克|公斤)", personMassKg: "(?:kg(?![a-z/])|千克|公斤)",
  boardMassKg: "(?:kg(?![a-z/])|千克|公斤)", angleDeg: "(?:°|度(?!每))",
  gravity: "(?:m\\s*/\\s*s(?:²|\\^2|2)(?![a-z0-9])|N\\s*/\\s*kg(?![a-z/]))",
  tensionN: "(?:N(?![a-z/])|牛顿|牛(?!顿每))",
};

/** 接受题面直接给出的数值和单位；不把表达式、负数或截断数字当作已核实值。 */
function matchesNumericEvidence(field: Field, excerpt: string, originalText: string, value: unknown): boolean {
  const unit = NUMERIC_UNITS[field];
  if (!unit || typeof value !== "number") return false;
  const pattern = new RegExp(`(?<![a-z0-9.,，])((?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:e[+-]?\\d+)?)\\s*${unit}`, "gi");
  const matches = [...excerpt.matchAll(pattern)];
  if (matches.length !== 1 || Number(matches[0][1]) !== value) return false;
  const match = matches[0];
  const start = originalText.indexOf(excerpt) + (match.index ?? 0);
  const before = originalText.slice(Math.max(0, start - 12), start);
  const after = originalText.slice(start + match[0].length, start + match[0].length + 12);
  if (/(?:[+\-−－×*÷/＋,，.]|负|减去)\s*$/.test(before)) return false;
  if (/^\s*(?:[+\-−－×*÷/＋±]|约等于|至|到)\s*\d/.test(after)) return false;
  return true;
}

function describeReason(reason: string): string {
  return Object.entries(FIELD_LABEL).reduce((text, [key, label]) => text.replace(new RegExp(`\\b${key}\\b`, "g"), label), reason);
}

/**
 * 证据片段必须正面写出该条件，而不是只“出现在原文里”。
 * 数值字段另有数值与单位核对；这里覆盖容易由模型自行补全的条件词。
 */
function evidenceSupports(field: Field, excerpt: string): boolean {
  switch (field) {
    case "surface":
      return /光滑/.test(excerpt) && /固定/.test(excerpt);
    case "motion":
      return /静止|不动/.test(excerpt);
    case "rope":
      return /竖直/.test(excerpt) && /(?:绷紧|拉直|拉紧|张紧|悬挂|固定)/.test(excerpt);
    case "extraForces":
      return /(?:只受|仅受|只受到|仅受到|没有其他外力|无其他外力|无额外外力|没有额外外力)/.test(excerpt);
    default:
      return true;
  }
}

/** 将模型返回视为未验证数据；文字证据只能证明原文包含该片段，不能证明语义理解正确。 */
export function parsePhysicsExtraction(raw: string, originalText: string, hasImages: boolean):
  | { status: "candidate"; model: SmoothInclineModel | HangingModel | PersonBoardModel | CircuitModel; assumptions: string[]; evidence: Record<string, string> }
  | { status: "needs_review"; reason: string } {
  if (hasImages) return { status: "needs_review", reason: "图片题需先人工确认题面和条件" };
  const value = parseJsonLoose<unknown>(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) return { status: "needs_review", reason: "没有有效的结构化描述" };
  const result = value as Record<string, unknown>;
  if (result.status !== "candidate") return { status: "needs_review", reason: "条件不足或不在已支持范围" };
  if (!result.evidence || typeof result.evidence !== "object" || Array.isArray(result.evidence)) return { status: "needs_review", reason: "缺少题目原文依据" };
  const modelKind = result.model && typeof result.model === "object" ? (result.model as Record<string, unknown>).kind : null;
  if (modelKind === "resistive-circuit") return parseCircuitExtraction(result, originalText);
  const checked = modelKind === "person-board-rest" ? validatePersonBoard(result.model) : modelKind === "hanging-at-rest" ? validateHanging(result.model) : validateSmoothIncline(result.model);
  if (!checked.ok) return { status: "needs_review", reason: checked.reasons.map(describeReason).join("；") };
  const evidence = result.evidence as Record<string, unknown>;
  const fields: Field[] = checked.model.kind === "person-board-rest" ? ["personMassKg", "boardMassKg", "gravity", "tensionN", "setup", "motion", "extraForces"] : checked.model.kind === "hanging-at-rest" ? ["massKg", "gravity", "motion", "rope", "extraForces"] : ["massKg", "angleDeg", "gravity", "surface", "extraForces"];
  for (const field of fields) {
    const declaration = (checked.model as unknown as Record<string, { source: string; value: unknown }>)[field];
    if (declaration.source !== "stated") continue;
    const excerpt = evidence[field];
    if (typeof excerpt !== "string" || !excerpt.trim() || excerpt.length > 200 || !originalText.includes(excerpt)) return { status: "needs_review", reason: `${FIELD_LABEL[field]}缺少可核对的原文依据` };
    // 原文片段包含目标词不等于条件成立；对明显的否定语句直接拒绝。
    const position = originalText.indexOf(excerpt);
    const context = originalText.slice(Math.max(0, position - 6), Math.min(originalText.length, position + excerpt.length + 6));
    const contradiction = field === "motion" ? /(?:不|未|非|并非|不再|不是|并不).{0,4}静止|(?:运动|摆动|加速)/ : field === "surface" ? /(?:不|非|并非|不是|并不).{0,4}光滑|粗糙/ : field === "rope" || field === "setup" ? /(?:不|未|非|并非|不是|并不).{0,4}(?:固定|竖直|绷紧|接触|站)|松弛/ : field === "extraForces" ? /(?:不只|不止|并非只|除了).{0,12}(?:受|力)/ : null;
    if (contradiction?.test(context)) return { status: "needs_review", reason: `${FIELD_LABEL[field]}的原文可能是否定或存在其他条件` };
    if (!evidenceSupports(field, excerpt)) return { status: "needs_review", reason: `${FIELD_LABEL[field]}的原文依据没有明确写出所需条件` };
    if (checked.model.kind === "person-board-rest" && field === "setup") {
      const explicit = [/人/, /板/, /地面/, /水平/, /绳/, /固定/, /竖直/, /绷紧/, /(?:拉|提|拽)(?:着)?人|人.{0,6}(?:受|受到).{0,6}(?:绳|拉力)/];
      if (explicit.some(pattern => !pattern.test(excerpt))) return { status: "needs_review", reason: "人、板、地面和绳的连接条件需要完整原文依据" };
    }
    if (field === "massKg" || field === "angleDeg" || field === "gravity" || field === "personMassKg" || field === "boardMassKg" || field === "tensionN") {
      if (!matchesNumericEvidence(field, excerpt, originalText, declaration.value)) return { status: "needs_review", reason: `${FIELD_LABEL[field]}的数值或单位与原文依据不一致` };
    }
  }
  return { status: "candidate", model: checked.model, assumptions: checked.assumptions, evidence: evidence as Record<string, string> };
}
