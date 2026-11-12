/** 输入是待验证的题目解释，不代表题意已被证实。 */
export interface DeclaredValue<T> {
  value: T;
  source: "stated" | "assumed";
}

/** 首个验证范围：只有一个物块、光滑固定斜面和重力，不包含额外外力。 */
export interface SmoothInclineModel {
  kind: "smooth-incline";
  objectName: string;
  massKg: DeclaredValue<number>;
  angleDeg: DeclaredValue<number>;
  gravity: DeclaredValue<number>;
  surface: DeclaredValue<"fixed-smooth">;
  extraForces: DeclaredValue<"none">;
  requested: Array<"forces" | "normal" | "acceleration">;
}

export type ValidationResult =
  | { ok: true; model: SmoothInclineModel; assumptions: string[] }
  | { ok: false; reasons: string[] };

const keys = ["kind", "objectName", "massKg", "angleDeg", "gravity", "surface", "extraForces", "requested"];
const targets = ["forces", "normal", "acceleration"];
function record(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function declaration(v: unknown): v is Record<string, unknown> & { source: "stated" | "assumed"; value: unknown } {
  return record(v) && Object.keys(v).every(k => k === "source" || k === "value") && (v.source === "stated" || v.source === "assumed") && "value" in v;
}

export function validateSmoothIncline(input: unknown): ValidationResult {
  if (!record(input)) return { ok: false, reasons: ["物理描述必须是对象"] };
  const reasons: string[] = [];
  if (Object.keys(input).some(k => !keys.includes(k))) reasons.push("存在无法处理的条件或字段");
  if (input.kind !== "smooth-incline") reasons.push("不在当前验证模型范围内");
  if (typeof input.objectName !== "string" || !input.objectName.trim() || input.objectName.length > 40) reasons.push("需要明确的研究对象");
  for (const [name, min, max] of [["massKg", 0, 1e6], ["angleDeg", 0, 90], ["gravity", 0, 100]] as const) {
    const item = input[name];
    if (!declaration(item) || typeof item.value !== "number" || !Number.isFinite(item.value) || item.value <= min || item.value >= max) reasons.push(`${name} 缺失或超出支持范围`);
    else if (name !== "gravity" && item.source !== "stated") reasons.push(`${name} 必须由题目明确给出`);
  }
  for (const [name, expected] of [["surface", "fixed-smooth"], ["extraForces", "none"]] as const) {
    const item = input[name];
    if (!declaration(item) || item.value !== expected || item.source !== "stated") reasons.push(`${name} 必须由题目明确给出`);
  }
  if (!Array.isArray(input.requested) || input.requested.length === 0 || input.requested.some(v => typeof v !== "string" || !targets.includes(v)) || new Set(input.requested).size !== input.requested.length) reasons.push("待求内容缺失或超出支持范围");
  if (reasons.length) return { ok: false, reasons };
  const model = input as unknown as SmoothInclineModel;
  const assumptions = (["massKg", "angleDeg", "gravity"] as const).filter(k => model[k].source === "assumed");
  return { ok: true, model, assumptions };
}
