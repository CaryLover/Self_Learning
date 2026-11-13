import type { ChatMessage, Grade } from "../types";
import { buildPhysicsExtractionMessages } from "../../prompts/physics";
import { parsePhysicsExtraction } from "./extraction";
import { composeInclineLesson, composeHangingLesson } from "./composeLesson";
import type { SmoothInclineModel } from "./model";
import type { HangingModel } from "./hanging";
import { buildInclinePractices, buildHangingPractices } from "./practice";
import type { PracticeItem } from "../types";
import { throwIfAborted } from "../abort";
import { parseJsonLoose } from "../extract";
import { composePersonBoard, personBoardPractices, type PersonBoardModel, type PersonBoardResult } from "./personBoard";
import type { CircuitModel, CircuitResult } from "./circuit";
import { composeCircuitLesson, buildCircuitPractices } from "./circuitLesson";
export { physicsModelVersion } from "./version";

export type PhysicsModel = SmoothInclineModel | HangingModel | PersonBoardModel | CircuitModel;
export type PhysicsForce = { role: string; direction: [number, number] };
export type PhysicsResult = { status: string; model: string; normal: number; acceleration: number; forces: PhysicsForce[] } | { status: string; model: string; tension: number; forces: PhysicsForce[] } | PersonBoardResult | CircuitResult;
export interface PhysicsRendering {
  svg: string;
  result: PhysicsResult;
  model: PhysicsModel;
  assumptions: string[];
}

/** 调用方必须在发布前完成题面语义审核，候选状态不是教学验收。 */
export async function preparePhysicsLesson(options: {
  topic: string;
  hasImages: boolean;
  allowNotApplicable?: boolean;
  grade?: Grade;
  signal: AbortSignal;
  call: (messages: ChatMessage[], signal: AbortSignal) => Promise<string>;
  render: (model: PhysicsModel) => Promise<PhysicsRendering>;
}): Promise<
  | { status: "candidate"; html: string; practices: PracticeItem[]; model: PhysicsModel; result: PhysicsResult; evidence: Record<string, string>; assumptions: string[] }
  | { status: "needs_review"; reason: string }
  | { status: "not_applicable" }
  | { status: "unsupported" }
> {
  throwIfAborted(options.signal);
  if (options.hasImages) return { status: "needs_review", reason: "图片题需先人工确认题面和条件" };
  const messages = buildPhysicsExtractionMessages(options.topic, options.allowNotApplicable);
  let raw = await options.call(messages, options.signal);
  throwIfAborted(options.signal);
  const recognized = (output: string): boolean => {
    const value = parseJsonLoose<unknown>(output);
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const status = (value as Record<string, unknown>).status;
    return status === "candidate" || status === "needs_review" || (!!options.allowNotApplicable && (status === "not_applicable" || status === "unsupported"));
  };
  if (!recognized(raw)) {
    raw = await options.call([...messages, { role: "assistant", content: raw.slice(0, 4000) }, { role: "user", content: "上次输出格式无法识别。请只返回要求的 JSON；题意不清或条件不足时输出 needs_review，不要猜测。" }], options.signal);
    throwIfAborted(options.signal);
  }
  if (options.allowNotApplicable) {
    const classification = parseJsonLoose<unknown>(raw);
    if (classification && typeof classification === "object" && !Array.isArray(classification)) {
      const data = classification as Record<string, unknown>;
      // 允许附带简短的 reason 等说明；但出现 model 时属于与状态矛盾的结构，交给复核。
      if ((data.status === "not_applicable" || data.status === "unsupported") && !("model" in data)) return { status: data.status };
    }
  }
  const extraction = parsePhysicsExtraction(raw, options.topic, false);
  if (extraction.status !== "candidate") return extraction;
  if (options.allowNotApplicable && options.grade === "junior" && extraction.model.kind !== "hanging-at-rest" && extraction.model.kind !== "resistive-circuit") return { status: "unsupported" };
  const rendered = await options.render(extraction.model);
  throwIfAborted(options.signal);
  // 模板再次按提取结果检查返回值，不能依赖渲染器声称通过。
  const model = extraction.model;
  let html: string;
  let practices: PracticeItem[];
  switch (model.kind) {
    case "person-board-rest":
      html = composePersonBoard(model, rendered.result as PersonBoardResult);
      practices = personBoardPractices(model, rendered.result as PersonBoardResult);
      break;
    case "hanging-at-rest":
      html = composeHangingLesson(model, rendered.result, rendered.svg);
      practices = buildHangingPractices(model, rendered.result);
      break;
    case "resistive-circuit":
      html = composeCircuitLesson(model, rendered.result, rendered.svg);
      practices = buildCircuitPractices(model, rendered.result);
      break;
    case "smooth-incline":
      html = composeInclineLesson(model, rendered.result, rendered.svg);
      practices = buildInclinePractices(model, rendered.result);
      break;
    default: {
      const unsupported: never = model;
      throw new Error(`不支持的物理模型：${unsupported}`);
    }
  }
  return { status: "candidate", html, practices, model: extraction.model, result: rendered.result, evidence: extraction.evidence, assumptions: extraction.assumptions };
}
