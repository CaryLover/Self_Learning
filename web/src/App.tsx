import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import type { Grade, Mode, Session, Settings } from "./lib/types";
import { loadSettings, loadUiPrefs, saveSettings, saveUiPrefs, type UiPrefs } from "./lib/store";
import { deleteSession, getSession, listSessions, putSession } from "./lib/db";
import { uid } from "./lib/id";
import { recoverSession } from "./lib/recoverSession";
import { LearnView } from "./components/LearnView";
import { OnboardingDialog } from "./components/OnboardingDialog";

const SettingsView = lazy(() => import("./components/SettingsView").then((module) => ({ default: module.SettingsView })));

type Page = "learn" | "settings";
/** startup：每次打开网站时先弹出（预填已保存信息）；edit：点顶栏「修改」打开 */
type OnboardMode = "startup" | "edit" | null;

function pageFromHash(): Page {
  return location.hash === "#/settings" ? "settings" : "learn";
}

export default function App() {
  const [page, setPage] = useState<Page>(pageFromHash);
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [prefs, setPrefs] = useState<UiPrefs>(() => loadUiPrefs());
  const [sessions, setSessions] = useState<Session[]>([]);
  const [current, setCurrent] = useState<Session | null>(null);
  // 每次打开网站先弹出信息确认框（内容预填自本地存档，可直接修改）
  const [onboardMode, setOnboardMode] = useState<OnboardMode>("startup");
  // 本机存储写入失败（隐私模式、配额、策略限制）时提示，避免误以为已保存
  const [storageWarn, setStorageWarn] = useState(false);
  // 跟随系统外观时，监听系统深浅色变化
  const [systemDark, setSystemDark] = useState(() => {
    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch {
      return false;
    }
  });

  // 路由（hash）
  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // 学段主题
  useEffect(() => {
    document.documentElement.dataset.grade = prefs.grade;
  }, [prefs.grade]);

  const dark = prefs.theme === "dark" || (prefs.theme !== "light" && systemDark);
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener?.("change", onChange);
    return () => media.removeEventListener?.("change", onChange);
  }, []);

  // 外观：浅色 / 深色 / 跟随系统
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);

  // 会话列表
  useEffect(() => {
    void listSessions().then(setSessions).catch(() => setStorageWarn(true));
  }, []);

  const goPage = useCallback((p: Page) => {
    location.hash = p === "settings" ? "#/settings" : "#/";
    setPage(p);
  }, []);

  // ---------------------------------------------------------------- 会话操作

  const onSaveSession = useCallback((s: Session) => {
    const stamped = { ...s, updatedAt: Date.now() };
    setCurrent(stamped);
    setSessions((list) => {
      const exists = list.some((x) => x.id === stamped.id);
      const next = exists ? list.map((x) => (x.id === stamped.id ? stamped : x)) : [stamped, ...list];
      return next.sort((a, b) => b.updatedAt - a.updatedAt);
    });
    void putSession(stamped).catch(() => setStorageWarn(true));
  }, []);

  const onNewSession = useCallback((opts?: { mode?: Mode; grade?: Grade }) => {
    const now = Date.now();
    const s: Session = {
      id: uid(),
      mode: opts?.mode ?? prefs.mode,
      grade: opts?.grade ?? prefs.grade,
      title: "",
      createdAt: now,
      updatedAt: now,
      messages: [],
      turns: [],
    };
    // 仅放进当前编辑区；首次发送时 onSaveSession 才写入列表和 IndexedDB。
    setCurrent(s);
  }, [prefs.mode, prefs.grade]);

  const onClearCurrent = useCallback(() => setCurrent(null), []);

  const onOpenSession = useCallback((id: string) => {
    void getSession(id).then((s) => {
      if (s) {
        setCurrent(recoverSession(s));
        setPrefs((p) => ({ ...p, mode: s.mode }));
      }
    }).catch(() => setStorageWarn(true));
  }, []);

  const onDeleteSession = useCallback(
    (id: string) => {
      setSessions((list) => list.filter((s) => s.id !== id));
      if (current?.id === id) setCurrent(null);
      void deleteSession(id).catch(() => setStorageWarn(true));
    },
    [current?.id],
  );

  const onChangeSettings = useCallback((s: Settings) => {
    setSettings(s);
    if (!saveSettings(s)) setStorageWarn(true);
  }, []);

  const onChangePrefs = useCallback((p: UiPrefs) => {
    setPrefs(p);
    if (!saveUiPrefs(p)) setStorageWarn(true);
  }, []);

  // ---------------------------------------------------------------- 孩子档案

  const onSaveProfile = useCallback(
    (nickname: string, avatar: string, grade: Grade, gradeLevel: string) => {
      onChangeSettings({ ...settings, profile: { nickname, avatar, onboarded: true, gradeLevel } });
      onChangePrefs({ ...prefs, grade });
      setOnboardMode(null);
    },
    [settings, prefs, onChangeSettings, onChangePrefs],
  );

  // ---------------------------------------------------------------- 渲染

  return (
    <div className="app">
      {page === "learn" && (
        <a
          className="skip-link"
          href="#composer-input"
          onClick={(e) => {
            e.preventDefault();
            document.getElementById("composer-input")?.focus();
          }}
        >
          跳到输入框
        </a>
      )}
      <header className="topbar">
        <button className="logo" onClick={() => goPage("learn")}>
          <span className="logo-icon"><i className="ti ti-seedling" aria-hidden="true"></i></span>
          <span className="logo-text">自学小站</span>
        </button>
        <div className="topbar-right">
          {settings.profile.onboarded && (
            <button
              className="profile-chip"
              onClick={() => goPage("settings")}
              title="在「系统设置」中修改孩子信息"
            >
              <span className="chip-avatar">{settings.profile.avatar}</span>
              <span className="chip-name">{settings.profile.nickname || "同学"}</span>
            </button>
          )}
          <button
            className="theme-switch"
            type="button"
            role="switch"
            aria-checked={dark}
            aria-label="深色模式"
            title={dark ? "切换到浅色" : "切换到深色"}
            onClick={() => onChangePrefs({ ...prefs, theme: dark ? "light" : "dark" })}
          />
          <button
            className="topbar-icon"
            aria-label="系统设置"
            title="系统设置"
            onClick={() => goPage(page === "settings" ? "learn" : "settings")}
          >
            <i className="ti ti-settings" aria-hidden="true"></i>
          </button>
        </div>
      </header>

      {storageWarn && (
        <div className="api-banner" role="alert">
          <span>
            <i className="ti ti-alert-triangle" aria-hidden="true"></i>{" "}
            <b>本机存储不可用或已满</b>：学习记录和设置可能无法保存，刷新后可能丢失。请退出隐私模式或清理浏览器存储后重试。
          </span>
          <button className="btn-link" onClick={() => setStorageWarn(false)}>
            知道了
          </button>
        </div>
      )}

      <LearnView
        active={page === "learn"}
        settings={settings}
        prefs={prefs}
        sessions={sessions}
        current={current}
        onPrefsChange={onChangePrefs}
        onNewSession={onNewSession}
        onClearCurrent={onClearCurrent}
        onOpenSession={onOpenSession}
        onDeleteSession={onDeleteSession}
        onSaveSession={onSaveSession}
        goSettings={() => goPage("settings")}
      />
      {page === "settings" && (
        <Suspense fallback={<div className="report-busy">正在加载设置…</div>}>
          <SettingsView
            settings={settings}
            grade={prefs.grade}
            onGradeChange={(grade) => onChangePrefs({ ...prefs, grade })}
            theme={prefs.theme}
            onThemeChange={(theme) => onChangePrefs({ ...prefs, theme })}
            onChange={onChangeSettings}
            goLearn={() => goPage("learn")}
          />
        </Suspense>
      )}

      {onboardMode && (
        <OnboardingDialog
          settings={settings}
          initialGrade={prefs.grade}
          mode={onboardMode}
          onSave={onSaveProfile}
          onClose={() => setOnboardMode(null)}
        />
      )}
    </div>
  );
}
