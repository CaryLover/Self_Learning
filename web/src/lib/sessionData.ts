import type { ChatMsg, Eli5State, Grade, Mode, PracticeItem, Session, SkillMap, Turn } from "./types";

/**
 * 读取旧版本或损坏的本机记录时的结构边界。
 * 只保留能安全渲染的字段；返回 null 表示这条记录无法作为会话打开。
 * 这不是内容正确性检查，也不修复被截断的题目或讲解。
 */

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const MODES: Mode[] = ["eli5", "socratic"];
const GRADES: Grade[] = ["primary", "junior", "senior"];
const STAGES: Eli5State["stage"][] = ["idle", "explaining", "physics_explaining", "clarification", "practicing", "done", "error"];

function imagesOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => isString(item) && item.startsWith("data:image/"));
}

function normalizePractice(value: unknown): PracticeItem | null {
  if (!isRecord(value)) return null;
  const { question, answer, analysis, difficulty } = value;
  if (!isString(question) || !question.trim() || !isString(answer) || !answer.trim() || !isString(analysis) || !analysis.trim()) return null;
  if (difficulty !== "持平" && difficulty !== "进阶" && difficulty !== "培优") return null;
  return { question, answer, analysis, difficulty };
}

function normalizePractices(value: unknown): PracticeItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.map(normalizePractice).filter((item): item is PracticeItem => item !== null).slice(0, 10);
  return items.length ? items : undefined;
}

function normalizeMessage(value: unknown, index: number): ChatMsg | null {
  if (!isRecord(value)) return null;
  if (value.role !== "user" && value.role !== "assistant") return null;
  if (!isString(value.content)) return null;
  const images = imagesOf(value.images);
  return {
    id: isString(value.id) && value.id ? value.id : `restored-${index}`,
    role: value.role,
    content: value.content,
    images: images.length ? images : undefined,
    ts: isNumber(value.ts) ? value.ts : 0,
    error: value.error === true ? true : undefined,
    raw: isString(value.raw) ? value.raw : undefined,
  };
}

function normalizeTurn(value: unknown): Turn | null {
  if (!isRecord(value)) return null;
  if (value.role !== "user" && value.role !== "assistant") return null;
  if (!isString(value.content)) return null;
  const images = imagesOf(value.images);
  return { role: value.role, content: value.content, images: images.length ? images : undefined };
}

function normalizeSkillMap(value: unknown): SkillMap | undefined {
  if (!isRecord(value) || !isString(value.topic) || !Array.isArray(value.skills)) return undefined;
  const skills = value.skills
    .filter(isRecord)
    .filter((skill) => isString(skill.name) && isNumber(skill.level))
    .slice(0, 20)
    .map((skill) => ({
      name: String(skill.name).slice(0, 40),
      level: Math.max(0, Math.min(5, Math.round(Number(skill.level)))),
      note: isString(skill.note) ? skill.note.slice(0, 60) : undefined,
      focus: skill.focus === true,
    }));
  if (!skills.length) return undefined;
  const fallback = Math.round((skills.reduce((sum, skill) => sum + skill.level, 0) / skills.length / 5) * 100);
  return {
    topic: value.topic.slice(0, 60),
    overall: isNumber(value.overall) ? Math.max(0, Math.min(100, Math.round(value.overall))) : fallback,
    skills,
  };
}

function normalizeReport(value: unknown): Session["report"] | undefined {
  if (!isRecord(value) || !Array.isArray(value.knowledge)) return undefined;
  const knowledge = value.knowledge
    .filter(isRecord)
    .filter((item) => isString(item.name) && isNumber(item.score))
    .slice(0, 20)
    .map((item) => ({
      name: String(item.name).slice(0, 60),
      score: Math.max(0, Math.min(100, Math.round(Number(item.score)))),
      status: isString(item.status) ? item.status : "",
      advice: isString(item.advice) ? item.advice : "",
    }));
  if (!knowledge.length) return undefined;
  return { knowledge, generatedAt: isNumber(value.generatedAt) ? value.generatedAt : 0 };
}

function normalizeEli5(value: unknown): Eli5State | undefined {
  if (!isRecord(value)) return undefined;
  const stage = STAGES.includes(value.stage as Eli5State["stage"]) ? (value.stage as Eli5State["stage"]) : "idle";
  const eli5: Eli5State = { stage };
  if (isString(value.topic)) eli5.topic = value.topic;
  if (isString(value.promptVersion)) eli5.promptVersion = value.promptVersion;
  if (isNumber(value.sourceImageCount) && value.sourceImageCount >= 0) eli5.sourceImageCount = Math.floor(value.sourceImageCount);
  if (isString(value.html) && value.html.length <= 500_000) eli5.html = value.html;
  eli5.practices = normalizePractices(value.practices);
  eli5.pendingPhysicsPractices = normalizePractices(value.pendingPhysicsPractices);
  if (isRecord(value.physicsPreview) && value.physicsPreview.status === "candidate") eli5.physicsPreview = value.physicsPreview as Eli5State["physicsPreview"];
  for (const key of ["retryPhysicsExplanation", "unverifiedFallback", "physicsUnverified", "physicsTextOnly", "retryLesson", "retryPractice"] as const) {
    if (value[key] === true) eli5[key] = true;
  }
  if (isString(value.error)) eli5.error = value.error.slice(0, 2000);
  return eli5;
}

/** 将本机读出的未知数据收敛为可安全渲染的会话；无法识别时返回 null。 */
export function normalizeSession(value: unknown): Session | null {
  if (!isRecord(value) || !isString(value.id) || !value.id) return null;
  const mode = MODES.includes(value.mode as Mode) ? (value.mode as Mode) : "eli5";
  const grade = GRADES.includes(value.grade as Grade) ? (value.grade as Grade) : "primary";
  const messages = Array.isArray(value.messages) ? value.messages.map(normalizeMessage).filter((item): item is ChatMsg => item !== null) : [];
  const turns = Array.isArray(value.turns) ? value.turns.map(normalizeTurn).filter((item): item is Turn => item !== null) : [];
  const updatedAt = isNumber(value.updatedAt) ? value.updatedAt : 0;
  const report = normalizeReport(value.report);
  if (report && report.generatedAt <= 0) report.generatedAt = updatedAt;
  return {
    id: value.id,
    mode,
    grade,
    title: isString(value.title) ? value.title.slice(0, 120) : "",
    createdAt: isNumber(value.createdAt) ? value.createdAt : 0,
    updatedAt,
    messages,
    turns,
    skillMap: normalizeSkillMap(value.skillMap),
    report,
    eli5: normalizeEli5(value.eli5),
  };
}
