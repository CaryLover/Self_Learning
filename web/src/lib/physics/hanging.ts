import type { DeclaredValue } from "./model";
import { verifyForceDirections } from "./vectors";

export interface HangingModel {
  kind: "hanging-at-rest";
  objectName: string;
  massKg: DeclaredValue<number>;
  gravity: DeclaredValue<number>;
  motion: DeclaredValue<"rest">;
  rope: DeclaredValue<"vertical-taut-fixed">;
  extraForces: DeclaredValue<"none">;
  requested: Array<"forces" | "tension">;
}
type Dict = Record<string, unknown>;
const isDict = (x: unknown): x is Dict => !!x && typeof x === "object" && !Array.isArray(x);
const isDeclaration = (x: unknown): x is Dict & { source: "stated" | "assumed"; value: unknown } => isDict(x) && Object.keys(x).every(k => k === "source" || k === "value") && (x.source === "stated" || x.source === "assumed") && "value" in x;

export function validateHanging(input: unknown): { ok: true; model: HangingModel; assumptions: string[] } | { ok: false; reasons: string[] } {
  if (!isDict(input)) return { ok: false, reasons: ["物理描述必须是对象"] };
  const reasons: string[] = [];
  const keys = ["kind", "objectName", "massKg", "gravity", "motion", "rope", "extraForces", "requested"];
  if (Object.keys(input).some(k => !keys.includes(k)) || input.kind !== "hanging-at-rest") reasons.push("不在当前验证模型范围内");
  if (typeof input.objectName !== "string" || !input.objectName.trim() || input.objectName.length > 40) reasons.push("需要明确的研究对象");
  for (const [key, upper] of [["massKg", 1e6], ["gravity", 100]] as const) {
    const item = input[key];
    if (!isDeclaration(item) || typeof item.value !== "number" || !Number.isFinite(item.value) || item.value <= 0 || item.value >= upper || (key === "massKg" && item.source !== "stated")) reasons.push(`${key} 缺失或超出支持范围`);
  }
  for (const [key, value] of [["motion", "rest"], ["rope", "vertical-taut-fixed"], ["extraForces", "none"]] as const) {
    const item = input[key];
    if (!isDeclaration(item) || item.source !== "stated" || item.value !== value) reasons.push(`${key} 必须由题目明确给出`);
  }
  if (!Array.isArray(input.requested) || !input.requested.length || input.requested.some(x => x !== "forces" && x !== "tension") || new Set(input.requested).size !== input.requested.length) reasons.push("待求内容缺失或超出支持范围");
  if (reasons.length) return { ok: false, reasons };
  const model = input as unknown as HangingModel;
  return { ok: true, model, assumptions: model.gravity.source === "assumed" ? ["gravity"] : [] };
}

export function makeHangingSource(input: unknown) {
  const checked = validateHanging(input);
  if (!checked.ok) throw new Error(checked.reasons.join("；"));
  const m = checked.model;
  return { ...checked, source: `#import "@preview/typed-physics:0.3.0": *
#let s = situation(ceiling("top", length: 6, height: 4), block("A", mass: ${m.massKg.value}, hanging: "top", drop: 1.5), gravity: ${m.gravity.value})
#let result = results(s, "A")
#metadata((status: result.status, model: result.model, tension: result.tension.value, forces: forces(s, "A").map(f => (role: f.role, direction: f.direction)))) <physics-result>
#scene(s)
#fbd(s, "A", axes: false)` };
}

export function verifyHangingResult(model: HangingModel, input: unknown): boolean {
  if (!isDict(input) || input.status !== "solved" || input.model !== "hanging-body" || typeof input.tension !== "number" || !Number.isFinite(input.tension)) return false;
  const expected = model.massKg.value * model.gravity.value;
  return Math.abs(input.tension - expected) <= Math.max(Math.abs(expected) * 1e-6, 100 * Number.MIN_VALUE) && verifyForceDirections(input.forces, { weight: [0, -1], tension: [0, 1] });
}
