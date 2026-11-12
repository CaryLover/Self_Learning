import { preparePhysicsLesson } from "./src/lib/physics/pipeline.ts";
import { renderPhysicsInWorker } from "./src/lib/physics/workerClient.ts";

const stated = value => ({ value, source: "stated" });
const model = { kind: "person-board-rest", personMassKg: stated(60), boardMassKg: stated(20), gravity: stated(10), tensionN: stated(100), setup: stated("person-on-board-ground-rope-up"), motion: stated("rest"), extraForces: stated("none"), requested: ["forces", "contact"] };
const question = "人质量60 kg，板质量20 kg。人站在水平板上，板由地面支持，固定绳竖直绷紧并向上拉人。人和板均静止。人和板只受到重力、相互接触力、地面对板支持力和绳对人的拉力。绳对人的拉力为100 N，重力加速度10 m/s²。求受力和接触力。";
const evidence = { personMassKg: "人质量60 kg", boardMassKg: "板质量20 kg", gravity: "重力加速度10 m/s²", tensionN: "绳对人的拉力为100 N", setup: "人站在水平板上，板由地面支持，固定绳竖直绷紧并向上拉人", motion: "人和板均静止", extraForces: "人和板只受到重力、相互接触力、地面对板支持力和绳对人的拉力" };
const status = document.querySelector("#status");
try {
  if (!import.meta.env.DEV) throw new Error("验证页仅供开发环境使用");
  const signal = new AbortController().signal;
  const lesson = await preparePhysicsLesson({ topic: question, hasImages: false, signal, call: async () => JSON.stringify({ status: "candidate", model, evidence }), render: candidate => renderPhysicsInWorker(candidate, signal) });
  if (lesson.status !== "candidate" || !lesson.html.includes("板对人的支持力：向上，500 N") || !lesson.html.includes("地面对板的支持力：向上，700 N") || lesson.practices.length !== 3 || !lesson.practices[1].answer.includes("250 N")) throw new Error("人板讲解结果不符合预期");
  document.querySelector("iframe").srcdoc = lesson.html;
  status.textContent = "人板样例通过：板对人 500 N，地面对板 700 N，变式练习答案 250 N；模型输入为模拟数据。";
} catch (error) {
  status.textContent = `验证失败：${error instanceof Error ? error.message : String(error)}`;
}
