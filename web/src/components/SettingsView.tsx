/**
 * 家长设置页：厂商/模型管理（CherryStudio 式）、代理地址、孩子档案、安全须知。
 * 所有改动即时保存到 localStorage；API key 只存本机浏览器。
 */

import { useState } from "react";
import type { Grade, ProviderState, Settings } from "../lib/types";
import { PROVIDER_PRESETS, type ProviderPreset } from "../lib/providers";
import { fetchModelList, testProxy } from "../lib/api";
import { resolveBase, visibleModels } from "../lib/store";
import { effectiveVision } from "../lib/vision";
import { GRADE_LEVELS } from "../lib/grade";

const AVATARS = ["🦊", "🐱", "🐰", "🐼", "🐯", "🦖", "🐳", "🦉", "⭐", "🌸"];

export function SettingsView({
  settings,
  grade,
  onGradeChange,
  onChange,
  goLearn,
}: {
  settings: Settings;
  grade: Grade;
  onGradeChange: (g: Grade) => void;
  onChange: (s: Settings) => void;
  goLearn: () => void;
}) {
  const [proxyResult, setProxyResult] = useState<string | null>(null);
  const [testingProxy, setTestingProxy] = useState(false);
  const [showProxy, setShowProxy] = useState(false); // 代理属于高级项，默认收起
  const availableCount = visibleModels(settings).length;
  const hasVisionModel = visibleModels(settings).some((v) =>
    effectiveVision(v.modelId, settings.providers[v.providerId]?.models[v.modelId]?.vision),
  );

  function patchProvider(id: string, patch: Partial<ProviderState>): void {
    onChange({
      ...settings,
      providers: {
        ...settings.providers,
        [id]: { ...settings.providers[id], ...patch },
      },
    });
  }

  async function doTestProxy(): Promise<void> {
    if (!settings.proxyUrl.trim()) return;
    setTestingProxy(true);
    const r = await testProxy(settings.proxyUrl.trim());
    setProxyResult(r.ok ? `✅ ${r.message}` : `❌ ${r.message}`);
    setTestingProxy(false);
  }

  return (
    <div className="settings">
      <header className="settings-head">
        <h1><i className="ti ti-settings" aria-hidden="true"></i> 系统设置</h1>
        <button className="btn-link" onClick={goLearn}>
          ← 返回学习页
        </button>
      </header>

      {/* ---- 单元一：孩子基础信息 ---- */}
      <section className="card profile-unit">
        <h2><i className="ti ti-user" aria-hidden="true"></i> 单元一 · 孩子基础信息</h2>
        <p className="hint">修改后自动保存到本机浏览器；学习页顶部的头像与称呼会同步更新。</p>
        <div className="row">
          <label className="inline-label">
            昵称：
            <input
              type="text"
              placeholder="怎么称呼孩子（可选）"
              maxLength={12}
              value={settings.profile.nickname}
              onChange={(e) => onChange({ ...settings, profile: { ...settings.profile, nickname: e.target.value } })}
            />
          </label>
        </div>
        <div className="avatar-row">
          {AVATARS.map((a) => (
            <button
              key={a}
              className={`avatar${settings.profile.avatar === a ? " on" : ""}`}
              onClick={() => onChange({ ...settings, profile: { ...settings.profile, avatar: a } })}
            >
              {a}
            </button>
          ))}
        </div>

        <label className="unit-field-label">学段</label>
        <div className="grade-pick">
          {(["primary", "junior", "senior"] as Grade[]).map((g) => (
            <button
              key={g}
              className={`grade-card small${grade === g ? " on" : ""}`}
              onClick={() => {
                onGradeChange(g);
                // 切换学段后，原年级若不属于新学段则清空
                if (!GRADE_LEVELS[g].includes(settings.profile.gradeLevel || "")) {
                  onChange({ ...settings, profile: { ...settings.profile, gradeLevel: "" } });
                }
              }}
            >
              <b>{g === "primary" ? "小学" : g === "junior" ? "初中" : "高中"}</b>
            </button>
          ))}
        </div>

        <label className="unit-field-label">当前年级</label>
        <div className="level-pick">
          {GRADE_LEVELS[grade].map((lv) => (
            <button
              key={lv}
              className={`level-chip${settings.profile.gradeLevel === lv ? " on" : ""}`}
              onClick={() =>
                onChange({ ...settings, profile: { ...settings.profile, gradeLevel: lv } })
              }
            >
              {lv}
            </button>
          ))}
        </div>
        {!settings.profile.gradeLevel && (
          <p className="hint hint-warn">尚未选择当前年级——请补选，模型需要它来避免超纲讲题。</p>
        )}
        <p className="hint">
          讲题方法按所选学段与年级的课程范围约束，避免超纲。
        </p>
      </section>

      {/* ---- 单元二：系统设置（大模型厂商与 API） ---- */}
      <div className="unit2">
        <h2 className="unit2-title">单元二 · 系统设置（大模型厂商与 API）</h2>
      </div>

      {/* ---- 安全须知 ---- */}
      <section className="notice">
        <h2><i className="ti ti-lock" aria-hidden="true"></i> 安全须知（请家长阅读）</h2>
        <ul>
          <li>
            <b>API key 保存在这台设备的浏览器里</b>（localStorage）。调用时，浏览器会将 key 随请求发送给所选模型服务；如使用代理，请求会先经过代理。
          </li>
          <li>不要在公共电脑上使用；用完可在下方一键删除全部 key。</li>
          <li>建议在各厂商后台设置<b>消费限额 / 余额告警</b>，控制孩子的使用成本。</li>
          <li>
            模型请求会包含题目、选用的图片和用于讲解的学生信息。代理和模型服务会接收请求，请选择信任的服务并了解其数据处理方式。
          </li>
        </ul>
      </section>

      {/* ---- 厂商管理（单元二内容） ---- */}
      <section className="providers">
        <h2><i className="ti ti-puzzle" aria-hidden="true"></i> 大模型厂商与 API 配置</h2>
        <p className="hint">
          启用厂商 → 填入 API key → 测试 → 获取模型 → 勾选孩子可用的模型 → 设一个默认模型。
          孩子端只会看到启用厂商下的启用模型，看不到任何 key。
        </p>
        <p className={`hint${availableCount === 0 ? " hint-warn" : ""}`}>
          当前孩子可用模型：<b>{availableCount}</b> 个
          {availableCount === 0 ? "（尚未配置完成，孩子端会看到配置引导，无法开始学习）" : ""}
        </p>
        <p className="hint">
          模型名后出现<b>眼睛图标</b>表示支持图片输入（多模态）；判断不准时，把鼠标移到模型名上可手动标记或取消。
        </p>
        {!hasVisionModel && availableCount > 0 && (
          <p className="hint">
            💡 想让孩子<b>拍题目照片</b>提问？请再启用一个多模态模型（名字后带 👁），例如：智谱
            <code>glm-4v-flash</code>（免费）、SiliconFlow 的 <code>Qwen/Qwen2.5-VL-7B-Instruct</code>。
          </p>
        )}
        {PROVIDER_PRESETS.map((p) => (
          <ProviderCard
            key={p.id}
            preset={p}
            state={settings.providers[p.id]}
            proxyUrl={settings.proxyUrl}
            onChange={(patch) => patchProvider(p.id, patch)}
          />
        ))}
      </section>

      {/* ---- 转发代理（高级项，默认收起，放在最后） ---- */}
      <section className="card proxy-card">
        <h2>
          转发代理
          <span className="badge-ok">已预置</span>
        </h2>
        <p className="hint">
          网站已内置默认代理，<b>无需任何设置</b>，直接配置上方厂商即可。
        </p>
        <p className="proxy-line">当前：{settings.proxyUrl || "（未使用代理，直连厂商）"}</p>
        <button className="btn-link" onClick={() => setShowProxy((v) => !v)}>
          {showProxy ? "收起高级设置 ▲" : "高级：修改代理地址 ▾"}
        </button>
        {showProxy && (
          <>
            <div className="row">
              <input
                type="text"
                placeholder="https://relay.你的子域名.workers.dev"
                value={settings.proxyUrl}
                  onChange={(e) => onChange({ ...settings, proxyUrl: e.target.value, proxyExplicit: true })}
              />
              <button
                className="btn"
                onClick={() => void doTestProxy()}
                disabled={testingProxy || !settings.proxyUrl.trim()}
              >
                {testingProxy ? "测试中…" : "测试代理"}
              </button>
            </div>
            <p className="hint">
              仅在使用自建代理时需要修改（见项目 <code>docs/DEPLOY.md</code>）；清空则尝试浏览器直连厂商（仅个别厂商可行）。
            </p>
          </>
        )}
        {proxyResult && <p className="test-result">{proxyResult}</p>}
      </section>

      <footer className="settings-foot">
        <button
          className="btn danger"
          onClick={() => {
            if (confirm("确定删除全部厂商的 API key？")) {
              const cleared = { ...settings };
              cleared.providers = {};
              for (const p of PROVIDER_PRESETS) {
                cleared.providers[p.id] = { ...settings.providers[p.id], apiKey: "" };
              }
              onChange(cleared);
            }
          }}
        >
          一键删除全部 API key
        </button>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------- 单个厂商卡片

function ProviderCard({
  preset,
  state,
  proxyUrl,
  onChange,
}: {
  preset: ProviderPreset;
  state: ProviderState;
  proxyUrl: string;
  onChange: (patch: Partial<ProviderState>) => void;
}) {
  const [showKey, setShowKey] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [fetching, setFetching] = useState(false);

  const base = resolveBase({ providers: { [preset.id]: state } } as Settings, preset.id);
  const modelIds = Object.keys(state.models);
  const enabledCount = modelIds.filter((m) => state.models[m]?.enabled).length;  const defaultModel = state.defaultModel;

  async function doTest(): Promise<void> {
    if (!state.apiKey) {
      setTestMsg("❌ 请先填入 API key");
      return;
    }
    const model = defaultModel ?? modelIds.find((m) => state.models[m]?.enabled) ?? modelIds[0];
    if (!model) {
      setTestMsg("❌ 没有可测试的模型，请先获取模型");
      return;
    }
    setTesting(true);
    setTestMsg(null);
    const r = await import("../lib/api").then((m) => m.testProvider(proxyUrl, base, state.apiKey!, model));
    setTestMsg(r.ok ? `✅ ${r.message} · ${model}` : `❌ ${r.message}`);
    setTesting(false);
  }

  async function doFetch(): Promise<void> {
    if (!state.apiKey) {
      setTestMsg("❌ 拉取模型列表也需要 API key");
      return;
    }
    setFetching(true);
    setTestMsg(null);
    try {
      const ids = await fetchModelList(proxyUrl, base, state.apiKey!);
      if (ids.length === 0) {
        setTestMsg("⚠️ 接口没有返回模型，已保留内置清单");
      } else {
        const hadEnabled = enabledCount > 0;
        const models: ProviderState["models"] = { ...state.models };
        for (const id of ids) {
          if (!models[id]) models[id] = { enabled: !hadEnabled };
        }
        onChange({ models });
        setTestMsg(`✅ 获取到 ${ids.length} 个模型（已合并，保留你原有的勾选）`);
      }
    } catch (e) {
      setTestMsg(`❌ ${e instanceof Error ? e.message : "拉取失败"}（已保留内置清单）`);
    }
    setFetching(false);
  }

  function setAll(enabled: boolean): void {
    const models: ProviderState["models"] = {};
    for (const m of modelIds) models[m] = { enabled };
    onChange({ models });
  }

  return (
    <div className={`provider${state.enabled ? " on" : ""}`}>
      <header className="provider-head">
        <label className="switch">
          <input
            type="checkbox"
            checked={state.enabled}
            onChange={(e) => onChange({ enabled: e.target.checked })}
          />
          <span className="switch-ui" />
        </label>
        <div className="provider-name">
          <b>{preset.name}</b>
          {preset.note && <span className="provider-note">{preset.note}</span>}
        </div>
        <a className="btn-link" href={preset.docsUrl} target="_blank" rel="noopener noreferrer">
          获取 key ↗
        </a>
      </header>

      {state.enabled && (
        <div className="provider-body">
          {!state.apiKey && (
            <p className="hint hint-warn">
              尚未填写 API Key —— 填入并点「测试」成功后，孩子端才会看到这个厂商的模型。
            </p>
          )}
          <div className="row">
            <label className="inline-label">
              地址：
              <input
                type="text"
                placeholder={preset.base}
                value={state.base ?? ""}
                onChange={(e) => onChange({ base: e.target.value })}
              />
            </label>
          </div>
          <div className="row">
            <label className="inline-label grow">
              Key：
              <input
                type={showKey ? "text" : "password"}
                placeholder={preset.keyHint ? `API key（${preset.keyHint}）` : "API key"}
                value={state.apiKey ?? ""}
                autoComplete="off"
                onChange={(e) => onChange({ apiKey: e.target.value })}
              />
            </label>
            <button className="btn small" onClick={() => setShowKey((v) => !v)}>
              {showKey ? "隐藏" : "显示"}
            </button>
            {state.apiKey && (
              <button className="btn small" onClick={() => onChange({ apiKey: "" })}>
                删除
              </button>
            )}
          </div>

          <div className="row btns">
            <button className="btn" onClick={() => void doTest()} disabled={testing}>
              {testing ? "测试中…" : "测试"}
            </button>
            <button className="btn" onClick={() => void doFetch()} disabled={fetching}>
              {fetching ? "获取中…" : "获取模型"}
            </button>
            <span className="enabled-count">已启用 {enabledCount} 个模型</span>
          </div>
          {testMsg && <p className="test-result">{testMsg}</p>}

          {modelIds.length > 0 && (
            <div className="models">
              <div className="row btns">
                <button className="btn small" onClick={() => setAll(true)}>
                  全启用
                </button>
                <button className="btn small" onClick={() => setAll(false)}>
                  全禁用
                </button>
                <span className="enabled-hint">孩子在学习页顶部可随时切换已启用的模型</span>
              </div>
              <ul className="model-list">
                {modelIds.map((m) => (
                  <li key={m} className={state.models[m]?.enabled ? "" : "off"}>
                    <label className="switch sm">
                      <input
                        type="checkbox"
                        checked={!!state.models[m]?.enabled}
                        onChange={(e) =>
                          onChange({ models: { ...state.models, [m]: { enabled: e.target.checked } } })
                        }
                      />
                      <span className="switch-ui" />
                    </label>
                    <span className="model-name" title={m}>
                      {m}
                      {(() => {
                        const on = effectiveVision(m, state.models[m]?.vision);
                        return (
                          <button
                            className={`vision-eye${on ? " on" : ""}`}
                            aria-label={on ? "多模态模型，支持图片输入" : "标记为多模态模型"}
                            title={
                              on
                                ? "多模态模型：支持图片输入（点击可取消标记）"
                                : "标记为多模态模型（支持图片输入）"
                            }
                            onClick={(e) => {
                              e.preventDefault();
                              onChange({
                                models: {
                                  ...state.models,
                                  [m]: { ...state.models[m], vision: !on },
                                },
                              });
                            }}
                          >
                            {on ? <EyeIcon /> : <EyeOffIcon />}
                          </button>
                        );
                      })()}
                    </span>
                    <label className="default-radio">
                      <input
                        type="radio"
                        name={`default-${preset.id}`}
                        checked={defaultModel === m}
                        onChange={() => onChange({ defaultModel: m })}
                      />
                      默认
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* 眼睛图标：仅多模态模型显示实心眼；非多模态默认隐藏，悬停行时出现淡眼（可手动标记） */
function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5C6.5 5 2.6 9.1 1.4 12c1.2 2.9 5.1 7 10.6 7s9.4-4.1 10.6-7C21.4 9.1 17.5 5 12 5Zm0 11.2A4.2 4.2 0 1 1 12 7.8a4.2 4.2 0 0 1 0 8.4Zm0-6.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8Z" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.4 3.5 3.5 2.4l18.1 18.1-1.1 1.1-3.2-3.2A11 11 0 0 1 12 19C6.5 19 2.6 14.9 1.4 12a13 13 0 0 1 4.1-4.7L2.4 3.5Zm5.7 4.5A9.7 9.7 0 0 0 3.7 12c1.2 2.3 4.4 5 8.3 5 1.6 0 3.1-.5 4.4-1.3l-2-2a4.2 4.2 0 0 1-5.6-5.6L8.1 8Zm3.9-3c5.5 0 9.4 4.1 10.6 7a13.2 13.2 0 0 1-3.2 4.1l-2.5-2.5c.2-.5.3-1 .3-1.6A4.2 4.2 0 0 0 9.4 8.8L7.2 6.6C8.7 5.6 10.3 5 12 5Z" />
    </svg>
  );
}
