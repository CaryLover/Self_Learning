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
  return null;
}

function parsePractices(text: string): PracticeItem[] | null {
  const items = parseJsonLoose<unknown>(text);
  if (!Array.isArray(items) || items.length < 3 || items.length > 5) return null;
  if (!items.every((item) => item && typeof item === "object" && ["question", "answer", "analysis"].every((key) => typeof item[key] === "string" && item[key].trim()) && ["持平", "进阶", "培优"].includes(item.difficulty))) return null;
  return items as PracticeItem[];
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
  if (images.length) msgs = [...msgs, { role: "user", content: [{ type: "text", text: "这是孩子提供的题目/资料图片，请先读懂图片内容，再按要求讲解。" }, ...images.map((url): ContentPart => ({ type: "image_url", image_url: { url } }))] }];
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
  save({ html, stage: "practicing" });
  let pmsgs: ChatMessage[] = buildEli5PracticeMessages(grade, topic, htmlToText(html).slice(0, 4000), ctx);
  let praw = await call(pmsgs, signal);
  let practices = parsePractices(praw);
  if (!practices) {
    pmsgs = [...pmsgs, { role: "assistant", content: praw }, { role: "user", content: "请只输出 3–5 道练习的 JSON 数组，每项包含非空 question、answer、analysis 和 difficulty（持平、进阶或培优）。" }];
    praw = await call(pmsgs, signal);
    practices = parsePractices(praw);
  }
  save(practices ? { practices, stage: "done" } : { stage: "error", error: "练习生成失败，请重试或换个模型。" });
}
