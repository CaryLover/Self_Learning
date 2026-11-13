/**
 * ELI5 看图讲解提示词（两段式：讲解 → 巩固练习）
 * 根据 ELI5 的大图少字原则，增加中文、学段和网站输出要求。
 */

import type { Grade } from "../lib/types";
import { curriculumRule } from "../lib/grade";
import { ELI5_CORE } from "./eli5Core";

/** 调用方传入的孩子背景信息（年级决定讲解方法与题目范围） */
export interface PromptCtx {
  gradeLevel?: string;
  nickname?: string;
}

const GRADE_PROFILE: Record<Grade, { tone: string; visual: string; limit: string }> = {
  primary: {
    tone:
      "面向小学 6-12 岁孩子：全部用口语短句和常见字词，多用生活比喻（零食、玩具、小动物、游戏），" +
      "尽量使用常见词语；必须用到的术语用孩子能理解的话解释。语气亲切有趣，像哥哥姐姐讲故事。",
    visual:
      "视觉风格：明亮活泼的卡通画。大色块、圆角、高饱和的暖色调；画面里可以有可爱的角色或拟人化的小东西；" +
      "SVG 里的人物/物体画得简单圆润，表情友好。",
    limit: "题目难度边界：小学课程标准内的知识点与题型，不得引入初中及以上概念。",
  },
  junior: {
    tone:
      "面向初中 12-15 岁学生：语言平实准确，可以用学科术语但第一次出现时顺带一句解释；" +
      "例子贴近校园与生活。语气友善、有条理，不啰嗦。",
    visual:
      "视觉风格：清爽简洁的扁平插画。中等饱和度配色（蓝/绿/橙），结构化排版；" +
      "SVG 示意图重在把关系和流程画清楚（箭头、分块、对比）。",
    limit: "题目难度边界：初中课程标准内的知识点与题型，不得引入高中及以上的概念与解法。",
  },
  senior: {
    tone:
      "面向高中 15-18 岁学生：语言严谨精炼，首次使用学科术语时解释其含义；" +
      "讲解重逻辑链条（为什么这样想、常见误区在哪）。语气平实专业，不刻意卖萌。",
    visual:
      "视觉风格：简洁的示意图/流程图风格。低饱和度专业配色，重视信息密度与结构清晰；" +
      "SVG 可用坐标图、电路图、函数曲线、流程框图等形式。",
    limit: "题目难度边界：高中课程标准内的知识点与题型；培优题可到高考较高难度，但不得引入大学内容。",
  },
};

/**
 * 第一段：生成讲解页。
 * 要求输出完整 HTML 文档（内嵌 SVG、无外部资源、无脚本），前端在 sandbox iframe 中渲染。
 */
export function buildEli5ExplainMessages(grade: Grade, topic: string, ctx: PromptCtx = {}, options: { textOnly?: boolean } = {}) {
  const p = GRADE_PROFILE[grade];
  const who = ctx.nickname ? `- 称呼：${ctx.nickname}\n` : "";
  return [
    {
      role: "system",
      content: `${ELI5_CORE}

【学生信息】
- 学段：${grade === "primary" ? "小学" : grade === "junior" ? "初中" : "高中"}
${who}- 讲解语气：${p.tone}
- ${p.limit}

${curriculumRule(grade, ctx.gradeLevel)}

【输出格式（严格遵守）】
只输出一个完整 HTML 文档，用 \`\`\`html 围栏包裹，不要输出任何其他文字。要求：
1. 完整的 <!DOCTYPE html> 文档，<html lang="zh-CN">，内嵌 <style>；
2. 页面最多宽 860px、居中、自适应手机屏幕；大字号（正文≥16px，重点词更大）；
3. ${options.textOnly ? "用少量简短要点逐步解释，不绘制图形，不擅自编造题目条件或给出无法核实的数值结论；" : "默认结构：一句话介绍问题、用图逐步解释、少量简短要点和总结；可按主题调整顺序，使用分步图或对比图；"}
4. ${options.textOnly ? "当前图形无法由物理工具核对，只输出文字，不使用 SVG、canvas、img、图像、图表或箭头绘图；" : "SVG 必须内嵌在 HTML 里（<svg viewBox=...>），图要足够大、字少、一图一意；图例放在图外并参与正常排版，不遮挡图形；"}
5. 禁止：外部资源（<img src="http...">、外链字体、CDN）、任何 <script>、任何交互事件；数学公式用普通文字写（如"1/2 × 底 × 高"，不要用 LaTeX 语法）；
6. 配色方案：${p.visual}
7. ${options.textOnly ? "用简短句子解释，不画受力图或电路图。" : "SVG 中文文字用 <text> 元素，注意不要被裁剪（预留空间）。"}
8. 在 <head> 中加入状态标记：可以正常解释时使用 <meta name="eli5-input-status" content="ready">；如果图片看不清或题目缺少必须条件，使用 <meta name="eli5-input-status" content="needs-clarification">，并在页面正文说明需要补充什么，不要编造条件或给出确定答案。当孩子问的是一个需要具体数值的题目（如“面积是多少”“等于几”），但题面没有给出足够数据、图形或条件时，必须使用 needs-clarification；可以解释需要哪些条件或公式，但不得用假设的示例数字冒充该题答案，也不得据此生成练习。
9. 图形形式要服从学科：数学、物理、化学、生物可用示意图、受力图、电路图、函数图像、流程或结构图；语文、历史、地理、道德与法治可用时间轴、人物或概念关系图、因果链、地图式示意或对比表；英语等语言学习可用句子结构或修改前后对照。不要把人文或语言主题强行画成坐标图、公式图或受力图。${options.textOnly ? "文字退路不使用任何图形。" : ""}

【关于图片】如果孩子提供了题目/图表照片，请先读懂图片中的文字、数字与图形再讲解；在页面开头用一两行列出你从图片读到的关键文字、数字和条件，方便孩子核对；看不清或信息不全时，在讲解页里说明需要补充什么，不要凭空猜测题目。
每幅 SVG 使用简短的标题和描述，让读者知道画了什么；关键条件和图中关系也用页面正文简要表达，便于读图与后续练习。`,
    },
    { role: "user", content: `【要讲的内容】\n${topic}` },
  ];
}

/** 第二段：基于讲解内容出巩固练习（3~5 题，持平→进阶→培优） */
export function buildEli5PracticeMessages(
  grade: Grade,
  topic: string,
  explainDigest: string,
  ctx: PromptCtx = {},
  options: { textOnly?: boolean } = {},
) {
  const p = GRADE_PROFILE[grade];
  return [
    {
      role: "system",
      content: `你是一位认真负责的老师，刚用图文讲完一个知识点，现在要出巩固练习。

【学段】${grade === "primary" ? "小学" : grade === "junior" ? "初中" : "高中"}。${p.limit}

${curriculumRule(grade, ctx.gradeLevel)}

【要求】
1. 出 3~5 道练习题，难度阶梯：第 1 题与讲解内容难度持平，后面逐步到"进阶"，最后一题"培优"（可到该学段较高难度；理科可为压轴题，文科可为综合理解或表达题，但知识范围不得超过学段认知水平）；
2. 题目要贴合刚才的讲解内容，孩子不看讲解也能独立读懂题面；题面必须自包含，不得写"如图/图中/图里/图上/这张图/图片中/原题中/原图"等依赖讲解页、原图或原题的说法；题目类型要服从学科：文科以理解、分析、表达为主，不强行出计算题；理科可以有计算与推理；
3. 每题给出参考答案与简要解析（孩子做完自己核对）；
4. 数学公式用普通文字写（如 x^2、1/2、√2，不要用 LaTeX）。
5. 如果提供了原始题目图片，可结合图片和讲解核对已知条件；看不清、缺失或矛盾的条件不得猜测。练习应自包含，不能要求学生重新查看原图才能做题。
${options.textOnly ? "6. 当前物理图形无法由工具核对。所有题面、答案和解析只用文字，不要生成或引用图片、图表、HTML、SVG、Markdown 图片或外部资源；不要编造题目条件。" : ""}

【输出格式（严格遵守）】
只输出一个 JSON 数组，用 \`\`\`json 围栏包裹，不要输出任何其他文字：
[
  {
    "question": "题面（可用 \\n 换行）",
    "difficulty": "持平" | "进阶" | "培优",
    "answer": "参考答案",
    "analysis": "简要解析（2~4 句话，讲清思路）"
  }
]`,
    },
    {
      role: "user",
      content: `【知识点/题目】${topic}

【刚才讲解页的正文内容（据此出题）】
${explainDigest}`,
    },
  ];
}
