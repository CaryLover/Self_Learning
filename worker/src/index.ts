/**
 * 自学小站 · Cloudflare Workers 无状态转发代理
 *
 * 职责（仅此三条）：
 *   1. 校验来源（Origin 白名单）与频率（简单限流），防止第三方盗用代理额度；
 *   2. 把浏览器请求转发到白名单内的厂商 API（服务端到服务端，绕开浏览器 CORS 限制）；
 *   3. 给响应补 CORS 头并原样透传（含 SSE 流）。
 *
 * 隐私承诺（可审计）：
 *   - 读取并转发 Authorization 头及请求体，不解析、存储或记录其内容；
 *   - 日志只输出被拒原因与转发次数，不含任何 key 或业务数据。
 *
 * 协议：
 *   GET  /               → 健康检查（返回版本与转发目标域名数，不含敏感信息）
 *   ANY /proxy?u=<目标>  → 转发。目标 URL 经 encodeURIComponent 放在 u 参数，
 *                          Authorization / Content-Type 等头由浏览器原样携带。
 */

export interface Env {
  ALLOWED_ORIGINS: string; // 逗号分隔；空或 "*" = 不限制
  ALLOWED_HOSTS: string; // 逗号分隔；空 = 使用内置预置清单
  RATE_LIMIT_PER_MIN: string;
}

const VERSION = "1.0.0";

/** 内置厂商 API 域名白名单（与前端预置清单对应，可用 ALLOWED_HOSTS 覆盖） */
const BUILTIN_HOSTS = [
  "api.deepseek.com",
  "open.bigmodel.cn",
  "api.moonshot.cn",
  "api.minimax.cn",
  "dashscope.aliyuncs.com",
  "dashscope-intl.aliyuncs.com",
  "api.siliconflow.cn",
  "api-inference.modelscope.cn",
];

/** 转发到厂商时保留的请求头（其余一律丢弃，尤其不碰 Authorization 之外的内容） */
const FORWARD_HEADERS = ["authorization", "content-type", "accept", "user-agent"];
/** 透传回浏览器时保留的响应头 */
const PASS_HEADERS = ["content-type", "cache-control", "x-request-id"];

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // ---- CORS 基础 ----
    const origin = request.headers.get("Origin");
    if (request.method === "OPTIONS") {
      return corsResponse(new Response(null, { status: 204 }), origin, env);
    }

    // ---- 健康检查 ----
    if (new URL(request.url).pathname === "/" && request.method === "GET") {
      const hosts = env.ALLOWED_HOSTS
        ? env.ALLOWED_HOSTS.split(",").map((s) => s.trim()).filter(Boolean)
        : BUILTIN_HOSTS;
      return corsResponse(
        json({ name: "zixue-relay", version: VERSION, hosts: hosts.length }),
        origin,
        env,
      );
    }

    // ---- 来源校验（防盗用） ----
    const originErr = checkOrigin(origin, env);
    if (originErr) {
      return corsResponse(json({ error: originErr }, 403), origin, env);
    }

    // ---- 简单限流（每 isolate 内存版，尽力而为） ----
    if (!rateLimit(request, env)) {
      return corsResponse(json({ error: "rate_limited" }, 429), origin, env);
    }

    if (new URL(request.url).pathname !== "/proxy") {
      return corsResponse(json({ error: "not_found" }, 404), origin, env);
    }

    // ---- 解析与校验目标 ----
    const targetRaw = new URL(request.url).searchParams.get("u") ?? "";
    let target: URL;
    try {
      target = new URL(targetRaw);
    } catch {
      return corsResponse(json({ error: "bad_target" }, 400), origin, env);
    }
    if (target.protocol !== "https:" && target.protocol !== "http:") {
      return corsResponse(json({ error: "bad_target_protocol" }, 400), origin, env);
    }
    // 非本机目标必须使用 HTTPS，避免把授权头经明文转发到厂商域名。
    const loopback = target.hostname === "127.0.0.1" || target.hostname === "localhost" || target.hostname === "::1" || target.hostname === "[::1]";
    if (target.protocol === "http:" && !loopback) {
      return corsResponse(json({ error: "insecure_target" }, 400), origin, env);
    }
    const allowed = env.ALLOWED_HOSTS
      ? env.ALLOWED_HOSTS.split(",").map((s) => s.trim()).filter(Boolean)
      : BUILTIN_HOSTS;
    const hostPort = target.port ? `${target.hostname}:${target.port}` : target.hostname;
    if (!allowed.includes(target.hostname) && !allowed.includes(hostPort)) {
      console.log(`deny host=${target.hostname}`);
      return corsResponse(json({ error: "host_not_allowed" }, 403), origin, env);
    }

    // ---- 构造上游请求（只带白名单内的头，Authorization 原样转发） ----
    const headers = new Headers();
    for (const h of FORWARD_HEADERS) {
      const v = request.headers.get(h);
      if (v) headers.set(h, v);
    }
    const body = request.method === "GET" || request.method === "HEAD" ? undefined : request.body;
    let upstream: Response;
    try {
      upstream = await fetch(new Request(target.toString(), {
        method: request.method,
        headers,
        body,
        cf: { cacheTtl: 0 }, // Workers 专有字段：出站请求不缓存
      }));
    } catch {
      console.log("upstream_fetch_failed");
      return corsResponse(json({ error: "upstream_fetch_failed" }, 502), origin, env);
    }

    console.log(`forward ${target.hostname} -> ${upstream.status}`); // 仅记次数与状态码，不记内容
    const outHeaders = new Headers();
    for (const h of PASS_HEADERS) {
      const v = upstream.headers.get(h);
      if (v) outHeaders.set(h, v);
    }
    return corsResponse(new Response(upstream.body, { status: upstream.status, headers: outHeaders }), origin, env);
  },
} satisfies ExportedHandler<Env>;

// ---------------------------------------------------------------- helpers

function checkOrigin(origin: string | null, env: Env): string | null {
  const list = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (list.length === 0 || list.includes("*")) return null; // 未配置 = 不限制
  if (!origin) return "origin_required"; // 配置了白名单时，浏览器请求必须带 Origin
  return list.includes(origin) ? null : "origin_not_allowed";
}

/** 每分钟限流：按 CF-Connecting-IP 计数，超限返回 false */
const buckets = new Map<string, { count: number; resetAt: number }>();
function rateLimit(request: Request, env: Env): boolean {
  const limit = parseInt(env.RATE_LIMIT_PER_MIN || "60", 10) || 60;
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || b.resetAt <= now) {
    buckets.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  b.count += 1;
  if (buckets.size > 10_000) buckets.clear(); // 防内存膨胀
  return b.count <= limit;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function corsResponse(resp: Response, origin: string | null, env: Env): Response {
  const list = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const anyOrigin = list.length === 0 || list.includes("*");
  const headers = new Headers(resp.headers);
  headers.set("Access-Control-Allow-Origin", anyOrigin ? "*" : origin ?? "*");
  headers.set("Vary", "Origin");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, X-Target-Url");
  headers.set("Access-Control-Max-Age", "86400");
  return new Response(resp.body, { status: resp.status, headers });
}
