import type { ChatMessage, ContentPart, Eli5State, Grade, PracticeItem } from "./types";
import { extractHtmlDocument, parseJsonLoose } from "./extract";
import { htmlToText } from "./markdown";
import { buildEli5ExplainMessages, buildEli5PracticeMessages, type PromptCtx } from "../prompts/eli5";
import { ELI5_PROMPT_VERSION } from "../prompts/eli5Core";
import { throwIfAborted } from "./abort";

// 这是输出协议检查，不是知识正确性、布局或安全性的证明；iframe 沙箱仍是隔离边界。
export function checkEli5Html(html: string | null): string | null {
  if (!html || !/^\s*<!doctype\s+html\s*>/i.test(html) || !/<html\b[^>]*>[\s\S]*<\/html\s*>\s*$/i.test(html) || !/<body\b[^>]*>[\s\S]*<\/body\s*>/i.test(html)) return "需要完整 HTML 文档";
  if (/<\s*(?:script|iframe|object|embed|link|base)\b/i.test(html) || /\son\w+\s*=/i.test(html) || /(?:javascript\s*:|@import\b|url\s*\(\s*["']?\s*(?!#))/i.test(html) || /\s(?:src|href|xlink:href)\s*=\s*["']?\s*(?:https?:|\/\/)/i.test(html)) return "包含不允许的脚本或外部资源";
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)?.[1] ?? "";
  if (!htmlToText(body) && !/<(?:path|rect|circle|ellipse|line|polyline|polygon)\b/i.test(body)) return "讲解页面没有可展示的内容";
  return null;
}

function parsePractices(text: string): PracticeItem[] | null {
  const items = parseJsonLoose<unknown>(text);
  if (!Array.isArray(items) || items.length < 3 || items.length > 5) return null;
  if (!items.every((item) => item && typeof item === "object" && ["question", "answer", "analysis"].every((key) => typeof item[key] === "string" && item[key].trim()) && ["持平", "进阶", "培优"].includes(item.difficulty))) return null;
  return items as PracticeItem[];
}

function needsClarification(html: string): boolean {
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i)?.[1] ?? "";
  return (head.match(/<meta\b[^>]*>/gi) ?? []).some(tag =>
    /\bname\s*=\s*["']eli5-input-status["']/i.test(tag) && /\bcontent\s*=\s*["']needs-clarification["']/i.test(tag),
  );
}

export async function runEli5Pipeline(options: {
  grade: Grade; topic: string; images: string[]; ctx: PromptCtx; signal: AbortSignal;
  call: (messages: ChatMessage[], signal: AbortSignal) => Promise<string>;
  update: (state: Eli5State) => void;
}): Promise<void> {
  const { grade, topic, images, ctx, signal, call, update } = options;
  let state: Eli5State = { stage: "explaining", topic, promptVersion: ELI5_PROMPT_VERSION };
  const save = (patch: Partial<Eli5State>) => { throwIfAborted(signal); state = { ...state, ...patch }; update(state); };
  let msgs: ChatMessage[] = buildEli5ExplainMessages(grade, topic, ctx);
  if (images.length) msgs = [msgs[0], { role: "user", content: [{ type: "text", text: `【要讲的内容】\n${topic}\n这是孩子提供的题目/资料图片，请先读懂图片内容，再按要求讲解。` }, ...images.map((url): ContentPart => ({ type: "image_url", image_url: { url } }))] }];
  let raw = await call(msgs, signal);
  let html = extractHtmlDocument(raw);
  let issue = checkEli5Html(html);
  if (issue) {
    msgs = [...msgs, { role: "assistant", content: raw }, { role: "user", content: `上次输出不符合要求：${issue}。请只输出完整 HTML 文档，禁止脚本、外部资源和交互事件。` }];
    raw = await call(msgs, signal);
    html = extractHtmlDocument(raw);
    issue = checkEli5Html(html);
  }
  if (issue || !html) { save({ stage: "error", error: "讲解页格式检查未通过，请重试或换个模型。" }); return; }
  if (needsClarification(html)) { save({ html, stage: "clarification" }); return; }
  await runEli5Practice({ grade, topic, images, ctx, signal, call, update, initial: { ...state, html } });
}

export async function runEli5Practice(options: {
  grade: Grade; topic: string; images: string[]; ctx: PromptCtx; signal: AbortSignal;
  call: (messages: ChatMessage[], signal: AbortSignal) => Promise<string>;
  update: (state: Eli5State) => void; initial: Eli5State;
}): Promise<void> {
  const { grade, topic, images, ctx, signal, call, update, initial } = options;
  if (!initial.html) throw new Error("没有可用于生成练习的讲解");
  let state = initial;
  const save = (patch: Partial<Eli5State>) => { throwIfAborted(signal); state = { ...state, ...patch }; update(state); };
  save({ stage: "practicing", error: undefined, retryPractice: false, practices: undefined });
  let pmsgs: ChatMessage[] = buildEli5PracticeMessages(grade, topic, htmlToText(initial.html).slice(0, 4000), ctx);
  if (images.length) {
    const last = pmsgs[pmsgs.length - 1];
    if (last.role === "user" && typeof last.content === "string") pmsgs = [...pmsgs.slice(0, -1), { role: "user", content: [{ type: "text", text: last.content }, ...images.map((url): ContentPart => ({ type: "image_url", image_url: { url } }))] }];
  }
  try {
    let praw = await call(pmsgs, signal);
    let practices = parsePractices(praw);
    if (!practices) {
      pmsgs = [...pmsgs, { role: "assistant", content: praw }, { role: "user", content: "请只输出 3–5 道练习的 JSON 数组，每项包含非空 question、answer、analysis 和 difficulty（持平、进阶或培优）。" }];
      praw = await call(pmsgs, signal);
      practices = parsePractices(praw);
    }
    save(practices ? { practices, stage: "done", retryPractice: false } : { stage: "error", retryPractice: true, error: "讲解已生成，但练习格式不正确，可以重新生成练习。" });
  } catch (error) {
    throwIfAborted(signal);
    const detail = error instanceof Error && error.message ? `：${error.message}` : "";
    save({ stage: "error", retryPractice: true, error: `讲解已生成，但练习生成失败${detail}` });
  }
}
