/** 家长设置：localStorage 持久化（key 只存这里，永不上传） */

import type { Grade, Mode, Settings } from "./types";
import { PROVIDER_PRESETS } from "./providers";

const KEY = "zxz.settings.v1";
const UI_KEY = "zxz.ui.v1";

/**
 * 默认转发代理（站点部署者可通过构建变量 VITE_DEFAULT_PROXY_URL 覆盖）。
 * 家长设置里仍可修改；历史存档里为空、或仍是旧默认地址时，自动升级为新默认值。
 */
export const DEFAULT_PROXY_URL =
  (import.meta.env.VITE_DEFAULT_PROXY_URL as string | undefined)?.trim() ||
  "https://relay.oj-codes.com";

const LEGACY_DEFAULT_PROXY = "https://zixue-relay.lukasaoka2018.workers.dev";

export interface UiPrefs {
  grade: Grade;
  mode: Mode;
}

export function defaultSettings(): Settings {
  const providers: Settings["providers"] = {};
  for (const p of PROVIDER_PRESETS) {
    const models: Record<string, { enabled: boolean }> = {};
    for (const m of p.builtinModels ?? []) models[m] = { enabled: true };
    providers[p.id] = {
      enabled: p.id === "siliconflow", // 默认只启用推荐厂商，家长可自行开启
      models,
    };
  }
  return {
    profile: { nickname: "", avatar: "🦊", onboarded: false },
    proxyUrl: DEFAULT_PROXY_URL,
    providers,
  };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSettings();
    const parsed = JSON.parse(raw) as Settings;
    // 与预置清单合并：新增厂商/内置模型自动补齐，家长改动保留
    const base = defaultSettings();
    const merged: Settings = {
      ...base,
      ...parsed,
      profile: { ...base.profile, ...parsed.profile },
      providers: { ...base.providers },
      proxyUrl:
        !parsed.proxyUrl?.trim() || parsed.proxyUrl.trim() === LEGACY_DEFAULT_PROXY
          ? base.proxyUrl // 旧存档为空或仍是旧默认地址 → 升级为当前默认
          : parsed.proxyUrl.trim(),
    };
    for (const p of PROVIDER_PRESETS) {
      const saved = parsed.providers?.[p.id];
      if (!saved) continue;
      merged.providers[p.id] = {
        ...base.providers[p.id],
        ...saved,
        models: { ...base.providers[p.id].models, ...saved.models },
      };
    }
    return merged;
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function clearAllKeys(s: Settings): Settings {
  const cleared: Settings = { ...s, providers: {} };
  for (const p of PROVIDER_PRESETS) {
    cleared.providers[p.id] = { ...s.providers[p.id], apiKey: "" };
  }
  return cleared;
}

// ---- UI 偏好（学段/模式，不涉及隐私） ----

export function loadUiPrefs(): UiPrefs {
  try {
    const raw = localStorage.getItem(UI_KEY);
    if (raw) return JSON.parse(raw) as UiPrefs;
  } catch {
    /* 忽略 */
  }
  return { grade: "primary", mode: "eli5" };
}

export function saveUiPrefs(p: UiPrefs): void {
  localStorage.setItem(UI_KEY, JSON.stringify(p));
}

// ---- 孩子端视角：只看启用的厂商与模型 ----

export interface VisibleModel {
  providerId: string;
  providerName: string;
  modelId: string;
}

export function visibleModels(s: Settings): VisibleModel[] {
  const out: VisibleModel[] = [];
  for (const p of PROVIDER_PRESETS) {
    const st = s.providers[p.id];
    if (!st?.enabled || !st.apiKey) continue;
    for (const [modelId, m] of Object.entries(st.models)) {
      if (m.enabled) {
        out.push({ providerId: p.id, providerName: p.name, modelId });
      }
    }
  }
  return out;
}

export function pickModel(s: Settings): VisibleModel | null {
  const vis = visibleModels(s);
  if (vis.length === 0) return null;
  // 默认模型优先，否则取第一个可见模型
  for (const p of PROVIDER_PRESETS) {
    const st = s.providers[p.id];
    if (st?.enabled && st.apiKey && st.defaultModel) {
      const hit = vis.find((v) => v.providerId === p.id && v.modelId === st.defaultModel);
      if (hit) return hit;
    }
  }
  return vis[0];
}

export function resolveBase(s: Settings, providerId: string): string {
  const preset = PROVIDER_PRESETS.find((p) => p.id === providerId);
  const st = s.providers[providerId];
  return st?.base?.trim() || preset?.base || "";
}
