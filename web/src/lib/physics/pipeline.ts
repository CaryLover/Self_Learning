import type { ChatMessage } from "../types";
import { buildPhysicsExtractionMessages } from "../../prompts/physics";
import { parsePhysicsExtraction } from "./extraction";
import { composeInclineLesson, composeHangingLesson } from "./composeLesson";
import type { SmoothInclineModel } from "./model";
import type { HangingModel } from "./hanging";
import { buildInclinePractices, buildHangingPractices } from "./practice";
import type { PracticeItem } from "../types";
import { throwIfAborted } from "../abort";

export type PhysicsModel = SmoothInclineModel | HangingModel;
export type PhysicsForce = { role: string; direction: [number, number] };
export type PhysicsResult = { status: string; model: string; normal: number; acceleration: number; forces: PhysicsForce[] } | { status: string; model: string; tension: number; forces: PhysicsForce[] };
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
  signal: AbortSignal;
  call: (messages: ChatMessage[], signal: AbortSignal) => Promise<string>;
  render: (model: PhysicsModel) => Promise<PhysicsRendering>;
}): Promise<
  | { status: "candidate"; html: string; practices: PracticeItem[]; model: PhysicsModel; result: PhysicsResult; evidence: Record<string, string>; assumptions: string[] }
  | { status: "needs_review"; reason: string }
> {
  throwIfAborted(options.signal);
  if (options.hasImages) return { status: "needs_review", reason: "图片题需先人工确认题面和条件" };
  const raw = await options.call(buildPhysicsExtractionMessages(options.topic), options.signal);
  throwIfAborted(options.signal);
  const extraction = parsePhysicsExtraction(raw, options.topic, false);
  if (extraction.status !== "candidate") return extraction;
  const rendered = await options.render(extraction.model);
  throwIfAborted(options.signal);
  // 模板再次按提取结果检查返回值，不能依赖渲染器声称通过。
  const html = extraction.model.kind === "hanging-at-rest" ? composeHangingLesson(extraction.model, rendered.result, rendered.svg) : composeInclineLesson(extraction.model, rendered.result, rendered.svg);
  const practices = extraction.model.kind === "hanging-at-rest" ? buildHangingPractices(extraction.model, rendered.result) : buildInclinePractices(extraction.model, rendered.result);
  return { status: "candidate", html, practices, model: extraction.model, result: rendered.result, evidence: extraction.evidence, assumptions: extraction.assumptions };
}
