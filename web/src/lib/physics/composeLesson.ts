import { validateSmoothIncline } from "./model";
import { verifyInclineResult } from "./typedSource";
import { validateHanging, verifyHangingResult } from "./hanging";

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** 把原题放在固定页面顶部，方便学生对照题目与图形；只做长度限制和转义。 */
function questionBlock(topic?: string): string {
  const text = topic?.trim();
  return text ? `<p><strong>题目：</strong>${escape(text.slice(0, 500))}</p>` : "";
}

/** Keep the static Typst drawing, while removing its hidden text layer and scripts. */
export function sanitizePhysicsSvg(svg: string): string {
  if (/<\s*script\b[^>]*\bsrc\s*=/i.test(svg)) throw new Error("物理图包含外部脚本");
  const graphic = svg.replace(/<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject\s*>/gi, "").replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "");
  if (!/^\s*<svg\b/i.test(graphic) || !/<\/svg>\s*$/i.test(graphic) || /<\s*(?:script|foreignObject|iframe)\b|\son\w+\s*=|javascript:|\s(?:href|xlink:href|src)\s*=\s*["']\s*(?:https?:|\/\/|data:)/i.test(graphic)) throw new Error("物理图格式不安全");
  return graphic;
}

/** 原型模板：图和说明来自同一已校验模型；调用方仍需确认模型与题面一致。 */
export function composeInclineLesson(input: unknown, result: unknown, svg: string, topic?: string): string {
  const checked = validateSmoothIncline(input);
  if (!checked.ok || !verifyInclineResult(checked.model, result)) throw new Error("物理结果未通过检查");
  const graphic = sanitizePhysicsSvg(svg);
  const m = checked.model;
  const r = result as { normal: number; acceleration: number };
  const fmt = (n: number) => Number(n.toPrecision(4)).toString();
  const assumptionNames: Record<string, string> = { massKg: "质量", angleDeg: "斜面角度", gravity: "重力加速度" };
  const assumptionText = checked.assumptions.length ? `其中${checked.assumptions.map(k => assumptionNames[k]).join("、")}为补充假设，请先确认。` : "";
  const object = escape(m.objectName);
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{font:18px/1.6 system-ui,sans-serif;color:#1d3330;margin:0;padding:24px}main{max-width:860px;margin:auto}h1{font-size:1.5rem}.diagram{border:1px solid #d5e6de;border-radius:12px;padding:16px}.diagram svg{display:block;width:min(100%,520px);height:auto;margin:auto}.legend{display:flex;flex-wrap:wrap;gap:12px 24px;padding:16px 0}.item{border-left:4px solid #557;padding-left:10px}li{margin:.5rem 0}p{margin:.6rem 0}@media(max-width:480px){body{padding:16px}}
</style></head><body><main><h1>光滑斜面上的 ${object}</h1>${questionBlock(topic)}<p>先选 ${object} 作研究对象，图中的 A 代表 ${object}。</p><div class="diagram">${graphic}</div><div class="legend"><div class="item">W：重力，竖直向下</div><div class="item">N：斜面的支持力，垂直斜面向外</div></div><ul><li>斜面光滑，不考虑摩擦力；本模型没有额外外力。</li><li>质量 ${m.massKg.value} kg，斜面角度 ${m.angleDeg.value}°，重力加速度 ${m.gravity.value} m/s²。${assumptionText}</li><li>支持力 N = mg cosθ，约 ${fmt(r.normal)} N。</li><li>沿斜面向下的加速度 a = g sinθ，约 ${fmt(r.acceleration)} m/s²。</li></ul><p>重力竖直向下，支持力垂直于斜面；加速度沿斜面向下。</p></main></body></html>`;
}

/** 悬挂物必须已明确静止、绳子竖直绷紧并固定，不能把库的默认假定当作题目条件。 */
export function composeHangingLesson(input: unknown, result: unknown, svg: string, topic?: string): string {
  const checked = validateHanging(input);
  if (!checked.ok || !verifyHangingResult(checked.model, result)) throw new Error("物理结果未通过检查");
  const graphic = sanitizePhysicsSvg(svg);
  const model = checked.model;
  const tension = (result as { tension: number }).tension;
  const assumptionText = checked.assumptions.length ? "重力加速度为补充假设，请先确认。" : "";
  const object = escape(model.objectName);
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:18px/1.6 system-ui,sans-serif;color:#1d3330;margin:0;padding:24px}main{max-width:860px;margin:auto}h1{font-size:1.5rem}.diagram{border:1px solid #d5e6de;border-radius:12px;padding:16px}.diagram svg{display:block;width:min(100%,520px);height:auto;margin:auto}.legend{display:flex;flex-wrap:wrap;gap:12px 24px;padding:16px 0}.item{border-left:4px solid #557;padding-left:10px}li{margin:.5rem 0}@media(max-width:480px){body{padding:16px}}</style></head><body><main><h1>竖直悬挂的 ${object}</h1>${questionBlock(topic)}<p>先选 ${object} 作研究对象，图中的 A 代表 ${object}。</p><div class="diagram">${graphic}</div><div class="legend"><div class="item">W：重力，竖直向下</div><div class="item">T：绳的拉力，沿绳竖直向上</div></div><ul><li>物块静止，绳子竖直绷紧且固定，没有额外外力。</li><li>质量 ${model.massKg.value} kg，重力加速度 ${model.gravity.value} m/s²。${assumptionText}</li><li>竖直方向受力平衡，拉力 T = mg，约 ${Number(tension.toPrecision(4))} N。</li></ul><p>两个力作用于同一物体，方向相反，大小相等。</p></main></body></html>`;
}
