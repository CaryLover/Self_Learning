/** 首次进入引导：填写孩子昵称 / 头像 / 学段 / 当前年级（全部必填）；之后可从顶栏「修改」再次打开 */

import { useState } from "react";
import type { Grade, Settings } from "../lib/types";
import { GRADE_LEVELS, GRADE_NAME, isValidLevel } from "../lib/grade";

const AVATARS = ["🦊", "🐱", "🐰", "🐼", "🐯", "🦖", "🐳", "🦉", "⭐", "🌸"];
const GRADES: { id: Grade; label: string; icon: string; desc: string }[] = [
  { id: "primary", label: "小学", icon: "ti-palette", desc: "明亮卡通 · 口语讲解" },
  { id: "junior", label: "初中", icon: "ti-pencil", desc: "清爽简洁 · 逐步推理" },
  { id: "senior", label: "高中", icon: "ti-rocket", desc: "沉稳专业 · 逻辑链讲解" },
];

interface Errors {
  nickname?: string;
  grade?: string;
  gradeLevel?: string;
}

export function OnboardingDialog({
  settings,
  initialGrade,
  mode,
  onSave,
  onClose,
}: {
  settings: Settings;
  initialGrade: Grade;
  mode: "startup" | "edit";
  onSave: (nickname: string, avatar: string, grade: Grade, gradeLevel: string) => void;
  onClose: () => void;
}) {
  const [nickname, setNickname] = useState(settings.profile.nickname);
  const [avatar, setAvatar] = useState(settings.profile.avatar || "🦊");
  const [grade, setGrade] = useState<Grade>(initialGrade);
  const [gradeLevel, setGradeLevel] = useState<string>(
    isValidLevel(initialGrade, settings.profile.gradeLevel) ? settings.profile.gradeLevel! : "",
  );
  const [errors, setErrors] = useState<Errors>({});
  const [attempted, setAttempted] = useState(false); // 是否点过「开始学习」/「保存」
  const editing = mode === "edit";
  const returning = !editing && settings.profile.onboarded === true && !!settings.profile.gradeLevel;

  /** 当前表单是否仍缺必填项（用于横幅，实时计算，补全即消失） */
  const incomplete = !nickname.trim() || !GRADES.some((g) => g.id === grade) || !isValidLevel(grade, gradeLevel);

  /** 清掉某项错误提示（不能只置 undefined，否则键仍留存） */
  function clearError(key: keyof Errors): void {
    setErrors((e) => {
      const next = { ...e };
      delete next[key];
      return next;
    });
  }

  function chooseGrade(g: Grade): void {
    setGrade(g);
    // 切换学段后，原年级若不属于新学段则清空，要求重新选择
    if (!GRADE_LEVELS[g].includes(gradeLevel)) setGradeLevel("");
    clearError("grade");
    clearError("gradeLevel");
  }

  function submit(): void {
    setAttempted(true);
    const next: Errors = {};
    if (!nickname.trim()) next.nickname = "请填写昵称（可以用小名或代号）";
    if (!GRADES.some((g) => g.id === grade)) next.grade = "请选择学段";
    if (!isValidLevel(grade, gradeLevel)) next.gradeLevel = "请选择当前年级";
    setErrors(next);
    if (Object.keys(next).length > 0) return; // 不允许跳过
    onSave(nickname.trim(), avatar, grade, gradeLevel);
  }

  // 只有点过提交、且当前仍不完整时才显示横幅
  const showBanner = attempted && incomplete;

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="孩子信息">
      <div className="onboard">
        <div className="onboard-emoji"><i className="ti ti-mood-smile" aria-hidden="true"></i></div>
        <h2>{editing ? "修改孩子的信息" : returning ? "欢迎回来！" : "欢迎来到自学小站！"}</h2>
        <p className="onboard-sub">
          {editing
            ? "修改后点「保存」生效"
            : returning
              ? "已自动填入上次保存的信息，有变化可以直接修改，然后开始学习"
              : "请完整填写下面的信息，用来把握讲解的深度和难度。信息保存在本机，生成讲解时会发送给所选模型服务。"}
        </p>

        <label className="onboard-label" htmlFor="onboard-nickname">
          怎么称呼你？<span className="req">*</span>
        </label>
        <input
          id="onboard-nickname"
          type="text"
          placeholder="昵称（可用小名或代号）"
          maxLength={12}
          autoFocus
          value={nickname}
          className={errors.nickname ? "invalid" : ""}
          onChange={(e) => {
            setNickname(e.target.value);
            setErrors((x) => {
              const next = { ...x };
              delete next.nickname;
              return next;
            });
          }}
        />
        {errors.nickname && <p className="field-error">⚠ {errors.nickname}</p>}

        <label className="onboard-label">选一个代表你的小伙伴</label>
        <div className="avatar-row">
          {AVATARS.map((a) => (
            <button key={a} className={`avatar${avatar === a ? " on" : ""}`} onClick={() => setAvatar(a)}>
              {a}
            </button>
          ))}
        </div>

        <label className="onboard-label">
          你在读哪个学段？<span className="req">*</span>
        </label>
        <div className="grade-pick">
          {GRADES.map((g) => (
            <button
              key={g.id}
              className={`grade-card${grade === g.id ? " on" : ""}`}
              onClick={() => chooseGrade(g.id)}
            >
              <span className="grade-emoji"><i className={"ti " + g.icon} aria-hidden="true"></i></span>
              <b>{g.label}</b>
              <span className="grade-desc">{g.desc}</span>
            </button>
          ))}
        </div>
        {errors.grade && <p className="field-error">⚠ {errors.grade}</p>}

        <label className="onboard-label">
          当前年级？<span className="req">*</span>
          <span className="label-hint">决定讲题方法的上限，选错容易超纲</span>
        </label>
        <div className="level-pick">
          {GRADE_LEVELS[grade].map((lv) => (
            <button
              key={lv}
              className={`level-chip${gradeLevel === lv ? " on" : ""}`}
              onClick={() => {
                setGradeLevel(lv);
                clearError("gradeLevel");
              }}
            >
              {lv}
            </button>
          ))}
        </div>
        {errors.gradeLevel && <p className="field-error">⚠ {errors.gradeLevel}</p>}

        {showBanner && (
          <div className="form-error" role="alert">
            还有信息没有填写完整，请补全后再开始学习。
          </div>
        )}

        <button className="btn-send onboard-go" onClick={submit}>
          {editing ? "保存" : "开始学习"}
        </button>
        {editing && (
          <button className="btn-link onboard-cancel" onClick={onClose}>
            取消
          </button>
        )}

        <p className="onboard-privacy">
          🔒 昵称、学段和年级保存在本机浏览器，生成讲解时会发送给所选模型服务；如启用代理，请求也会经过代理。讲解时会参考「{GRADE_NAME[grade]}
          {gradeLevel ? ` · ${gradeLevel}` : ""}」的课程范围，避免用超纲方法（如给小学生用方程讲鸡兔同笼）。
        </p>
      </div>
    </div>
  );
}
