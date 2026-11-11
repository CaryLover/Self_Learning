/**
 * 学习页：会话管理 + 两种模式的调用编排（ELI5 两段式 / 苏格拉底循环）
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, ChatMsg, ContentPart, Grade, Mode, Session, Settings, SkillMap, Turn } from "../lib/types";
import { MODE_LABEL, GRADE_LABEL } from "../lib/types";
import { pickModel, resolveBase, visibleModels, type UiPrefs, type VisibleModel } from "../lib/store";
import { chatRequest, ApiError } from "../lib/api";
import { parseJsonLoose, splitProtocolBlock, extractHtmlDocument } from "../lib/extract";
import { buildContext } from "../lib/context";
import { htmlToText } from "../lib/markdown";
import { uid } from "../lib/id";
import { buildEli5ExplainMessages, buildEli5PracticeMessages } from "../prompts/eli5";
import { ELI5_PROMPT_VERSION } from "../prompts/eli5Core";
import { buildSocraticSystem, buildEndSessionMessage } from "../prompts/socratic";
import { dailyTip } from "../lib/encourage";
import { effectiveVision, fileToDataUrl, MAX_IMAGES } from "../lib/vision";
import { ChatView, ChatSidePanel } from "./ChatView";
import { Eli5View } from "./Eli5View";

const MODES: Mode[] = ["eli5", "socratic"];
/** 记录最近一次 401/403 的模型，用于持续提示"密钥无效" */
const AUTHFAIL_KEY = "zxz.authfail.v1";

export interface LearnViewProps {
  settings: Settings;
  prefs: UiPrefs;
  sessions: Session[];
  current: Session | null;
  onPrefsChange: (p: UiPrefs) => void;
  onNewSession: (opts?: { mode?: Mode; grade?: Grade }) => void;
  onOpenSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onSaveSession: (s: Session) => void;
  goSettings: () => void;
}

export function LearnView(props: LearnViewProps) {
  const { settings, prefs, sessions, current, onPrefsChange, onNewSession, onOpenSession, onDeleteSession, onSaveSession, goSettings } = props;

  const [input, setInput] = useState("");
  const [images, setImages] = useState<string[]>([]); // 待发送的图片（data URL）
  const [imgErr, setImgErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [streamText, setStreamText] = useState("");
  const streamRef = useRef("");
  const abortRef = useRef<AbortController | null>(null);

  const [modelOverride, setModelOverride] = useState<VisibleModel | null>(null);

  const vis = useMemo(() => visibleModels(settings), [settings]);
  const model = useMemo(() => {
    if (
      modelOverride &&
      vis.some((v) => v.providerId === modelOverride.providerId && v.modelId === modelOverride.modelId)
    ) {
      return modelOverride;
    }
    return pickModel(settings);
  }, [modelOverride, vis, settings]);

  // 孩子背景信息（年级 → 讲解方法上限，防超纲）
  const pctx = useMemo(
    () => ({
      gradeLevel: settings.profile.gradeLevel,
      nickname: settings.profile.nickname || undefined,
    }),
    [settings.profile.gradeLevel, settings.profile.nickname],
  );
  const apiKey = model ? settings.providers[model.providerId]?.apiKey ?? "" : "";
  const base = model ? resolveBase(settings, model.providerId) : "";

  // ---- API 配置状态（首次进入 / 密钥无效 的确切告知） ----
  const modelKey = model ? `${model.providerId}||${model.modelId}` : "";
  const [authFailKey, setAuthFailKey] = useState<string | null>(() => {
    try {
      return localStorage.getItem(AUTHFAIL_KEY);
    } catch {
      return null;
    }
  });
  const authBanner = !!modelKey && authFailKey === modelKey;
  const canVision =
    !!model &&
    effectiveVision(model.modelId, settings.providers[model.providerId]?.models[model.modelId]?.vision);
  // 是否填过 key（用于区分"没配置"和"配置了但没启用模型"）
  const hasAnyKey = useMemo(
    () => Object.values(settings.providers).some((p) => p.enabled && !!p.apiKey),
    [settings.providers],
  );

  /** 厂商返回 401/403 时记录，供顶部横幅持续提示 */
  function noteApiError(e: unknown): void {
    if (!(e instanceof ApiError)) return;
    if (e.status !== 401 && e.status !== 403) return;
    try {
      localStorage.setItem(AUTHFAIL_KEY, modelKey);
    } catch {
      /* 忽略 */
    }
    setAuthFailKey(modelKey);
  }

  function clearApiError(): void {
    if (!authFailKey) return;
    try {
      localStorage.removeItem(AUTHFAIL_KEY);
    } catch {
      /* 忽略 */
    }
    setAuthFailKey(null);
  }

  const commit = (s: Session): void => onSaveSession(s);

  const endpoint = `${base.replace(/\/+$/, "")}/chat/completions`;

  function call(messages: ChatMessage[], stream: boolean, signal?: AbortSignal): Promise<string> {
    if (!model) return Promise.reject(new Error("还没有可用的模型"));
    return chatRequest({
      endpoint,
      apiKey,
      model: model.modelId,
      messages,
      stream,
      signal,
      onDelta: (t) => {
        streamRef.current += t;
        setStreamText(streamRef.current);
      },
    }).then(
      (raw) => {
        clearApiError(); // 成功一次即认为密钥可用
        return raw;
      },
      (e) => {
        noteApiError(e);
        throw e;
      },
    );
  }

  // ---------------------------------------------------------------- 会话操作

  function switchMode(mode: Mode): void {
    onPrefsChange({ ...prefs, mode });
    // 模式切换 = 开新会话（两种模式的上下文结构不同）；显式传 mode，避免读到旧的 prefs
    if (!current || current.mode !== mode) onNewSession({ mode });
  }

  // ---------------------------------------------------------------- 苏格拉底

  async function sendSocratic(text: string, s: Session): Promise<void> {
    setBusy(true);
    streamRef.current = "";
    setStreamText("");
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const ctx = buildContext(s.turns);
      const messages: ChatMessage[] = [
        {
          role: "system",
          content: buildSocraticSystem(s.grade, {
            skillMap: s.skillMap,
            contextTruncated: ctx.truncated,
            ...pctx,
          }),
        },
        ...ctx.turns.map((t) => ({ role: t.role, content: toApiContent(t) })),
      ];
      const raw = await call(messages, true, ac.signal);
      finishTurn(s, raw);
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        // 中止：保留已生成的部分内容
        if (streamRef.current.trim()) finishTurn(s, streamRef.current);
        else commit(s);
      } else {
        addError(s, friendlyError(e));
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      setStreamText("");
    }
  }

  function finishTurn(s: Session, raw: string): void {
    const { content, json } = splitProtocolBlock(raw, "@@SKILLMAP@@");
    let map = s.skillMap;
    if (json) {
      const parsed = parseJsonLoose<SkillMap>(json);
      if (parsed && typeof parsed.topic === "string" && Array.isArray(parsed.skills) && parsed.skills.length > 0) {
        map = normalizeMap(parsed);
      }
    }
    const asst: ChatMsg = { id: uid(), role: "assistant", content: content || raw.trim(), raw, ts: Date.now() };
    commit({
      ...s,
      messages: [...s.messages, asst],
      turns: [...s.turns, { role: "assistant", content: raw }],
      skillMap: map,
    });
  }

  function addError(s: Session, message: string): void {
    const asst: ChatMsg = { id: uid(), role: "assistant", content: `😢 ${message}`, ts: Date.now(), error: true };
    commit({ ...s, messages: [...s.messages, asst] });
  }

  async function endSession(): Promise<void> {
    if (!current || busy || !model) return;
    // 孩子一个答案都没给时：先提醒（报告将只能是「未作答，无法评定」）
    const answers = current.turns.filter((t, i) => t.role === "user" && i > 0).length;
    if (answers === 0) {
      const go = confirm(
        "你还没有回答任何问题——现在结束的话，掌握报告只能显示「未作答，无法评定」，不会有有效评分。\n\n" +
          "建议先跟着老师回答至少一个问题再结束。确定仍要结束吗？",
      );
      if (!go) return;
    }
    setBusy(true);
    setReportBusy(true);
    streamRef.current = "";
    setStreamText("");
    let s: Session = { ...current, turns: [...current.turns, { role: "user", content: buildEndSessionMessage() }] };
    const ac = new AbortController();
    abortRef.current = ac;
    const sysContent = buildSocraticSystem(s.grade, {
      skillMap: s.skillMap,
      contextTruncated: true,
      ...pctx,
    });
    try {
      const attempt = async (turns: typeof s.turns): Promise<string> =>
        call([{ role: "system", content: sysContent }, ...turns], true, ac.signal);

      let raw = await attempt(s.turns);
      let { json } = splitProtocolBlock(raw, "@@REPORT@@");
      let parsed = json ? parseJsonLoose<{ knowledge?: unknown }>(json) : null;
      if (!isValidReport(parsed)) {
        // 容错：失败重试一次（计划 4.2）
        const retryTurns = [
          ...s.turns,
          { role: "assistant" as const, content: raw },
          {
            role: "user" as const,
            content:
              "你上一个回复不符合格式要求。请只输出 @@REPORT@@ 和一个 ```json 围栏，围栏内是掌握报告 JSON（{\"knowledge\":[{\"name\",\"score\",\"status\",\"advice\"}]}），不要输出其他任何内容。",
          },
        ];
        raw = await attempt(retryTurns);
        ({ json } = splitProtocolBlock(raw, "@@REPORT@@"));
        parsed = json ? parseJsonLoose<{ knowledge?: unknown }>(json) : null;
      }
      if (isValidReport(parsed)) {
        const report = {
          knowledge: parsed.knowledge.map((k) => ({
            name: String(k.name ?? "").slice(0, 60),
            score: Math.max(0, Math.min(100, Math.round(Number(k.score) || 0))),
            status: String(k.status ?? ""),
            advice: String(k.advice ?? ""),
          })),
          generatedAt: Date.now(),
        };
        const asst: ChatMsg = {
          id: uid(),
          role: "assistant",
          content: "掌握报告已生成，见下方卡片 👇 可以截图保存给家长看。",
          ts: Date.now(),
        };
        s = {
          ...s,
          report,
          messages: [...s.messages, asst],
          turns: [...s.turns, { role: "assistant", content: raw }],
        };
        commit(s);
      } else {
        addError(s, "报告生成失败：模型没有按格式返回。请稍后再试，或换个模型。");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") addError(s, friendlyError(e));
    } finally {
      abortRef.current = null;
      setBusy(false);
      setReportBusy(false);
      setStreamText("");
    }
  }

  function isValidReport(p: unknown): p is { knowledge: Record<string, unknown>[] } {
    const o = p as { knowledge?: unknown } | null;
    return !!o && Array.isArray(o.knowledge) && o.knowledge.length > 0;
  }

  // ---------------------------------------------------------------- ELI5

  async function runEli5(topic: string, s0: Session, images: string[] = []): Promise<void> {
    setBusy(true);
    let s: Session = {
      ...s0,
      title: s0.title || topic.slice(0, 24),
      eli5: { stage: "explaining", topic, promptVersion: ELI5_PROMPT_VERSION },
    };
    commit(s);
    try {
      // 第一段：讲解页（有图片时作为多模态内容一并发送）
      let msgs: ChatMessage[] = buildEli5ExplainMessages(s.grade, topic, pctx);
      if (images.length > 0) {
        msgs = [
          ...msgs,
          {
            role: "user",
            content: [
              { type: "text", text: "这是孩子提供的题目/资料图片，请先读懂图片内容，再按要求讲解。" },
              ...images.map((url): ContentPart => ({ type: "image_url", image_url: { url } })),
            ],
          },
        ];
      }
      let raw = await call(msgs, false);
      let html = extractHtmlDocument(raw);
      if (!html) {
        msgs = [
          ...msgs,
          { role: "assistant", content: raw },
          {
            role: "user",
            content:
              "你上一个回复不符合要求。请只输出一个完整 HTML 文档（用 ```html 围栏包裹，含 <!DOCTYPE html>），不要输出任何其他文字。",
          },
        ];
        raw = await call(msgs, false);
        html = extractHtmlDocument(raw);
      }
      if (!html) {
        commit({ ...s, eli5: { ...s.eli5!, stage: "error", error: "讲解页生成失败，请重试或换个模型。" } });
        return;
      }
      s = { ...s, eli5: { ...s.eli5!, html, stage: "practicing" } };
      commit(s);

      // 第二段：巩固练习
      const digest = htmlToText(html).slice(0, 4000);
      let pmsgs = buildEli5PracticeMessages(s.grade, topic, digest, pctx);
      let praw = await call(pmsgs, false);
      let items = parsePractices(praw);
      if (!items) {
        pmsgs = [
          ...pmsgs,
          { role: "assistant", content: praw },
          {
            role: "user",
            content:
              '你上一个回复不符合要求。请只输出一个 ```json 围栏，围栏内是 JSON 数组，每项包含 "question"、"difficulty"（"持平"/"进阶"/"培优"）、"answer"、"analysis"。不要输出其他任何文字。',
          },
        ];
        praw = await call(pmsgs, false);
        items = parsePractices(praw);
      }
      s = {
        ...s,
        eli5: {
          ...s.eli5!,
          practices: items ?? undefined,
          stage: items ? "done" : "error",
          error: items ? undefined : "练习生成失败，请重试或换个模型。",
        },
      };
      commit(s);
    } catch (e) {
      commit({ ...s, eli5: { ...s.eli5!, stage: "error", error: friendlyError(e) } });
    } finally {
      setBusy(false);
    }
  }

  // ---------------------------------------------------------------- 输入分发

  /** 把文件压缩后加入待发送列表（点选 / 粘贴 / 拖入共用） */
  async function addFiles(files: File[]): Promise<void> {
    if (files.length === 0) return;
    if (!canVision) {
      setImgErr("当前模型不支持图片，请切换支持看图的模型（如 deepseek-flash、Qwen-VL）");
      return;
    }
    setImgErr(null);
    const room = MAX_IMAGES - images.length;
    if (room <= 0) {
      setImgErr(`最多只能附带 ${MAX_IMAGES} 张图片`);
      return;
    }
    if (files.length > room) setImgErr(`最多 ${MAX_IMAGES} 张图片，多出的已忽略`);
    const added: string[] = [];
    for (const f of files.slice(0, room)) {
      try {
        added.push(await fileToDataUrl(f));
      } catch (err) {
        setImgErr(err instanceof Error ? err.message : "图片处理失败");
      }
    }
    if (added.length > 0) setImages((prev) => [...prev, ...added].slice(0, MAX_IMAGES));
  }

  /** 选择图片：压缩后加入待发送列表（最多 MAX_IMAGES 张） */
  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // 允许重复选择同一文件
    await addFiles(files);
  }

  // 支持 Ctrl+V 粘贴剪贴板里的图片（截图/复制图片后直接粘贴）
  useEffect(() => {
    function onPaste(e: ClipboardEvent): void {
      if (document.querySelector(".overlay")) return; // 弹窗打开时不拦截
      const items = e.clipboardData?.items;
      if (!items) return;
      const files: File[] = [];
      for (const it of Array.from(items)) {
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length === 0) return; // 普通文字粘贴不处理
      e.preventDefault();
      void addFiles(files);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canVision, images.length]);

  async function handleSend(): Promise<void> {
    const text = input.trim();
    if (busy) return;
    if (!text && images.length === 0) return;
    if (!model || !apiKey || !base) {
      goSettings();
      return;
    }
    const padded = images.length > 0 && !text ? "请讲解这张图片里的题目。" : text;
    const sending = images;
    setInput("");
    setImages([]);
    setImgErr(null);
    let s = current;
    if (!s) {
      // 还没有会话时直接输入并回车：自动新建一次学习，不要求先点按钮
      const now = Date.now();
      s = {
        id: uid(),
        mode: prefs.mode,
        grade: prefs.grade,
        title: "",
        createdAt: now,
        updatedAt: now,
        messages: [],
        turns: [],
      };
    }
    const userMsg: ChatMsg = {
      id: uid(),
      role: "user",
      content: padded,
      images: sending.length > 0 ? sending : undefined,
      ts: Date.now(),
    };
    s = {
      ...s,
      title: s.title || (padded === "请讲解这张图片里的题目。" ? "图片题目" : padded.slice(0, 24)),
      messages: [...s.messages, userMsg],
      turns: [
        ...s.turns,
        { role: "user", content: padded, images: sending.length > 0 ? sending : undefined },
      ],
    };
    commit(s);
    if (s.mode === "socratic") await sendSocratic(padded, s);
    else await runEli5(padded, s, sending);
  }

  function handleStop(): void {
    abortRef.current?.abort();
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void handleSend();
    }
  }

  // ---------------------------------------------------------------- 渲染

  const isSocratic = (current?.mode ?? prefs.mode) === "socratic";
  const useMode: Mode = current?.mode ?? prefs.mode;
  const useGrade: Grade = current?.grade ?? prefs.grade;

  return (
    <div className="learn">
      {/* ---- 侧栏 ---- */}
      <aside className="sidebar">
        <div className="seg-label">学段（在系统设置中修改）</div>
        <div className="grade-display" title="学段在首次填写时选定，如需修改请到「系统设置 → 孩子基础信息」">
          <span className="grade-display-value">{GRADE_LABEL[useGrade]}</span>
        </div>

        <button className="btn-new" onClick={() => onNewSession()} disabled={busy}>
          ＋ 新建学习
        </button>

        <div className="sidebar-label">最近学习</div>
        <div className="session-list">
          {sessions.length === 0 && <div className="session-empty">还没有学习记录</div>}
          {sessions.map((s) => (
            <div key={s.id} className={`session-item${current?.id === s.id ? " active" : ""}`}>
              <button className="session-open" onClick={() => onOpenSession(s.id)} disabled={busy}>
                <span className="session-mode">{s.mode === "eli5" ? <i className="ti ti-palette" aria-hidden="true"></i> : <i className="ti ti-school" aria-hidden="true"></i>}</span>
                <span className="session-title">{s.title || "新的学习"}</span>
                <span className="session-date">{fmtDate(s.updatedAt)}</span>
              </button>
              <button
                className="session-del"
                title="删除"
                onClick={() => {
                  if (confirm(`删除「${s.title || "新的学习"}」？不可恢复。`)) onDeleteSession(s.id);
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* ---- 主区 ---- */}
      <main className="learn-main">
        {/* 顶部：学习方式 + 模式说明 */}
        <div className="modelbar">
          <div className="seg-group mode-switch" role="tablist" aria-label="学习模式">
            {MODES.map((m) => (
              <button
                key={m}
                className={`seg${useMode === m ? " active" : ""}`}
                onClick={() => switchMode(m)}
                disabled={busy}
              >
                <span className="seg-icon">{m === "eli5" ? <i className="ti ti-palette" aria-hidden="true"></i> : <i className="ti ti-school" aria-hidden="true"></i>}</span>
                <span>{MODE_LABEL[m]}</span>
              </button>
            ))}
          </div>
          <span className="mode-chip">
            {useMode === "eli5" ? "大图少字讲明白" : "老师引导你想出来，不给答案"}
          </span>
          {!model && (
            <div className="modelbar-empty">
              尚无可用的模型配置（系统设置里填写 API Key 并启用模型）
              <button className="btn-link" onClick={goSettings}>
                去系统设置 →
              </button>
            </div>
          )}
        </div>

        {/* API 密钥无效：持续提示，直到成功一次 */}
        {authBanner && (
          <div className="api-banner" role="alert">
            <span>
              <i className="ti ti-alert-triangle" aria-hidden="true"></i> <b>API Key 无效或无权限</b>：当前模型用这个密钥无法访问（可能填错、已失效，或该账号未开通此模型）。
              请家长检查后重试。
            </span>
            <button className="btn-link" onClick={goSettings}>
              去系统设置检查 →
            </button>
          </div>
        )}

        {!model ? (
          <div className="setup-guide">            <div className="welcome-emoji"><i className="ti ti-key" aria-hidden="true"></i></div>
            <h2>还差一步：配置模型 API</h2>
            <p className="setup-lead">
              {hasAnyKey
                ? "检测到已填写 API Key，但没有任何「已启用」的模型（或厂商未启用），孩子端暂时无法开始学习。"
                : "还没有配置 API Key / 模型。自学小站使用家长自己的 API Key 调用大模型，配置好之后才能开始学习。"}
            </p>
            <ol className="setup-steps">
              <li>
                点下方按钮进入 <b>系统设置</b>
              </li>
              <li>选择一家厂商（推荐 SiliconFlow 或 DeepSeek），粘贴 API Key</li>
              <li>
                点「<b>测试</b>」确认连接成功 → 点「<b>获取模型</b>」勾选要用的模型 → 设为「<b>默认</b>」
              </li>
              <li>返回这里，就可以开始学习了</li>
            </ol>
            <button className="btn-send setup-go" onClick={goSettings}>
              去系统设置配置 →
            </button>
            <p className="setup-note">🔒 API Key 只保存在这台设备的浏览器里，不会上传到任何服务器。</p>
          </div>
        ) : !current ? (
          <div className="no-session">
            <div className="no-session-inner">
              <button className="btn-new big" onClick={() => onNewSession()}>
                ＋ 开始一次新的学习
              </button>
              <p className="no-session-hint">也可以直接在下方的输入框里输入内容，按 Enter 就开始</p>
            </div>
          </div>
        ) : isSocratic ? (
          <div className="chat-layout">
            <ChatView
              messages={current.messages}
              streamText={streamText}
              busy={busy}
              reportBusy={reportBusy}
              skillMap={current.skillMap}
              report={current.report}
              showMap={!!current.skillMap}
              onEnd={() => void endSession()}
              onStop={handleStop}
            />
            <div className="chat-side">
              <ChatSidePanel
                skillMap={current.skillMap}
                ended={!!current.report}
                onEnd={() => void endSession()}
                busy={busy}
              />
            </div>
          </div>
        ) : (
          <div className="chat-layout single">
            <Eli5View eli5={current.eli5} />
            {!current.eli5 || current.eli5.stage === "idle" ? (
              <div className="welcome">
                <div className="welcome-emoji"><i className="ti ti-palette" aria-hidden="true"></i></div>
                <h2>看图讲解</h2>
                <p>输入一个题目或知识点，老师会画一张大图讲给你懂，再出几道练习帮你巩固。</p>
                <div className="steps">
                  <span>① 输入题目</span>
                  <span>② 看大图听讲解</span>
                  <span>③ 做练习涨本领</span>
                </div>
                <p className="tip-line">💡 {dailyTip()}</p>
              </div>
            ) : null}
          </div>
        )}

        {/* 输入区（Codex 式：输入框底栏放模型与发送） */}
        <div className="composer-wrap">
          {images.length > 0 && (
            <div className="attach-row">
              {images.map((src, i) => (
                <div className="thumb" key={i}>
                  <img src={src} alt={`附图 ${i + 1}`} />
                  <button
                    className="thumb-x"
                    title="移除这张图片"
                    onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                </div>
              ))}
              {!canVision && (
                <span className="attach-warn">当前模型不支持图片输入，请切换支持多模态的模型</span>
              )}
            </div>
          )}
          {imgErr && <p className="attach-err">⚠ {imgErr}</p>}
          <div className="composer">
            <div className="composer-box">
              <textarea
                value={input}
                placeholder={
                  !model
                    ? "请先在「系统设置」里配置模型 API…"
                    : "输入题目或知识点…（Enter 发送）"
                }
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKey}
                disabled={busy || !model}
                rows={2}
              />
              <div className="composer-bar">
                {canVision && (
                  <button
                    className="icon-btn"
                    onClick={() => fileRef.current?.click()}
                    title="添加图片（拍题目/作业，或直接 Ctrl+V 粘贴）"
                    aria-label="添加图片"
                  >
                    <i className="ti ti-paperclip" aria-hidden="true"></i>
                  </button>
                )}
                <span className="composer-tip">{canVision ? "可 Ctrl+V 粘贴题目照片" : ""}</span>
                <div className="composer-right">
                  {model && (
                    <ModelSelect compact settings={settings} value={model} onChange={setModelOverride} />
                  )}
                  {busy ? (
                    <button className="btn-send stop" onClick={handleStop} title="停止生成">
                      停止
                    </button>
                  ) : (
                    <button
                      className="btn-send"
                      onClick={() => void handleSend()}
                      disabled={(!input.trim() && images.length === 0) || !model}
                    >
                      发送
                    </button>
                  )}
                </div>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => void onPickFiles(e)}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

/** 把一轮对话转成 OpenAI 兼容的 content（有图片时用多模态数组） */
function toApiContent(t: Turn): string | ContentPart[] {
  if (!t.images || t.images.length === 0) return t.content;
  return [
    { type: "text", text: t.content },
    ...t.images.map((url): ContentPart => ({ type: "image_url", image_url: { url } })),
  ];
}

// ---------------------------------------------------------------- 内部小组件

function ModelSelect({
  settings,
  value,
  onChange,
  compact,
}: {
  settings: Settings;
  value: VisibleModel | null;
  onChange: (v: VisibleModel | null) => void;
  compact?: boolean;
}) {
  const vis = visibleModels(settings);
  const current = vis.find(
    (v) => v.providerId === value?.providerId && v.modelId === value?.modelId,
  );
  return (
    <label
      className={`model-select${compact ? " compact" : ""}`}
      title={`切换模型${current ? `（当前：${current.modelId} · ${current.providerName}）` : ""}：只影响之后的提问，已有对话会保留`}
    >
      {!compact && <span className="model-select-label">切换模型</span>}
      <select
        value={value ? `${value.providerId}||${value.modelId}` : ""}
        title="选择一个已启用的模型（换模型后继续当前对话）"
        onChange={(e) => {
          const [pid, mid] = e.target.value.split("||");
          const hit = vis.find((v) => v.providerId === pid && v.modelId === mid);
          onChange(hit ?? null);
        }}
      >
        {vis.length === 0 && <option value="">未配置</option>}
        {vis.map((v) => (
          <option key={`${v.providerId}||${v.modelId}`} value={`${v.providerId}||${v.modelId}`}>
            {compact ? v.modelId : `${v.modelId}（${v.providerName}）`}
          </option>
        ))}
      </select>
    </label>
  );
}

// ---------------------------------------------------------------- 工具

function normalizeMap(parsed: SkillMap): SkillMap {
  const skills = parsed.skills
    .filter((s) => s && typeof s.name === "string")
    .slice(0, 12)
    .map((s) => ({
      name: String(s.name).slice(0, 40),
      level: Math.max(0, Math.min(5, Math.round(Number(s.level) || 0))),
      note: typeof s.note === "string" ? s.note.slice(0, 60) : undefined,
      focus: s.focus === true,
    }));
  const overall = Math.max(
    0,
    Math.min(100, Math.round(Number(parsed.overall) || Math.round((avgLevel(skills) / 5) * 100))),
  );
  return { topic: String(parsed.topic ?? "").slice(0, 60), overall, skills };
}

function avgLevel(skills: { level: number }[]): number {
  if (skills.length === 0) return 0;
  return skills.reduce((a, s) => a + s.level, 0) / skills.length;
}

function parsePractices(text: string): import("../lib/types").PracticeItem[] | null {
  const arr = parseJsonLoose<unknown>(text);
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const items: import("../lib/types").PracticeItem[] = [];
  for (const it of arr) {
    if (typeof it !== "object" || it === null) continue;
    const o = it as Record<string, unknown>;
    const q = typeof o.question === "string" ? o.question.trim() : "";
    if (!q) continue;
    const diff =
      o.difficulty === "进阶" || o.difficulty === "培优" ? o.difficulty : ("持平" as const);
    items.push({
      question: q,
      difficulty: diff,
      answer: String(o.answer ?? "").trim(),
      analysis: String(o.analysis ?? "").trim(),
    });
  }
  return items.length ? items : null;
}

function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : "未知错误";
  return `这个模型暂时连不上或出了问题：${msg}\n\n可以试试：在下方切换别的模型，或请家长到「系统设置」里测试一下连接。`;
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
