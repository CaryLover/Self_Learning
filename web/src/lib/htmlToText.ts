const ENTITIES: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" };

/** 提取讲解页中的文字，供后续练习和读图提示使用。 */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|amp|lt|gt|quot|apos|#(?:x[0-9a-f]+|\d+));/gi, entity => {
      const found = ENTITIES[entity.toLowerCase()];
      if (found !== undefined) return found;
      const numeric = entity.slice(2, -1);
      const code = numeric[0].toLowerCase() === "x" ? Number.parseInt(numeric.slice(1), 16) : Number.parseInt(numeric, 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    })
    .replace(/\s+/g, " ")
    .trim();
}
