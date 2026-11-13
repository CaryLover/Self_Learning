/** Markdown + KaTeX 渲染（自研数学预处理器，避免额外依赖与版本兼容问题） */

import MarkdownIt from "markdown-it";
import katex from "katex";
import "katex/dist/katex.min.css";

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
const textOnlyMd = new MarkdownIt({ html: false, linkify: false, breaks: true }).disable(["link", "image", "autolink"]);

// 外链默认新窗口打开
const defaultLinkOpen =
  md.renderer.rules.link_open ??
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet("target", "_blank");
  tokens[idx].attrSet("rel", "noopener noreferrer");
  return defaultLinkOpen(tokens, idx, options, env, self);
};

interface MathSeg {
  tex: string;
  display: boolean;
}

function renderMath(seg: MathSeg): string {
  try {
    return katex.renderToString(seg.tex, {
      displayMode: seg.display,
      throwOnError: false,
      strict: false,
    });
  } catch {
    return seg.display
      ? `<div class="math-fallback"><code>${escapeHtml(seg.tex)}</code></div>`
      : `<code>${escapeHtml(seg.tex)}</code>`;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** 像 $5 或 $1,000.00 一样的纯数字不当作公式 */
function looksLikeCurrency(tex: string): boolean {
  return /^\s*\d+(?:[,.，]\d+)*\s*(?:元|块|万)?\s*$/.test(tex);
}

/** 提取数学段并替换为占位符（跳过行内代码，已先被调用方保护） */
function extractMath(text: string, mathes: MathSeg[], prefix: string): string {
  let out = text;
  const push = (tex: string, display: boolean): string => {
    mathes.push({ tex, display });
    return `%%${prefix}MATH${mathes.length - 1}%%`;
  };
  out = out.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => push(tex.trim(), true));
  out = out.replace(/\\\[([\s\S]+?)\\\]/g, (_, tex) => push(tex.trim(), true));
  out = out.replace(/\\\(([\s\S]+?)\\\)/g, (_, tex) => push(tex.trim(), false));
  // 行内 $...$：内容不得含换行，首尾不留空白，排除纯价格
  out = out.replace(/\$(?!\s)([^$\n]+?)(?<!\s)\$/g, (m, tex) =>
    looksLikeCurrency(tex) ? m : push(tex, false),
  );
  return out;
}

/** 将 markdown 文本渲染为 HTML；支持 $...$ / $$...$$ / \(...\) / \[...\] 数学 */
export function renderMarkdown(src: string, options: { textOnly?: boolean } = {}): string {
  const renderer = options.textOnly ? textOnlyMd : md;
  let prefix = "ZXZ";
  const decoded = renderer.utils.unescapeAll(src);
  while (src.includes(`%%${prefix}`) || decoded.includes(`%%${prefix}`)) prefix += "Z";
  // 1) 先把围栏代码块按顶层切块保护起来
  const blocks: string[] = [];
  const parts = splitByFence(src, blocks);

  // 2) 各 markdown 块内：保护行内代码 → 提取数学 → 渲染 → 还原数学 → 还原行内代码
  const renderedHtml = parts
    .map((part) => {
      if (part.kind === "code") return renderer.render(part.text);
      const inlines: string[] = [];
      const mathes: MathSeg[] = [];
      let text = part.text.replace(/`[^`\n]+`/g, (m) => {
        inlines.push(m);
        return `%%${prefix}INLINE${inlines.length - 1}%%`;
      });
      text = extractMath(text, mathes, prefix);
      let html = renderer.render(text);
      html = html.replace(new RegExp(`%%${prefix}MATH(\\d+)%%`, "g"), (match, i) => mathes[Number(i)] ? renderMath(mathes[Number(i)]) : match);
      html = html.replace(new RegExp(`%%${prefix}INLINE(\\d+)%%`, "g"), (match, i) => inlines[Number(i)] ? renderer.renderInline(inlines[Number(i)]) : match);
      return html;
    })
    .join("");
  return renderedHtml;
}

interface Part {
  kind: "md" | "code";
  text: string;
}

/** 顶层按 ``` 围栏切块；围栏块（含语言标记行）原样保留，交给 markdown-it 渲染成代码 */
function splitByFence(src: string, sink: string[]): Part[] {
  const parts: Part[] = [];
  const re = /```[^\n]*\n[\s\S]*?```|```[^\n]*\n[\s\S]*$|~~~[^\n]*\n[\s\S]*?~~~/g;
  let last = 0;
  for (const m of src.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) parts.push({ kind: "md", text: src.slice(last, idx) });
    parts.push({ kind: "code", text: m[0] });
    last = idx + m[0].length;
  }
  if (last < src.length) parts.push({ kind: "md", text: src.slice(last) });
  sink.push(...parts.filter((p) => p.kind === "code").map((p) => p.text));
  return parts;
}
