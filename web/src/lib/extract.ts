/** 结构化输出容错提取：模型输出可能带围栏、前缀说明或多余文本 */

/** 提取第一个指定语言的围栏代码块；lang 省略则取任意第一个 */
export function extractFenced(text: string, lang?: string): string | null {
  const re = lang
    ? new RegExp("```" + lang + "\\s*\\n([\\s\\S]*?)```", "i")
    : /```[^\n]*\n([\s\S]*?)```/;
  const m = text.match(re);
  if (m?.[1]) return m[1].trim();
  return null;
}

/** 提取完整 HTML 文档（讲解页）：优先 ```html 围栏，其次 <!DOCTYPE/<html 标记 */
export function extractHtmlDocument(text: string): string | null {
  const fenced = extractFenced(text, "html");
  if (fenced && /<html[\s>]/i.test(fenced)) return fenced;
  const docMatch = text.match(/<!DOCTYPE\s+html[\s\S]*<\/html\s*>/i);
  if (docMatch) return docMatch[0].trim();
  const htmlMatch = text.match(/<html[\s>][\s\S]*<\/html\s*>/i);
  if (htmlMatch) return htmlMatch[0].trim();
  // 退化：围栏里不是完整文档时也返回（可能是片段，仍可进 iframe）
  return fenced;
}

/** 宽松 JSON 解析：围栏 → 裸 JSON 扫描（首个配平的 {} 或 []，忽略字符串内的括号） */
export function parseJsonLoose<T>(text: string): T | null {
  const candidates: string[] = [];
  const fenced = extractFenced(text, "json");
  if (fenced) candidates.push(fenced);
  candidates.push(text.trim());

  for (const c of candidates) {
    try {
      return JSON.parse(c) as T;
    } catch {
      /* 继续尝试 */
    }
    const scanned = scanBalanced(c);
    if (scanned) {
      try {
        return JSON.parse(scanned) as T;
      } catch {
        /* 继续尝试 */
      }
    }
  }
  return null;
}

function scanBalanced(text: string): string | null {
  const start = text.search(/[{[]/);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{" || ch === "[") depth += 1;
    else if (ch === "}" || ch === "]") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * 拆分协议块（如 @@SKILLMAP@@ / @@REPORT@@ 后跟 ```json 围栏）。
 * 返回去掉协议块的正文与围栏内的 JSON 文本（解析交给调用方）。
 */
export function splitProtocolBlock(
  raw: string,
  marker: string,
): { content: string; json: string | null } {
  const idx = raw.indexOf(marker);
  if (idx < 0) return { content: raw.trim(), json: null };
  const head = raw.slice(0, idx);
  const tail = raw.slice(idx + marker.length);
  const fence = tail.match(/```[^\n]*\n([\s\S]*?)```/);
  if (!fence) return { content: (head + tail).trim(), json: null };
  const json = fence[1].trim();
  const content = (head + tail.slice((fence.index ?? 0) + fence[0].length)).trim();
  return { content, json };
}
