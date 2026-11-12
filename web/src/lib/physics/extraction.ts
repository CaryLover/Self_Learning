import { parseJsonLoose } from "../extract";
import { validateSmoothIncline, type SmoothInclineModel } from "./model";
import { validateHanging, type HangingModel } from "./hanging";
import { validatePersonBoard, type PersonBoardModel } from "./personBoard";

type Field = "massKg" | "angleDeg" | "gravity" | "surface" | "extraForces" | "motion" | "rope" | "personMassKg" | "boardMassKg" | "tensionN" | "setup";

/** 将模型返回视为未验证数据；文字证据只能证明原文包含该片段，不能证明语义理解正确。 */
export function parsePhysicsExtraction(raw: string, originalText: string, hasImages: boolean):
  | { status: "candidate"; model: SmoothInclineModel | HangingModel | PersonBoardModel; assumptions: string[]; evidence: Record<string, string> }
  | { status: "needs_review"; reason: string } {
  if (hasImages) return { status: "needs_review", reason: "图片题需先人工确认题面和条件" };
  const value = parseJsonLoose<unknown>(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) return { status: "needs_review", reason: "没有有效的结构化描述" };
  const result = value as Record<string, unknown>;
  if (result.status !== "candidate") return { status: "needs_review", reason: "条件不足或不在已支持范围" };
  if (!result.evidence || typeof result.evidence !== "object" || Array.isArray(result.evidence)) return { status: "needs_review", reason: "缺少题目原文依据" };
  const modelKind = result.model && typeof result.model === "object" ? (result.model as Record<string, unknown>).kind : null;
  const checked = modelKind === "person-board-rest" ? validatePersonBoard(result.model) : modelKind === "hanging-at-rest" ? validateHanging(result.model) : validateSmoothIncline(result.model);
  if (!checked.ok) return { status: "needs_review", reason: checked.reasons.join("；") };
  const evidence = result.evidence as Record<string, unknown>;
  const fields: Field[] = checked.model.kind === "person-board-rest" ? ["personMassKg", "boardMassKg", "gravity", "tensionN", "setup", "motion", "extraForces"] : checked.model.kind === "hanging-at-rest" ? ["massKg", "gravity", "motion", "rope", "extraForces"] : ["massKg", "angleDeg", "gravity", "surface", "extraForces"];
  for (const field of fields) {
    const declaration = (checked.model as unknown as Record<string, { source: string; value: unknown }>)[field];
    if (declaration.source !== "stated") continue;
    const excerpt = evidence[field];
    if (typeof excerpt !== "string" || !excerpt.trim() || excerpt.length > 200 || !originalText.includes(excerpt)) return { status: "needs_review", reason: `${field} 缺少可核对的原文依据` };
    // 原文片段包含目标词不等于条件成立；对明显的否定语句直接拒绝。
    const position = originalText.indexOf(excerpt);
    const context = originalText.slice(Math.max(0, position - 6), Math.min(originalText.length, position + excerpt.length + 6));
    const contradiction = field === "motion" ? /(?:不|未|非|并非|不再|不是|并不).{0,4}静止|(?:运动|摆动|加速)/ : field === "surface" ? /(?:不|非|并非|不是|并不).{0,4}光滑|粗糙/ : field === "rope" || field === "setup" ? /(?:不|未|非|并非|不是|并不).{0,4}(?:固定|竖直|绷紧|接触|站)|松弛/ : field === "extraForces" ? /(?:不只|不止|并非只|除了).{0,12}(?:受|力)/ : null;
    if (contradiction?.test(context)) return { status: "needs_review", reason: `${field} 的原文可能是否定或存在其他条件` };
    if (checked.model.kind === "person-board-rest" && field === "setup") {
      const explicit = [/人/, /板/, /地面/, /水平/, /绳/, /固定/, /竖直/, /绷紧/, /(?:拉|提|拽)(?:着)?人|人.{0,6}(?:受|受到).{0,6}(?:绳|拉力)/];
      if (explicit.some(pattern => !pattern.test(excerpt))) return { status: "needs_review", reason: "人、板、地面和绳的连接条件需要完整原文依据" };
    }
    if (checked.model.kind === "person-board-rest" && field === "extraForces" && !/(?:只受|仅受|没有其他外力|无其他外力|无额外外力)/.test(excerpt)) return { status: "needs_review", reason: "需要题面明确排除其他外力" };
    if (field === "massKg" || field === "angleDeg" || field === "gravity" || field === "personMassKg" || field === "boardMassKg" || field === "tensionN") {
      const numbers = excerpt.match(/(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][+-]?\d+)?/g) ?? [];
      if (!numbers.some(value => Number(value) === declaration.value)) return { status: "needs_review", reason: `${field} 的数值与原文依据不一致` };
    }
  }
  return { status: "candidate", model: checked.model, assumptions: checked.assumptions, evidence: evidence as Record<string, string> };
}
