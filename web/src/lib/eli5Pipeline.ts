import type { ChatMessage, ContentPart, Eli5State, Grade, PracticeItem } from "./types";
import { extractHtmlDocument, parseJsonLoose } from "./extract";
import { htmlToText } from "./htmlToText";
import { buildEli5ExplainMessages, buildEli5PracticeMessages, type PromptCtx } from "../prompts/eli5";
import { ELI5_PROMPT_VERSION } from "../prompts/eli5Core";
import { throwIfAborted } from "./abort";

// 这是输出协议检查，不是知识正确性、布局或安全性的证明；iframe 沙箱仍是隔离边界。
/** 只允许指向文档内 SVG 片段的 url(...)；带引号的写法也合法，不能被误判为外部资源。 */
function hasUnsafeCssUrl(html: string): boolean {
  const calls = [...html.matchAll(/url\s*\(([^)]*)\)/gi)];
  if (calls.length !== (html.match(/url\s*\(/gi) ?? []).length) return true; // 未闭合等异常写法
  return calls.some(([, inner]) => !/^\s*["']?\s*#/.test(inner));
}

export function checkEli5Html(html: string | null, textOnly = false): string | null {
  if (!html || !/^\s*<!doctype\s+html\s*>/i.test(html) || !/<html\b[^>]*>[\s\S]*<\/html\s*>\s*$/i.test(html) || !/<body\b[^>]*>[\s\S]*<\/body\s*>/i.test(html)) return "需要完整 HTML 文档";
  if (/<\s*(?:script|iframe|object|embed|link|base)\b/i.test(html) || /\son\w+\s*=/i.test(html) || /(?:javascript\s*:|@import\b)/i.test(html) || hasUnsafeCssUrl(html) || /\s(?:src|href|xlink:href)\s*=\s*["']?\s*(?:https?:|\/\/)/i.test(html)) return "包含不允许的脚本或外部资源";
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)?.[1] ?? "";
  if (textOnly && /<\s*(?:svg|canvas|img|picture|video|audio)\b/i.test(html)) return "当前只支持文字讲解，请不要生成图形";
  if (textOnly && !htmlToText(body)) return "讲解页面没有文字内容";
  if (!htmlToText(body) && !/<(?:path|rect|circle|ellipse|line|polyline|polygon)\b/i.test(body)) return "讲解页面没有可展示的内容";
  return null;
}

function parsePractices(text: string, textOnly = false): PracticeItem[] | null {
  const items = parseJsonLoose<unknown>(text);
  if (!Array.isArray(items) || items.length < 3 || items.length > 5) return null;
  if (!items.every((item) => item && typeof item === "object" && ["question", "answer", "analysis"].every((key) => typeof item[key] === "string" && item[key].trim()) && ["持平", "进阶", "培优"].includes(item.difficulty))) return null;
  const ranks = items.map(item => ["持平", "进阶", "培优"].indexOf(item.difficulty));
  if (ranks[0] !== 0 || ranks[ranks.length - 1] !== 2 || !ranks.includes(1) || ranks.some((rank, index) => index > 0 && rank < ranks[index - 1])) return null;
  if (textOnly && items.some(item => [item.question, item.answer, item.analysis].some(value => /!\s*\[|https?:\/\/|<\s*(?:svg|img|canvas|picture|video|audio)\b/i.test(value)))) return null;
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
  textOnly?: boolean;
  call: (messages: ChatMessage[], signal: AbortSignal) => Promise<string>;
  update: (state: Eli5State) => void;
}): Promise<void> {  const { grade, topic, images, ctx, signal, call, update, textOnly = false } = options;
  let state: Eli5State = { stage: "explaining", topic, sourceImageCount: images.length, promptVersion: ELI5_PROMPT_VERSION };
  const save = (patch: Partial<Eli5State>) => { throwIfAborted(signal); state = { ...state, ...patch }; update(state); };
  let msgs: ChatMessage[] = buildEli5ExplainMessages(grade, topic, ctx, { textOnly });
  if (images.length) msgs = [msgs[0], { role: "user", content: [{ type: "text", text: `【要讲的内容】\n${topic}\n这是孩子提供的题目/资料图片，请先读懂图片内容，再按要求讲解。` }, ...images.map((url): ContentPart => ({ type: "image_url", image_url: { url } }))] }];
  let raw = await call(msgs, signal);
  let html = extractHtmlDocument(raw);
  let issue = checkEli5Html(html, textOnly);
  if (issue) {
    msgs = [...msgs, { role: "assistant", content: raw }, { role: "user", content: `上次输出不符合要求：${issue}。请只输出完整 HTML 文档，禁止脚本、外部资源和交互事件。` }];
    raw = await call(msgs, signal);
    html = extractHtmlDocument(raw);
    issue = checkEli5Html(html, textOnly);
  }
  if (issue || !html) { save({ stage: "error", retryLesson: true, error: "讲解页格式检查未通过，请重试或换个模型。" }); return; }
  const clarification = needsClarification(html);
  if (textOnly) {
    const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/i)?.[1] ?? "";
    const blocks = body.replace(/<style\b[\s\S]*?<\/style\s*>/gi, " ").replace(/<\/?(?:p|div|section|article|h[1-6]|li|ul|ol|br|hr)\b[^>]*>/gi, "\n").split(/\n+/).map(htmlToText).filter(Boolean);
    const paragraphs = blocks.map(text => `<p>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")}</p>`).join("");
    html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:18px/1.7 system-ui,sans-serif;color:#1d3330;max-width:860px;margin:auto;padding:24px}main{border-radius:16px;background:#f0f8f3;padding:24px}@media(max-width:480px){body{padding:16px}main{padding:18px}}</style></head><body><main><h1>一起理解这个问题</h1>${paragraphs}</main></body></html>`;
  }
  if (clarification) { save({ html, stage: "clarification" }); return; }
  await runEli5Practice({ grade, topic, images, ctx, signal, call, update, textOnly, initial: { ...state, html } });
}

/**
 * 物理条件无法核对时的明确退路：只生成文字讲解，并强制保留“未核验”标记。
 * 调用方必须在用户可见的提示中说明这不是物理工具核对过的结果。
 */
export async function runEli5UnverifiedFallback(options: Omit<Parameters<typeof runEli5Pipeline>[0], "textOnly" | "update"> & { update: (state: Eli5State) => void }): Promise<void> {
  await runEli5Pipeline({
    ...options,
    textOnly: true,
    update: (state) => options.update({ ...state, physicsUnverified: true, physicsTextOnly: true }),
  });
}

export async function runEli5Practice(options: {
  grade: Grade; topic: string; images: string[]; ctx: PromptCtx; signal: AbortSignal;
  textOnly?: boolean;
  call: (messages: ChatMessage[], signal: AbortSignal) => Promise<string>;
  update: (state: Eli5State) => void; initial: Eli5State;
}): Promise<void> {
  const { grade, topic, images, ctx, signal, call, update, initial, textOnly = false } = options;
  if (!initial.html) throw new Error("没有可用于生成练习的讲解");
  let state = initial;
  const save = (patch: Partial<Eli5State>) => { throwIfAborted(signal); state = { ...state, ...patch }; update(state); };
  save({ stage: "practicing", error: undefined, retryPractice: false, practices: undefined });
  let pmsgs: ChatMessage[] = buildEli5PracticeMessages(grade, topic, htmlToText(initial.html).slice(0, 4000), ctx, { textOnly });
  if (images.length) {
    const last = pmsgs[pmsgs.length - 1];
    if (last.role === "user" && typeof last.content === "string") pmsgs = [...pmsgs.slice(0, -1), { role: "user", content: [{ type: "text", text: last.content }, ...images.map((url): ContentPart => ({ type: "image_url", image_url: { url } }))] }];
  }
  try {
    let praw = await call(pmsgs, signal);
    let practices = parsePractices(praw, textOnly);
    if (!practices) {
      pmsgs = [...pmsgs, { role: "assistant", content: praw }, { role: "user", content: `请只输出 3–5 道练习的 JSON 数组，每项包含非空 question、answer、analysis 和 difficulty。第一题为持平，至少一道进阶，最后一题培优，难度依次不降低。${textOnly ? "只用文字，不得包含图片、图表或图形。" : ""}` }];
      praw = await call(pmsgs, signal);
      practices = parsePractices(praw, textOnly);
    }
    save(practices ? { practices, stage: "done", retryPractice: false } : { stage: "error", retryPractice: true, error: "讲解已生成，但练习格式或难度顺序不符合要求，可以重新生成练习。" });
  } catch (error) {
    throwIfAborted(signal);
    const detail = error instanceof Error && error.message ? `：${error.message}` : "";
    save({ stage: "error", retryPractice: true, error: `讲解已生成，但练习生成失败${detail}` });
  }
}
