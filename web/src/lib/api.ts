/** API 客户端：经转发代理（或直连）调用厂商 OpenAI 兼容接口 */

import type { ChatRequestOptions } from "./types";

export class ApiError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** 组装最终请求 URL：配置了代理则走 /proxy?u=，否则浏览器直连（仅个别厂商可行） */
export function buildRequestUrl(proxyUrl: string, vendorEndpoint: string): string {
  const proxy = proxyUrl.trim().replace(/\/+$/, "");
  if (!proxy) return vendorEndpoint;
  return `${proxy}/proxy?u=${encodeURIComponent(vendorEndpoint)}`;
}

function friendlyError(status: number, vendorMsg: string): string {
  const detail = vendorMsg ? `（${vendorMsg}）` : "";
  if (status === 401 || status === 403) return `密钥无效或无权限，请家长在设置页检查 API key${detail}`;
  if (status === 429) return `请求太频繁或额度不足，稍后再试${detail}`;
  if (status >= 500) return `厂商服务暂时不可用，试试切换模型或厂商${detail}`;
  return `请求失败（${status}）${detail}`;
}

async function readErrorBody(resp: Response): Promise<string> {
  try {
    const text = await resp.text();
    try {
      const j = JSON.parse(text) as { error?: { message?: string }; message?: string };
      return j.error?.message ?? j.message ?? text.slice(0, 200);
    } catch {
      return text.slice(0, 200);
    }
  } catch {
    return "";
  }
}

/** 流式解析 SSE，回调增量文本；返回完整 assistant 文本 */
async function streamSse(resp: Response, onDelta: (t: string) => void, signal?: AbortSignal): Promise<string> {
  const reader = resp.body?.getReader();
  if (!reader) throw new ApiError("响应没有内容");
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let full = "";
  const pump = async (): Promise<void> => {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const obj = JSON.parse(payload) as {
          choices?: { delta?: { content?: string } }[];
        };
        const piece = obj.choices?.[0]?.delta?.content;
        if (piece) {
          full += piece;
          onDelta(piece);
        }
      } catch {
        /* 忽略无法解析的行（部分厂商会发心跳/注释行） */
      }
    }
    if (signal?.aborted) {
      reader.cancel().catch(() => undefined);
      return;
    }
    await pump();
  };
  await pump();
  return full;
}

/** 对话请求（流式或非流式），返回完整 assistant 文本 */
export async function chatRequest(opts: ChatRequestOptions): Promise<string> {
  const body = JSON.stringify({
    model: opts.model,
    messages: opts.messages,
    stream: opts.stream,
  });
  const resp = await fetch(buildRequestUrl(opts.proxyUrl ?? "", opts.endpoint), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body,
    signal: opts.signal,
  });
  if (!resp.ok) throw new ApiError(friendlyError(resp.status, await readErrorBody(resp)), resp.status);

  if (opts.stream && resp.headers.get("Content-Type")?.includes("text/event-stream")) {
    return streamSse(resp, (t) => opts.onDelta?.(t), opts.signal);
  }
  const data = (await resp.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? "";
  if (content) opts.onDelta?.(content);
  return content;
}

export interface ProviderTestResult {
  ok: boolean;
  message: string;
  latencyMs: number;
}

/** 测试厂商连通性：默认 1-token 对话请求（所有预置厂商通用，ModelScope 也校验 key） */
export async function testProvider(
  proxyUrl: string,
  base: string,
  apiKey: string,
  model: string,
): Promise<ProviderTestResult> {
  const t0 = performance.now();
  const endpoint = `${base.replace(/\/+$/, "")}/chat/completions`;
  try {
    const text = await chatRequest({
      endpoint,
      apiKey,
      model,
      messages: [{ role: "user", content: "hi" }],
      stream: false,
      proxyUrl,
    });
    const ms = Math.round(performance.now() - t0);
    if (text.trim()) return { ok: true, message: `连接成功（${ms}ms）`, latencyMs: ms };
    return { ok: false, message: `连接成功但返回为空，请确认模型名是否正确`, latencyMs: ms };
  } catch (e) {
    const ms = Math.round(performance.now() - t0);
    return { ok: false, message: e instanceof Error ? e.message : "未知错误", latencyMs: ms };
  }
}

/** 拉取厂商模型列表（GET /models）；GLM 等拉不到时由调用方回退内置清单 */
export async function fetchModelList(proxyUrl: string, base: string, apiKey: string): Promise<string[]> {
  const endpoint = `${base.replace(/\/+$/, "")}/models`;
  const resp = await fetch(buildRequestUrl(proxyUrl, endpoint), {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!resp.ok) throw new ApiError(friendlyError(resp.status, await readErrorBody(resp)), resp.status);
  const data = (await resp.json()) as { data?: { id?: string }[] };
  const ids = (data.data ?? []).map((m) => m.id).filter((x): x is string => !!x);
  // 只保留文本对话可用性较高的模型名（过滤 embedding / rerank / vision 等非对话模型）
  const drop = /(embed|rerank|vector|whisper|tts|speech|audio|image|video|ocr|moderation|guard|speech2text|doubao-embedding)/i;
  return ids.filter((id) => !drop.test(id));
}

/** 代理健康检查（设置页「测试代理」按钮） */
export async function testProxy(proxyUrl: string): Promise<ProviderTestResult> {
  const t0 = performance.now();
  try {
    const resp = await fetch(`${proxyUrl.replace(/\/+$/, "")}/`);
    const j = (await resp.json()) as { name?: string; version?: string };
    const ms = Math.round(performance.now() - t0);
    if (j.name === "zixue-relay") {
      return { ok: true, message: `代理连通 v${j.version}（${ms}ms）`, latencyMs: ms };
    }
    return { ok: false, message: "该地址不是自学小站代理", latencyMs: ms };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "无法连接代理", latencyMs: 0 };
  }
}
