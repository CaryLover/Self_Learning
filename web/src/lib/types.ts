/** 全局类型定义 */
import type { PhysicsModel, PhysicsResult } from "./physics/pipeline";

export type Grade = "primary" | "junior" | "senior";
export type Mode = "eli5" | "socratic";

export const GRADE_LABEL: Record<Grade, string> = {
  primary: "小学",
  junior: "初中",
  senior: "高中",
};
export const MODE_LABEL: Record<Mode, string> = {
  eli5: "看图讲解",
  socratic: "苏格拉底辅导",
};

// ---------------------------------------------------------------- 家长设置

export interface ProviderState {
  enabled: boolean;
  base?: string; // 覆盖预置调用地址
  apiKey?: string; // 仅存浏览器 localStorage
  models: Record<string, { enabled: boolean; vision?: boolean }>; // vision: 手动标记是否支持图片
  defaultModel?: string;
}

export interface Settings {
  profile: {
    nickname: string;
    avatar: string;
    onboarded?: boolean;
    gradeLevel?: string; // 当前年级：一年级…六年级 / 初一…初三 / 高一…高三
  };
  proxyUrl: string;
  proxyExplicit?: boolean; // 区分用户主动直连与旧版本未配置代理的存档
  providers: Record<string, ProviderState>; // key = provider preset id
}

// ---------------------------------------------------------------- 学习会话

export interface PracticeItem {
  question: string;
  difficulty: "持平" | "进阶" | "培优";
  answer: string;
  analysis: string;
}

export interface SkillMapSkill {
  name: string;
  level: number; // 0-5
  note?: string;
  focus?: boolean; // 当前辅导焦点
}

export interface SkillMap {
  topic: string;
  overall: number; // 0-100
  skills: SkillMapSkill[];
}

export interface ReportItem {
  name: string;
  score: number; // 0-100 掌握度
  status: string;
  advice: string;
}

export interface MasteryReport {
  knowledge: ReportItem[];
  generatedAt: number;
}

export type Eli5Stage = "idle" | "explaining" | "physics_explaining" | "clarification" | "practicing" | "done" | "error";

export interface Eli5State {
  topic?: string;
  sourceImageCount?: number;
  promptVersion?: string; // 旧会话没有该字段
  physicsPreview?: { status: "candidate"; modelVersion: string; model: PhysicsModel; result: PhysicsResult; evidence: Record<string, string>; assumptions: string[] };
  pendingPhysicsPractices?: PracticeItem[];
  retryPhysicsExplanation?: boolean;
  /** 物理条件待复核时，允许使用者主动改用未经物理核验的普通讲解。 */
  unverifiedFallback?: boolean;
  physicsUnverified?: boolean;
  physicsTextOnly?: boolean;
  html?: string; // 模型生成的讲解页（沙箱 iframe 渲染）
  practices?: PracticeItem[];
  retryLesson?: boolean;
  retryPractice?: boolean;
  stage: Eli5Stage;
  error?: string;
}

export interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string; // 展示内容（assistant 已剥离技能地图 JSON 块）
  raw?: string; // assistant 原始输出（含技能地图块），续学时用作 API 上下文
  images?: string[]; // 用户附带的图片（data URL），仅用于展示与重发
  ts: number;
  error?: boolean;
}

export interface Turn {
  role: "user" | "assistant";
  content: string;
  images?: string[]; // 该轮附带的图片（data URL）
}

/** OpenAI 兼容的多模态内容片段 */
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/** 发给厂商的一条消息（content 可以是纯文本或多模态数组） */
export interface ChatMessage {
  role: string;
  content: string | ContentPart[];
}

export interface Session {
  id: string;
  mode: Mode;
  grade: Grade;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMsg[]; // 展示历史
  turns: Turn[]; // API 上下文（苏格拉底模式用）
  skillMap?: SkillMap; // 苏格拉底：技能地图
  eli5?: Eli5State; // ELI5：讲解页与练习
  report?: MasteryReport; // 掌握报告
}

// ---------------------------------------------------------------- API

export interface ChatRequestOptions {
  endpoint: string; // 厂商 base + /chat/completions
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  stream: boolean;
  proxyUrl?: string; // 转发代理地址；留空则浏览器直连
  signal?: AbortSignal;
  onDelta?: (text: string) => void;
}
