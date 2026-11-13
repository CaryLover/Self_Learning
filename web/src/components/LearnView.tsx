/**
 * 学习页：会话管理 + 两种模式的调用编排（ELI5 两段式 / 苏格拉底循环）
 */

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, ChatMsg, ContentPart, Grade, Mode, Session, Settings, SkillMap, Turn } from "../lib/types";
import { MODE_LABEL, GRADE_LABEL } from "../lib/types";
import { pickModel, resolveBase, visibleModels, type UiPrefs, type VisibleModel } from "../lib/store";
import { chatRequest, ApiError } from "../lib/api";
import { parseJsonLoose, splitProtocolBlock } from "../lib/extract";
import { buildContext } from "../lib/context";
import { uid } from "../lib/id";
import { ELI5_PROMPT_VERSION } from "../prompts/eli5Core";
import { runEli5Pipeline, runEli5Practice, runEli5UnverifiedFallback } from "../lib/eli5Pipeline";
import { recoverLessonImages } from "../lib/sessionImages";
import { buildSocraticSystem, buildEndSessionMessage } from "../prompts/socratic";
import { enforceReportPolicy } from "../lib/socraticReport";
import { dailyTip } from "../lib/encourage";
import { effectiveVision, fileToDataUrl, MAX_IMAGES } from "../lib/vision";

// 讲解与苏格拉底界面按需加载：首屏不下载 KaTeX、练习卡和聊天组件。
const ChatView = lazy(() => import("./ChatView").then((module) => ({ default: module.ChatView })));
const ChatSidePanel = lazy(() => import("./ChatView").then((module) => ({ default: module.ChatSidePanel })));
const Eli5View = lazy(() => import("./Eli5View").then((module) => ({ default: module.Eli5View })));

const MODES: Mode[] = ["eli5", "socratic"];
/** 记录最近一次 401/403 的模型，用于持续提示"密钥无效" */
const AUTHFAIL_KEY = "zxz.authfail.v1";

export interface LearnViewProps {
  active: boolean;
  settings: Settings;
  prefs: UiPrefs;
  sessions: Session[];
  current: Session | null;
  onPrefsChange: (p: UiPrefs) => void;
  onNewSession: (opts?: { mode?: Mode; grade?: Grade }) => void;
  onClearCurrent: () => void;
  onOpenSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onSaveSession: (s: Session) => void;
  goSettings: () => void;
}

export function LearnView(props: LearnViewProps) {
  const { active, settings, prefs, sessions, current, onPrefsChange, onNewSession, onClearCurrent, onOpenSession, onDeleteSession, onSaveSession, goSettings } = props;

  const [input, setInput] = useState("");
  const [images, setImages] = useState<string[]>([]); // 待发送的图片（data URL）
  const [imgErr, setImgErr] = useState<string | null>(null);
  const [preparingImages, setPreparingImages] = useState(false);
  const preparingImagesRef = useRef(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
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
      proxyUrl: settings.proxyUrl,
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
    // 只切换界面模式；不立即创建会话，首次发送时才写入“最近学习”
    if (current && current.mode !== mode) onClearCurrent();
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
        const report = enforceReportPolicy({
          knowledge: parsed.knowledge.map((k) => ({
            name: String(k.name ?? "").slice(0, 60),
            score: Math.max(0, Math.min(100, Math.round(Number(k.score) || 0))),
            status: String(k.status ?? ""),
            advice: String(k.advice ?? ""),
          })),
          generatedAt: Date.now(),
        }, answers);
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
    const ac = new AbortController();
    abortRef.current = ac;
    let timedOut = false;
    const timer = window.setTimeout(() => { timedOut = true; ac.abort(); }, 180_000);
    let s: Session = { ...s0, title: s0.title || topic.slice(0, 24), eli5: { stage: "explaining", topic, sourceImageCount: images.length, promptVersion: ELI5_PROMPT_VERSION } };
    commit(s);
    try {
      // 默认仅开发环境开放；构建开关只用于显式预览，结果仍需审核。
      const explicitPhysics = topic.startsWith("【物理测试】");
      const autoPhysics = __PHYSICS_PREVIEW__ && !explicitPhysics && s.grade !== "primary" && images.length === 0;
      let physicsUnverified = __PHYSICS_PREVIEW__ && !explicitPhysics && !autoPhysics;
      let physicsTextOnly = false;
      if ((import.meta.env.DEV || __PHYSICS_PREVIEW__) && (explicitPhysics || autoPhysics)) {
        if (explicitPhysics && s.grade !== "senior") {
          commit({ ...s, eli5: { ...s.eli5!, stage: "error", error: "物理测试原型暂时只支持高中学段。初中请去掉开头的【物理测试】后重新发送，让预览分流自动判断。" } });
          return;
        }
        const [{ preparePhysicsLesson, physicsModelVersion }, { PhysicsWorkerError }] = await Promise.all([
          import("../lib/physics/pipeline"), import("../lib/physics/workerError"),
        ]);
        const request = explicitPhysics ? topic.slice("【物理测试】".length).trim() : topic;
        let candidate: Awaited<ReturnType<typeof preparePhysicsLesson>>;
        try {
          candidate = await preparePhysicsLesson({
            topic: request, hasImages: images.length > 0, allowNotApplicable: autoPhysics, grade: s.grade, signal: ac.signal,
            call: (messages, signal) => call(messages, false, signal),
            render: async (model) => {
              try {
                const { renderPhysicsInWorker } = await import("../lib/physics/workerClient");
                return await renderPhysicsInWorker(model, ac.signal);
              } catch (error) {
                if (ac.signal.aborted || error instanceof PhysicsWorkerError) throw error;
                throw new PhysicsWorkerError("无法加载物理工具，请检查网络");
              }
            },
          });
        } catch (error) {
          if (!(error instanceof PhysicsWorkerError) || ac.signal.aborted) throw error;
          commit({ ...s, eli5: { ...s.eli5!, stage: "error", retryLesson: true, unverifiedFallback: autoPhysics, error: `物理工具处理失败：${error.message}。请检查网络或浏览器后重新生成讲解。` } });
          return;
        }
        if (candidate.status === "not_applicable" || candidate.status === "unsupported") {
          physicsUnverified = true;
          physicsTextOnly = candidate.status === "unsupported";
        } else if (candidate.status === "needs_review") {
          // 复核不是终点：保留重试入口；自动分流时再提供明确标注的未核验文字退路。
          s = { ...s, eli5: { ...s.eli5!, stage: "error", retryLesson: true, unverifiedFallback: autoPhysics, error: `${autoPhysics ? "物理工具无法自动核对这道题" : "物理测试需要复核"}：${candidate.reason}` } };
        } else {
          const physicsPreview = { status: "candidate" as const, modelVersion: physicsModelVersion(candidate.model.kind), model: candidate.model, result: candidate.result, evidence: candidate.evidence, assumptions: candidate.assumptions };
          s = { ...s, eli5: { ...s.eli5!, stage: "physics_explaining", html: candidate.html, physicsPreview, pendingPhysicsPractices: candidate.practices } };
          commit(s);
          const { addEli5PhysicsExplanation } = await import("../lib/physics/eli5Explain");
          const explained = await addEli5PhysicsExplanation({ candidate, topic: request, grade: s.grade, ctx: pctx, signal: ac.signal, call: (messages, signal) => call(messages, false, signal) });
          s = { ...s, eli5: { ...s.eli5!, stage: "done", html: explained.html, practices: explained.practices, physicsPreview, pendingPhysicsPractices: undefined, retryPhysicsExplanation: false } };
        }
        if (candidate.status !== "not_applicable" && candidate.status !== "unsupported") {
          commit(s);
          return;
        }
      }
      await runEli5Pipeline({
        grade: s.grade, topic, images, ctx: pctx, signal: ac.signal, textOnly: physicsTextOnly,
        call: (messages, signal) => call(messages, false, signal),
        update: (eli5) => { s = { ...s, eli5: physicsUnverified ? { ...eli5, physicsUnverified: true, physicsTextOnly } : eli5 }; commit(s); },
      });
    } catch (e) {
      const error = ac.signal.aborted ? (timedOut ? "生成超时，请重试或换个模型。" : "已停止生成。") : friendlyError(e);
      commit({ ...s, eli5: { ...s.eli5!, stage: "error", error, retryLesson: s.eli5?.stage === "explaining" && !!s.eli5.topic, retryPractice: s.eli5?.stage === "practicing" && !!s.eli5.html, retryPhysicsExplanation: s.eli5?.stage === "physics_explaining" && !!s.eli5.physicsPreview && !!s.eli5.pendingPhysicsPractices } });
    } finally {
      window.clearTimeout(timer);
      if (abortRef.current === ac) abortRef.current = null;
      setBusy(false);
    }
  }

  async function retryEli5Lesson(): Promise<void> {
    if (busy || !current?.eli5?.retryLesson || !current.eli5.topic) return;
    // 已经在未核验文字退路上的失败，继续走文字退路，不重新触发物理分析。
    if (current.eli5.unverifiedFallback && current.eli5.physicsTextOnly) {
      await continueEli5Unverified();
      return;
    }
    const originalImages = recoverLessonImages(current);
    if (!originalImages) {
      commit({ ...current, eli5: { ...current.eli5, retryLesson: false, error: "原题图片无法完整恢复，请重新上传图片并提交题目。" } });
      return;
    }
    if (originalImages.length && !canVision) {
      commit({ ...current, eli5: { ...current.eli5, error: "这道题包含图片，请先选择支持图片的模型，再重新生成讲解。" } });
      return;
    }
    await runEli5(current.eli5.topic, current, originalImages);
  }

  /**
   * 物理条件无法核对时，使用者可以主动退到普通讲解。
   * 这里只使用文字讲解：不展示未经核对的物理图和受力分析，并保留“未核验”提示。
   */
  async function continueEli5Unverified(): Promise<void> {
    const initial = current?.eli5;
    if (busy || !current || !initial?.unverifiedFallback || !initial.topic) return;
    if (!model || !apiKey || !base) {
      goSettings();
      return;
    }
    const originalImages = recoverLessonImages(current);
    if (!originalImages) {
      commit({ ...current, eli5: { ...initial, unverifiedFallback: false, retryLesson: true, error: "原题图片无法完整恢复，请重新上传图片并提交题目。" } });
      return;
    }
    if (originalImages.length && !canVision) {
      commit({ ...current, eli5: { ...initial, error: "这道题包含图片，请先选择支持图片的模型，再改用普通讲解。" } });
      return;
    }
    setBusy(true);
    const ac = new AbortController();
    abortRef.current = ac;
    let timedOut = false;
    const timer = window.setTimeout(() => { timedOut = true; ac.abort(); }, 180_000);
    let s: Session = {
      ...current,
      eli5: { ...initial, stage: "explaining", error: undefined, html: undefined, practices: undefined, retryLesson: false, retryPractice: false, retryPhysicsExplanation: false, unverifiedFallback: false, physicsPreview: undefined, pendingPhysicsPractices: undefined, physicsUnverified: true, physicsTextOnly: true },
    };
    commit(s);
    try {
      await runEli5UnverifiedFallback({
        grade: s.grade, topic: initial.topic, images: originalImages, ctx: pctx, signal: ac.signal,
        call: (messages, signal) => call(messages, false, signal),
        update: (eli5) => { s = { ...s, eli5 }; commit(s); },
      });
    } catch (error) {
      const detail = ac.signal.aborted ? (timedOut ? "生成超时。" : "已停止生成。") : friendlyError(error);
      const stage = s.eli5?.stage;
      const retryPractice = stage === "practicing" && !!s.eli5?.html;
      commit({ ...s, eli5: { ...s.eli5!, stage: "error", retryLesson: stage === "explaining" && !!s.eli5?.topic, retryPractice, unverifiedFallback: true, error: retryPractice ? `讲解已保留，练习未生成：${detail}` : `普通讲解未生成：${detail}` } });
    } finally {
      window.clearTimeout(timer);
      if (abortRef.current === ac) abortRef.current = null;
      setBusy(false);
    }
  }

  async function retryPhysicsExplanation(): Promise<void> {
    if (!(import.meta.env.DEV || __PHYSICS_PREVIEW__)) return;
    const initial = current?.eli5;
    if (busy || !current || !initial?.retryPhysicsExplanation || !initial.html || !initial.topic || !initial.physicsPreview || !initial.pendingPhysicsPractices) return;
    const topic = initial.topic.startsWith("【物理测试】") ? initial.topic.slice("【物理测试】".length).trim() : initial.topic;
    setBusy(true);
    const ac = new AbortController();
    abortRef.current = ac;
    let timedOut = false;
    const timer = window.setTimeout(() => { timedOut = true; ac.abort(); }, 180_000);
    let s: Session = { ...current, eli5: { ...initial, stage: "physics_explaining", error: undefined, retryPhysicsExplanation: false } };
    commit(s);
    try {
      const { addEli5PhysicsExplanation, restorePhysicsCandidate } = await import("../lib/physics/eli5Explain");
      const candidate = restorePhysicsCandidate(initial);
      if (!candidate) {
        commit({ ...s, eli5: { ...s.eli5!, stage: "error", html: undefined, physicsPreview: undefined, pendingPhysicsPractices: undefined, retryLesson: true, error: "已保存的物理结果未通过恢复检查，请重新生成讲解。" } });
        return;
      }
      const explained = await addEli5PhysicsExplanation({ candidate, topic, grade: s.grade, ctx: pctx, signal: ac.signal, call: (messages, signal) => call(messages, false, signal) });
      s = { ...s, eli5: { ...s.eli5!, stage: "done", html: explained.html, practices: explained.practices, pendingPhysicsPractices: undefined, retryPhysicsExplanation: false } };
      commit(s);
    } catch (error) {
      const detail = ac.signal.aborted ? (timedOut ? "生成超时。" : "已停止生成。") : friendlyError(error);
      commit({ ...s, eli5: { ...s.eli5!, stage: "error", error: `物理图和结果已保留，讲解未生成：${detail}`, retryPhysicsExplanation: true } });
    } finally {
      window.clearTimeout(timer);
      if (abortRef.current === ac) abortRef.current = null;
      setBusy(false);
    }
  }

  /** 补充讲解失败或用户不想等待时，保留已核对的物理图、结果和固定练习。 */
  async function skipPhysicsExplanation(): Promise<void> {
    if (!(import.meta.env.DEV || __PHYSICS_PREVIEW__)) return;
    const initial = current?.eli5;
    if (busy || !current || !initial?.retryPhysicsExplanation) return;
    setBusy(true);
    try {
      const { finishPhysicsWithoutExplanation } = await import("../lib/physics/eli5Explain");
      const next = finishPhysicsWithoutExplanation(initial);
      if (!next) {
        commit({ ...current, eli5: { ...initial, stage: "error", html: undefined, physicsPreview: undefined, pendingPhysicsPractices: undefined, retryPhysicsExplanation: false, retryLesson: true, error: "已保存的物理结果未通过恢复检查，请重新生成讲解。" } });
        return;
      }
      commit({ ...current, eli5: next });
    } catch {
      commit({ ...current, eli5: { ...initial, stage: "error", error: "无法加载物理讲解恢复模块，请重新生成讲解。", retryPhysicsExplanation: true } });
    } finally {
      setBusy(false);
    }
  }

  /** 练习反复生成失败时，允许保留讲解、直接结束本次学习。 */
  function skipEli5Practice(): void {
    const eli5 = current?.eli5;
    if (busy || !current || !eli5?.retryPractice || !eli5.html) return;
    commit({ ...current, eli5: { ...eli5, stage: "done", retryPractice: false, error: undefined } });
  }

  async function retryEli5Practice(): Promise<void> {
    if (busy || !current?.eli5?.html || !current.eli5.topic || !current.eli5.retryPractice) return;
    const originalImages = recoverLessonImages(current);
    if (!originalImages) {
      commit({ ...current, eli5: { ...current.eli5, retryPractice: false, error: "原题图片无法完整恢复，请重新上传图片并提交题目。" } });
      return;
    }
    if (originalImages.length && !canVision) {
      commit({ ...current, eli5: { ...current.eli5, error: "这道题包含图片，请先选择支持图片的模型，再重新生成练习。" } });
      return;
    }
    setBusy(true);
    const ac = new AbortController();
    abortRef.current = ac;
    let timedOut = false;
    const timer = window.setTimeout(() => { timedOut = true; ac.abort(); }, 180_000);
    let s = current;
    try {
      await runEli5Practice({
        grade: s.grade, topic: current.eli5.topic, images: originalImages, ctx: pctx, signal: ac.signal, textOnly: current.eli5.physicsTextOnly,
        initial: current.eli5, call: (messages, signal) => call(messages, false, signal),
        update: eli5 => { s = { ...s, eli5 }; commit(s); },
      });
    } catch (error) {
      const detail = ac.signal.aborted ? (timedOut ? "生成超时。" : "已停止生成。") : friendlyError(error);
      commit({ ...s, eli5: { ...s.eli5!, stage: "error", retryPractice: true, error: `讲解已保留，练习未生成：${detail}` } });
    } finally {
      window.clearTimeout(timer);
      if (abortRef.current === ac) abortRef.current = null;
      setBusy(false);
    }
  }

  // ---------------------------------------------------------------- 输入分发

  /** 把文件压缩后加入待发送列表（点选 / 粘贴 / 拖入共用） */
  async function addFiles(files: File[]): Promise<void> {
    if (files.length === 0) return;
    if (preparingImagesRef.current) {
      setImgErr("正在处理上一批图片，请稍后再添加。");
      return;
    }
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
    preparingImagesRef.current = true;
    setPreparingImages(true);
    try {
      for (const f of files.slice(0, room)) {
        try {
          added.push(await fileToDataUrl(f));
        } catch (err) {
          setImgErr(err instanceof Error ? err.message : "图片处理失败");
        }
      }
      if (added.length > 0) setImages((prev) => [...prev, ...added].slice(0, MAX_IMAGES));
    } finally {
      preparingImagesRef.current = false;
      setPreparingImages(false);
    }
  }

  /** 选择图片：压缩后加入待发送列表（最多 MAX_IMAGES 张） */
  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // 允许重复选择同一文件
    await addFiles(files);
  }

  // 支持 Ctrl+V 粘贴剪贴板里的图片（截图/复制图片后直接粘贴）
  useEffect(() => {
    if (!active) return;
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
  }, [active, canVision, images.length]);

  // 生成期间关闭或刷新页面会中断请求：先让浏览器提示一次，减少误操作丢失结果。
  useEffect(() => {
    if (!busy) return;
    function onBeforeUnload(e: BeforeUnloadEvent): void {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [busy]);

  async function handleSend(): Promise<void> {
    const text = input.trim();
    if (busy) return;
    if (preparingImagesRef.current) return;
    if (!text && images.length === 0) return;
    if (!model || !apiKey || !base) {
      goSettings();
      return;
    }
    if (images.length > 0 && !canVision) {
      setImgErr("当前模型不支持图片，请切换支持图片的模型后再发送。");
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
    const displayTitle = padded === "请讲解这张图片里的题目。"
      ? "图片题目"
      : padded.replace(/^【物理测试】/, "").trim().slice(0, 24) || "新的学习";
    s = {
      ...s,
      title: s.title || displayTitle,
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

  /** 把当前题目放回输入框，便于补充条件或修改后重新提交。 */
  function editTopic(): void {
    const eli5 = current?.eli5;
    if (!eli5?.topic) return;
    const topic = eli5.topic.replace(/^【物理测试】/, "").trim();
    if (!topic || topic === "请讲解这张图片里的题目。") return;
    setInput(topic);
    setImgErr(null);
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  // ---------------------------------------------------------------- 渲染

  const isSocratic = (current?.mode ?? prefs.mode) === "socratic";
  const useMode: Mode = current?.mode ?? prefs.mode;
  const useGrade: Grade = current?.grade ?? prefs.grade;
  const editTopicText = current?.eli5?.topic?.replace(/^【物理测试】/, "").trim() ?? "";
  const canEditTopic = !!current?.eli5 && !!editTopicText && editTopicText !== "请讲解这张图片里的题目。" && !current.eli5.retryPractice && !current.eli5.retryPhysicsExplanation;

  return (
    <div className="learn" style={active ? undefined : { display: "none" }}>
      {/* ---- 侧栏 ---- */}
      <aside className="sidebar" aria-label="学段与最近学习">
        <div className="seg-label">学段（在系统设置中修改）</div>
        <div className="grade-display" title="学段在首次填写时选定，如需修改请到「系统设置 → 孩子基础信息」">
          <span className="grade-display-value">{GRADE_LABEL[useGrade]}</span>
        </div>

        <button className="btn-new" onClick={() => onNewSession()} disabled={busy}>
          ＋ 新建学习
        </button>

        <div className="sidebar-label">最近学习</div>
        <nav className="session-list" aria-label="最近学习">
          {sessions.length === 0 && <div className="session-empty">还没有学习记录</div>}
          {sessions.map((s) => (
            <div key={s.id} className={`session-item${current?.id === s.id ? " active" : ""}`}>
              <button
                className="session-open"
                onClick={() => onOpenSession(s.id)}
                disabled={busy}
                aria-current={current?.id === s.id ? "true" : undefined}
              >
                <span className="session-mode">{s.mode === "eli5" ? <i className="ti ti-palette" aria-hidden="true"></i> : <i className="ti ti-school" aria-hidden="true"></i>}</span>
                <span className="session-title">{s.title || "新的学习"}</span>
                <span className="session-date">{fmtDate(s.updatedAt)}</span>
              </button>
              <button
                className="session-del"
                title="删除"
                aria-label={`删除会话：${s.title || "新的学习"}`}
                disabled={busy}
                onClick={() => {
                  if (confirm(`删除「${s.title || "新的学习"}」？不可恢复。`)) onDeleteSession(s.id);
                }}
              >
                ×
              </button>
            </div>
          ))}
        </nav>
      </aside>

      {/* ---- 主区 ---- */}
      <main className="learn-main">
        {/* 顶部：学习方式 + 模式说明 */}
        <div className="modelbar">
          <div className="seg-group mode-switch" role="tablist" aria-label="学习模式">
            {MODES.map((m) => (
              <button
                key={m}
                id={`mode-tab-${m}`}
                className={`seg${useMode === m ? " active" : ""}`}
                onClick={() => switchMode(m)}
                disabled={busy}
                role="tab"
                aria-selected={useMode === m}
                aria-controls={model && current ? "mode-panel" : undefined}
              >
                <span className="seg-icon">{m === "eli5" ? <i className="ti ti-palette" aria-hidden="true"></i> : <i className="ti ti-school" aria-hidden="true"></i>}</span>
                <span>{MODE_LABEL[m]}</span>
              </button>
            ))}
          </div>
          <span className="mode-chip">
            <i className="ti ti-info-circle" aria-hidden="true"></i>
            模式说明：{useMode === "eli5" ? "大图少字讲明白" : "老师引导你想出来，不给答案"}
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
            <p className="setup-note">🔒 API Key 保存在本机浏览器；使用模型时会随请求发送给所选服务，如启用代理也会经过代理。</p>
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
          <Suspense fallback={<div className="report-busy">正在加载辅导界面…</div>}>
            <div className="chat-layout" role="tabpanel" id="mode-panel" aria-labelledby="mode-tab-socratic">
              <ChatView
                messages={current.messages}
                streamText={streamText}
                busy={busy}
                reportBusy={reportBusy}
                skillMap={current.skillMap}
                report={current.report}
                showMap={!!current.skillMap}
                reportMeta={{ nickname: settings.profile.nickname || undefined, gradeLabel: GRADE_LABEL[useGrade] }}
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
          </Suspense>
        ) : (
          <Suspense fallback={<div className="report-busy">正在加载讲解界面…</div>}>
            <div className="chat-layout single" role="tabpanel" id="mode-panel" aria-labelledby="mode-tab-eli5">
              <Eli5View eli5={current.eli5} busy={busy} onRetryLesson={() => void retryEli5Lesson()} onRetryPractice={() => void retryEli5Practice()} onSkipPractice={skipEli5Practice} onRetryPhysicsExplanation={() => void retryPhysicsExplanation()} onSkipPhysicsExplanation={() => void skipPhysicsExplanation()} onContinueUnverified={() => void continueEli5Unverified()} onEditTopic={canEditTopic ? editTopic : undefined} physicsRetryEnabled={import.meta.env.DEV || __PHYSICS_PREVIEW__} />
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
          </Suspense>
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
                    aria-label={`移除第 ${i + 1} 张图片`}
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
          {preparingImages && <p className="attach-processing" role="status">正在处理图片，请稍候…</p>}
          <div className="composer">
            <div className="composer-box">
              <textarea
                ref={composerRef}
                id="composer-input"
                aria-label="输入题目或知识点"
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
                    <ModelSelect compact settings={settings} value={model} onChange={(next) => { setModelOverride(next); setImgErr(null); }} />
                  )}
                  {busy ? (
                    <button className="btn-send stop" onClick={handleStop} title="停止生成">
                      停止
                    </button>
                  ) : (
                    <button
                      className="btn-send"
                      onClick={() => void handleSend()}
                      disabled={preparingImages || (!input.trim() && images.length === 0) || !model}
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
        aria-label="选择模型"
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

function friendlyError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 401 || e.status === 403) return "API Key 无效或没有权限。请家长到「系统设置 → 模型厂商」检查密钥和模型是否已开通。";
    if (e.status === 429) return "请求太频繁或额度不足。请稍后再试，或在下方切换另一个模型。";
    if (e.status && e.status >= 500) return "模型服务暂时不可用。请稍后重试，或切换另一个模型。";
  }
  if (e instanceof TypeError) return "网络连接失败。请检查网络或代理设置后重试。";
  const msg = e instanceof Error ? e.message : "未知错误";
  return `这个模型暂时连不上或出了问题：${msg}\n\n可以试试：在下方切换别的模型，或请家长到「系统设置」里测试一下连接。`;
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const monthDay = `${d.getMonth() + 1}/${d.getDate()}`;
  return d.getFullYear() === now.getFullYear() ? monthDay : `${d.getFullYear()}/${monthDay}`;
}
