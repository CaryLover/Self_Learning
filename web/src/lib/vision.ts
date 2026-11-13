/** 多模态（图片输入）支持：能力判断 + 图片压缩 */

/** 按模型名判断是否支持图片输入（各厂商命名不完全统一，这里用常见特征匹配） */
const VISION_PATTERNS = [
  /\bvl\b|[-_.]vl\b|vl[-_.]/i, // qwen-vl / qwen2.5-vl / internvl
  /vision/i, // llama-vision / yi-vision / doubao-vision
  /visual/i,
  /multimodal|omni/i,
  /llava|pixtral|minicpm-v|internvl|molmo/i,
  /glm-4(\.\d)?v|glm-4v/i, // 智谱 GLM-4V / GLM-4.5V
  /\bgpt-4o\b|\bgpt-4\.1\b|\bgpt-5\b|\bo3\b|\bo4\b/i, // OpenAI 多模态系列（含兼容命名，避免误匹配普通词）
  /claude-3|claude-4|claude-sonnet|claude-opus/i,
  /gemini/i,
  /deepseek-flash|deepseek-v4-flash|deepseek.*vision/i, // DeepSeek-V4.1-Flash 原生多模态（v4-pro 不支持）
  /kimi-latest|moonshot.*(vision|vl)/i, // kimi-latest 支持图片；K2 纯文本不标记
  /step-1v|qvq/i,
  /minimax.*(vl|vision)|abab.*vl/i,
  /doubao.*(vision|vl)|seed.*(vision|vl)/i,
  /deepseek-vl|janus/i,
];

export function supportsVision(modelId: string): boolean {
  return VISION_PATTERNS.some((re) => re.test(modelId));
}

/**
 * 模型是否支持图片输入：家长手动设置优先（true/false），未设置时按模型名推断。
 * 厂商改名或新模型未收录时，可在设置页点 🖼 手动纠正。
 */
export function effectiveVision(modelId: string, override?: boolean): boolean {
  if (override === true) return true;
  if (override === false) return false;
  return supportsVision(modelId);
}

export const MAX_IMAGES = 3;
export const MAX_IMAGE_MB = 8;
/** 压缩后最长边（像素），兼顾清晰度与 token/体积 */
const MAX_DIM = 1280;

/** 读取图片并压缩为 JPEG data URL（超长边等比缩放） */
export async function fileToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("只支持图片文件（png / jpg / webp）");
  if (file.size > MAX_IMAGE_MB * 1024 * 1024) throw new Error(`图片不能超过 ${MAX_IMAGE_MB}MB`);

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("浏览器不支持图片处理");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.86);
  } finally {
    bitmap.close?.();
  }
}
