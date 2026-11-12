import { validateSmoothIncline, type SmoothInclineModel } from "./model";
import { verifyForceDirections } from "./vectors";

/** 仅接受校验过的数值；物体名称等自由文本不进入 Typst 源码。 */
export function makeInclineSource(input: unknown): { source: string; model: SmoothInclineModel; assumptions: string[] } {
  const checked = validateSmoothIncline(input);
  if (!checked.ok) throw new Error(checked.reasons.join("；"));
  const m = checked.model;
  const source = `#import "@preview/typed-physics:0.3.0": *
#let s = situation(ramp("slope", angle: ${m.angleDeg.value}deg, length: 7), block("A", mass: ${m.massKg.value}, on: "slope", at: 55%), gravity: ${m.gravity.value})
#let result = results(s, "A")
#metadata((status: result.status, model: result.model, normal: result.normal.value, acceleration: result.acceleration.value, forces: forces(s, "A").map(f => (role: f.role, direction: f.direction)))) <physics-result>
#scene(s)
#fbd(s, "A", axes: false)`;
  return { source, model: m, assumptions: checked.assumptions };
}

/** 检查库求解状态及与独立解析解的一致性，不能证明题目解析正确。 */
export function verifyInclineResult(model: SmoothInclineModel, value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.status !== "solved" || v.model !== "single-contact-body" || typeof v.normal !== "number" || typeof v.acceleration !== "number" || !Number.isFinite(v.normal) || !Number.isFinite(v.acceleration)) return false;
  const angle = model.angleDeg.value * Math.PI / 180;
  const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(1e-6 * Math.abs(b), 100 * Number.MIN_VALUE);
  return close(v.normal, model.massKg.value * model.gravity.value * Math.cos(angle)) && close(v.acceleration, model.gravity.value * Math.sin(angle)) && verifyForceDirections(v.forces, { weight: [0, -1], normal: [-Math.sin(angle), Math.cos(angle)] });
}
