import { createRoot } from "react-dom/client";
import { LearnView } from "./src/components/LearnView";
import { defaultSettings } from "./src/lib/store";
import { fileToDataUrl } from "./src/lib/vision";
import type { Session } from "./src/lib/types";

const result = document.querySelector("#result")!;
const settings = defaultSettings();
settings.providers.siliconflow = {
  enabled: true,
  apiKey: "fake-local-test-key",
  defaultModel: "mock-vl-mini",
  models: { "mock-vl-mini": { enabled: true, vision: true }, "mock-text": { enabled: true, vision: false } },
};
let saves = 0;
let requests = 0;
const saved: { session?: Session } = {};
const getSaved = (): Session | undefined => saved.session;
const originalFetch = window.fetch;
const originalCreateImageBitmap = window.createImageBitmap;
let resumeImage: (() => void) | undefined;
window.fetch = async () => { requests++; throw new Error("此检查不应调用模型"); };
const root = createRoot(document.querySelector("#root")!);
root.render(<LearnView active settings={settings} prefs={{ grade: "primary", mode: "eli5", theme: "light" }} sessions={[]} current={null} onPrefsChange={() => {}} onNewSession={() => {}} onClearCurrent={() => {}} onOpenSession={() => {}} onDeleteSession={() => {}} onSaveSession={() => { saves++; }} goSettings={() => {}} />);

const waitFor = async (selector: string): Promise<Element> => {
  for (let i = 0; i < 100; i++) {
    const element = document.querySelector(selector);
    if (element) return element;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`没有找到 ${selector}`);
};

try {
  await waitFor("textarea");
  await new Promise(resolve => setTimeout(resolve, 100));
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("无法创建测试图片");
  const file = new File([blob], "test.png", { type: "image/png" });
  const converted = new Image();
  converted.src = await fileToDataUrl(file);
  await converted.decode();
  const checkCanvas = document.createElement("canvas");
  checkCanvas.width = 2;
  checkCanvas.height = 2;
  const context = checkCanvas.getContext("2d");
  if (!context) throw new Error("无法检查图片背景");
  context.drawImage(converted, 0, 0);
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
  if (red < 240 || green < 240 || blue < 240) throw new Error("透明图片没有使用白色背景");
  const textarea = await waitFor("textarea") as HTMLTextAreaElement;
  textarea.focus();
  document.execCommand("insertText", false, "图片里的题目");
  const send = await waitFor(".composer-right .btn-send") as HTMLButtonElement;
  await new Promise(resolve => setTimeout(resolve, 100));
  if (send.disabled) throw new Error("测试文字没有输入");
  window.createImageBitmap = ((source: ImageBitmapSource) => new Promise<ImageBitmap>((resolve, reject) => {
    const decode = originalCreateImageBitmap as (this: Window, source: ImageBitmapSource) => Promise<ImageBitmap>;
    resumeImage = () => { decode.call(window, source).then(resolve, reject); };
  })) as typeof createImageBitmap;
  const clipboard = new DataTransfer();
  clipboard.items.add(file);
  window.dispatchEvent(new ClipboardEvent("paste", { clipboardData: clipboard }));
  await waitFor('[role="status"]');
  if (!send.disabled || !resumeImage) throw new Error("图片处理时仍可发送");
  textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 50));
  if (saves !== 0 || requests !== 0 || textarea.value !== "图片里的题目") throw new Error("图片处理期间题目被提前发送");
  resumeImage();
  resumeImage = undefined;
  window.createImageBitmap = originalCreateImageBitmap;
  await waitFor(".attach-row img");
  const select = await waitFor(".model-select select") as HTMLSelectElement;
  select.value = "siliconflow||mock-text";
  select.dispatchEvent(new Event("change", { bubbles: true }));
  await waitFor(".attach-warn");
  (await waitFor(".composer-right .btn-send") as HTMLButtonElement).click();
  await waitFor(".attach-err");
  if (!document.querySelector(".attach-row img") || saves !== 0 || requests !== 0) throw new Error("图片被丢弃或请求被发送");
  select.value = "siliconflow||mock-vl-mini";
  select.dispatchEvent(new Event("change", { bubbles: true }));
  for (let i = 0; i < 100 && document.querySelector(".attach-warn, .attach-err"); i++) await new Promise(resolve => setTimeout(resolve, 50));
  if (document.querySelector(".attach-warn, .attach-err") || !document.querySelector(".attach-row img") || saves !== 0 || requests !== 0) throw new Error("切回支持图片的模型后未恢复");
  const missing: Session = {
    id: "fixture", mode: "eli5", grade: "primary", title: "图片题", createdAt: 0, updatedAt: 0,
    messages: [{ id: "user", role: "user", content: "请讲解图片", ts: 0 }], turns: [],
    eli5: { stage: "error", topic: "请讲解图片", sourceImageCount: 1, retryLesson: true },
  };
  const renderSaved = (session: Session) => root.render(<LearnView active settings={settings} prefs={{ grade: "primary", mode: "eli5", theme: "light" }} sessions={[session]} current={session} onPrefsChange={() => {}} onNewSession={() => {}} onClearCurrent={() => {}} onOpenSession={() => {}} onDeleteSession={() => {}} onSaveSession={next => { saves++; saved.session = next; }} goSettings={() => {}} />);
  renderSaved(missing);
  (await waitFor(".eli5 .btn") as HTMLButtonElement).click();
  for (let i = 0; i < 100 && !getSaved(); i++) await new Promise(resolve => setTimeout(resolve, 50));
  if (!getSaved()?.eli5?.error?.includes("原题图片无法完整恢复") || getSaved()?.eli5?.retryLesson !== false || requests !== 0) throw new Error("讲解重试没有拦截缺失图片");
  delete saved.session;
  renderSaved({ ...missing, eli5: { stage: "error", topic: "请讲解图片", sourceImageCount: 1, html: "讲解内容", retryPractice: true } });
  await new Promise(resolve => setTimeout(resolve, 100));
  (await waitFor(".eli5 .btn") as HTMLButtonElement).click();
  for (let i = 0; i < 100 && !getSaved(); i++) await new Promise(resolve => setTimeout(resolve, 50));
  if (!getSaved()?.eli5?.error?.includes("原题图片无法完整恢复") || getSaved()?.eli5?.retryPractice !== false || requests !== 0) throw new Error("练习重试没有拦截缺失图片");
  result.textContent = "图片模型切换检查通过";
} catch (error) {
  result.textContent = `图片模型切换检查失败：${error instanceof Error ? error.message : "未知错误"}`;
} finally {
  resumeImage?.();
  window.createImageBitmap = originalCreateImageBitmap;
  root.unmount();
  window.fetch = originalFetch;
}
