import type { PracticeItem } from "../types";
import { validateSmoothIncline } from "./model";
import { verifyInclineResult } from "./typedSource";
import { validateHanging, verifyHangingResult } from "./hanging";

/** 每题沿用已验证的同一场景，不要求模型自行编造答案。 */
export function buildInclinePractices(input: unknown, output: unknown): PracticeItem[] {
  const checked = validateSmoothIncline(input);
  if (!checked.ok || !verifyInclineResult(checked.model, output)) throw new Error("物理练习的条件或结果未通过检查");
  const model = checked.model;
  const result = output as { normal: number; acceleration: number };
  const fmt = (n: number) => Number(n.toPrecision(4)).toString();
  const setup = `物块质量为 ${model.massKg.value} kg，位于倾角 ${model.angleDeg.value}° 的固定光滑斜面上，只受重力和支持力，重力加速度为 ${model.gravity.value} m/s²。`;
  return [
    { difficulty: "持平", question: `${setup}物块受到哪些力？方向分别如何？`, answer: "重力竖直向下；支持力垂直斜面向外。", analysis: "光滑意味着这里不考虑摩擦力；研究对象是物块。" },
    { difficulty: "进阶", question: `${setup}求斜面对物块的支持力。`, answer: `约 ${fmt(result.normal)} N。`, analysis: "垂直斜面的加速度为零，故支持力等于重力垂直斜面的分量，即 mg cosθ。" },
    { difficulty: "培优", question: `${setup}求物块的加速度大小和方向。`, answer: `约 ${fmt(result.acceleration)} m/s²，方向沿斜面向下。`, analysis: "沿斜面的合力为 mg sinθ，由牛顿第二定律可得 a = g sinθ。" },
  ];
}

export function buildHangingPractices(input: unknown, output: unknown): PracticeItem[] {
  const checked = validateHanging(input);
  if (!checked.ok || !verifyHangingResult(checked.model, output)) throw new Error("物理练习的条件或结果未通过检查");
  const m = checked.model;
  const tension = (output as { tension: number }).tension;
  const setup = `质量 ${m.massKg.value} kg 的物块用固定、竖直绷紧的绳悬挂并静止，物块只受重力和绳的拉力，重力加速度为 ${m.gravity.value} m/s²。`;
  return [
    { difficulty: "持平", question: `${setup}物块受到哪两个力？方向如何？`, answer: "重力竖直向下；绳的拉力竖直向上。", analysis: "拉力沿绳指向固定端，重力竖直向下。" },
    { difficulty: "进阶", question: `${setup}求绳对物块的拉力。`, answer: `约 ${Number(tension.toPrecision(4))} N。`, analysis: "物块静止，竖直方向合力为零，因此 T = mg。" },
    { difficulty: "培优", question: `${setup}这两个力为什么不是一对相互作用力？`, answer: "它们作用在同一个物块上，而相互作用力分别作用在两个不同物体上。", analysis: "绳对物块的拉力，与物块对绳的拉力构成相互作用力。" },
  ];
}
