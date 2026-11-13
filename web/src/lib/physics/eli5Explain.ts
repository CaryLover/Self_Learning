import type { ChatMessage, Eli5State, Grade } from "../types";
import { parseJsonLoose } from "../extract";
import { htmlToText } from "../htmlToText";
import { throwIfAborted } from "../abort";
import { ELI5_CORE } from "../../prompts/eli5Core";
import { curriculumRule } from "../grade";
import type { PromptCtx } from "../../prompts/eli5";
import type { preparePhysicsLesson } from "./pipeline";
import type { CircuitNode } from "./circuit";
import { validateSmoothIncline } from "./model";
import { validateHanging } from "./hanging";
import { validateCircuit } from "./circuit";
import { validatePersonBoard, composePersonBoard, personBoardPractices, type PersonBoardResult } from "./personBoard";
import { composeInclineLesson, composeHangingLesson } from "./composeLesson";
import { composeCircuitLesson, buildCircuitPractices } from "./circuitLesson";
import { buildInclinePractices, buildHangingPractices } from "./practice";
import { physicsModelVersion } from "./version";

type Candidate = Extract<Awaited<ReturnType<typeof preparePhysicsLesson>>, { status: "candidate" }>;

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** 重试讲解只恢复已保存的物理图、事实和练习，不重新计算。 */
export function restorePhysicsCandidate(state: Eli5State): Candidate | null {
  const preview = state.physicsPreview;
  if (!state.retryPhysicsExplanation || !state.html || !preview || !state.pendingPhysicsPractices || /class=["']eli5-physics-explanation["']/i.test(state.html)) return null;
  try {
    const model = preview.model;
    if (!model || typeof model !== "object") return null;
    const expectedVersion = physicsModelVersion(model.kind);
    if (preview.modelVersion !== expectedVersion) return null;
    const svg = state.html.match(/<div class="diagram">([\s\S]*?)<\/div>/)?.[1] ?? "";
    let html: string;
    let practices;
    let assumptions: string[];
    switch (model.kind) {
      case "smooth-incline": {
        const checked = validateSmoothIncline(model);
        if (!checked.ok) return null;
        html = composeInclineLesson(model, preview.result, svg);
        practices = buildInclinePractices(model, preview.result);
        assumptions = checked.assumptions;
        break;
      }
      case "hanging-at-rest": {
        const checked = validateHanging(model);
        if (!checked.ok) return null;
        html = composeHangingLesson(model, preview.result, svg);
        practices = buildHangingPractices(model, preview.result);
        assumptions = checked.assumptions;
        break;
      }
      case "resistive-circuit": {
        if (!validateCircuit(model).ok) return null;
        html = composeCircuitLesson(model, preview.result, svg);
        practices = buildCircuitPractices(model, preview.result);
        assumptions = [];
        break;
      }
      case "person-board-rest": {
        const checked = validatePersonBoard(model);
        if (!checked.ok) return null;
        html = composePersonBoard(model, preview.result as PersonBoardResult);
        practices = personBoardPractices(model, preview.result as PersonBoardResult);
        assumptions = checked.assumptions;
        break;
      }
      default: return null;
    }
    if (html !== state.html || JSON.stringify(assumptions) !== JSON.stringify(preview.assumptions)) return null;
    return { status: "candidate", html, practices, model, result: preview.result, evidence: preview.evidence, assumptions };
  } catch {
    return null;
  }
}

/** 补充讲解失败时，保留已核对的物理图、事实和固定练习，允许跳过模型讲解。 */
export function finishPhysicsWithoutExplanation(state: Eli5State): Eli5State | null {
  const candidate = restorePhysicsCandidate(state);
  if (!candidate) return null;
  return {
    ...state,
    stage: "done",
    html: candidate.html,
    practices: candidate.practices,
    pendingPhysicsPractices: undefined,
    retryPhysicsExplanation: false,
    retryLesson: false,
    error: undefined,
  };
}

/** 图和核对结果由程序提供；模型只生成补充讲解，不接收或修改图形源码。 */
export async function addEli5PhysicsExplanation(options: {
  candidate: Candidate;
  topic: string;
  grade: Grade;
  ctx: PromptCtx;
  signal: AbortSignal;
  call: (messages: ChatMessage[], signal: AbortSignal) => Promise<string>;
}): Promise<Candidate> {
  const { candidate, topic, grade, ctx, signal, call } = options;
  throwIfAborted(signal);
  const labels: string[] = [];
  if (candidate.model.kind === "resistive-circuit") {
    const collect = (node: CircuitNode): void => {
      if (node.kind === "resistor") labels.push(node.id);
      else node.children.forEach(collect);
    };
    collect(candidate.model.network);
  }
  const numbersRule = labels.length ? `可使用题目提供的电阻名称（${labels.join("、")}），不得写其他数字或公式。` : "不要生成数字或公式。";
  const messages: ChatMessage[] = [
    { role: "system", content: `${ELI5_CORE}\n${curriculumRule(grade, ctx.gradeLevel)}\n\n请根据给定的物理事实组织图解讲解。把学生看作第一次接触主题的人，用简短口语解释如何读图和理解结果。程序已初步核对候选条件与计算结果，题意和图文仍需人工复核。不能修改或省略条件、不能引入新的物体、元件、力或假设，也不能添加新的计算结果。HTML 页面、图和数值由程序组装；本次只提供讲解文字，不要生成 HTML、SVG 或代码。${numbersRule}若无法在给定事实范围内讲解，输出 {"status":"needs_review"}。否则只输出 JSON：{"status":"ok","intro":"一句话引导","steps":["第一步","第二步"],"summary":"一句话总结"}，steps 为 2 到 4 个简短字符串。` },
    { role: "user", content: JSON.stringify({ question: topic, model: candidate.model, result: candidate.result, assumptions: candidate.assumptions, diagramDescription: htmlToText(candidate.html).slice(0, 4000) }) },
  ];
  const text = (value: unknown): value is string => {
    if (typeof value !== "string" || !value.trim() || value.length > 400) return false;
    const withoutLabels = labels.reduce((text, label) => text.replace(new RegExp(`\\b${label}\\b`, "g"), ""), value);
    return !/[\u0000-\u001f\u007f0-9０-９]/.test(withoutLabels);
  };
  function parse(raw: string): { status: "ok"; intro: string; steps: string[]; summary: string } | { status: "needs_review" | "invalid" } {
    const value = parseJsonLoose<unknown>(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return { status: "invalid" };
    const data = value as Record<string, unknown>;
    if (data.status === "needs_review") return { status: "needs_review" };
    if (data.status !== "ok" || !text(data.intro) || !text(data.summary) || !Array.isArray(data.steps) || data.steps.length < 2 || data.steps.length > 4 || !data.steps.every(text)) return { status: "invalid" };
    return { status: "ok", intro: data.intro, steps: data.steps, summary: data.summary };
  }
  let raw = await call(messages, signal);
  throwIfAborted(signal);
  let data = parse(raw);
  if (data.status === "invalid") {
    raw = await call([...messages, { role: "assistant", content: raw }, { role: "user", content: `上次格式不符合要求。请只返回符合格式的 JSON，不要包含代码。${numbersRule}不能可靠讲解时返回 needs_review。` }], signal);
    throwIfAborted(signal);
    data = parse(raw);
  }
  if (data.status === "needs_review") throw new Error("物理讲解需要复核，已保留物理图和结果。");
  if (data.status !== "ok") throw new Error("物理讲解未通过格式检查，请重试或换个模型。");
  const block = `<section class="eli5-physics-explanation"><h2>一起读懂这幅图</h2><p>${escape(data.intro)}</p><ol>${data.steps.map(step => `<li>${escape(step)}</li>`).join("")}</ol><p>${escape(data.summary)}</p></section>`;
  if ((candidate.html.match(/<\/main\s*>/gi) ?? []).length !== 1) throw new Error("物理讲解页面格式不正确");
  return { ...candidate, html: candidate.html.replace(/<\/main\s*>/i, () => `${block}</main>`) };
}
