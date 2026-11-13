import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { mkdtemp, unlink, rmdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const dir = await mkdtemp(join(tmpdir(), "session-data-"));
const outfile = join(dir, "sessionData.mjs");
try {
  const bundle = await build({ entryPoints: ["src/lib/sessionData.ts"], bundle: true, platform: "node", format: "esm", write: false, outfile });
  await writeFile(outfile, bundle.outputFiles[0].contents);
  const { normalizeSession } = await import(pathToFileURL(outfile).href);

  assert.equal(normalizeSession(null), null);
  assert.equal(normalizeSession("session"), null);
  assert.equal(normalizeSession({ title: "没有 id" }), null);

  const practice = { question: "题目", answer: "答案", analysis: "解析", difficulty: "进阶" };
  const raw = {
    id: "session-1",
    mode: "eli5",
    grade: "senior",
    title: "光滑斜面",
    createdAt: 100,
    updatedAt: 200,
    messages: [
      { id: "m1", role: "user", content: "题目", images: ["data:image/png;base64,AA==", "https://evil.test/x.png"], ts: 1 },
      { id: "m2", role: "assistant", content: "", ts: 2, error: true },
      { role: "system", content: "应被丢弃" },
      { role: "user", content: 42 },
    ],
    turns: [
      { role: "user", content: "题目", images: ["data:image/png;base64,AA=="] },
      { role: "assistant", content: "" },
    ],
    eli5: {
      stage: "done",
      topic: "题目",
      html: "<!DOCTYPE html><html><body>讲解</body></html>",
      practices: [practice, { question: "坏题" }],
      retryLesson: false,
      physicsUnverified: true,
      sourceImageCount: 1.9,
    },
    skillMap: { topic: "力", overall: 80, skills: [{ name: "受力分析", level: 4.4, focus: true }, { name: 3 }] },
    report: { knowledge: [{ name: "受力", score: 88, status: "掌握", advice: "继续" }], generatedAt: 5 },
  };
  const normalized = normalizeSession(raw);
  assert.equal(normalized.id, "session-1");
  assert.equal(normalized.mode, "eli5");
  assert.equal(normalized.grade, "senior");
  assert.equal(normalized.title, "光滑斜面");
  assert.equal(normalized.messages.length, 2);
  assert.deepEqual(normalized.messages[0].images, ["data:image/png;base64,AA=="]);
  assert.equal(normalized.messages[1].error, true);
  assert.equal(normalized.turns.length, 2);
  assert.equal(normalized.eli5.stage, "done");
  assert.equal(normalized.eli5.sourceImageCount, 1);
  assert.equal(normalized.eli5.practices.length, 1);
  assert.equal(normalized.eli5.retryLesson, undefined);
  assert.equal(normalized.eli5.physicsUnverified, true);
  assert.equal(normalized.skillMap.skills.length, 1);
  assert.equal(normalized.skillMap.skills[0].level, 4);
  assert.equal(normalized.skillMap.skills[0].focus, true);
  assert.equal(normalized.report.knowledge.length, 1);

  const legacy = normalizeSession({ id: "old" });
  assert.deepEqual(legacy.messages, []);
  assert.deepEqual(legacy.turns, []);
  assert.equal(legacy.mode, "eli5");
  assert.equal(legacy.grade, "primary");
  assert.equal(legacy.title, "");
  assert.equal(legacy.createdAt, 0);

  const broken = normalizeSession({
    id: "broken",
    mode: "unknown",
    grade: "college",
    messages: "no",
    turns: null,
    eli5: { stage: "unknown", html: "x".repeat(500_001), practices: "no", retryPhysicsExplanation: "yes" },
    skillMap: { topic: "x", skills: [] },
    report: { knowledge: [] },
  });
  assert.equal(broken.mode, "eli5");
  assert.equal(broken.grade, "primary");
  assert.deepEqual(broken.messages, []);
  assert.equal(broken.eli5.stage, "idle");
  assert.equal(broken.eli5.html, undefined);
  assert.equal(broken.eli5.practices, undefined);
  assert.equal(broken.eli5.retryPhysicsExplanation, undefined);
  assert.equal(broken.skillMap, undefined);
  assert.equal(broken.report, undefined);

  const badPhysics = normalizeSession({
    id: "physics",
    eli5: { stage: "error", physicsPreview: { status: "needs_review" }, pendingPhysicsPractices: [practice] },
  });
  assert.equal(badPhysics.eli5.physicsPreview, undefined);
  assert.equal(badPhysics.eli5.pendingPhysicsPractices.length, 1);

  const many = normalizeSession({
    id: "many",
    title: "标".repeat(300),
    eli5: { stage: "done", error: "错".repeat(3000), practices: Array.from({ length: 12 }, () => practice) },
    skillMap: { topic: "力", skills: Array.from({ length: 25 }, () => ({ name: "技能", level: 2 })) },
    report: { knowledge: Array.from({ length: 25 }, () => ({ name: "知识", score: 60 })) },
  });
  assert.equal(many.title.length, 120);
  assert.equal(many.eli5.error.length, 2000);
  assert.equal(many.eli5.practices.length, 10);
  assert.equal(many.skillMap.skills.length, 20);
  assert.equal(many.report.knowledge.length, 20);

  const legacyReport = normalizeSession({ id: "report", updatedAt: 1234, report: { knowledge: [{ name: "知识", score: 60 }] } });
  assert.equal(legacyReport.report.generatedAt, 1234);

  console.log("session data normalization checks passed");
} finally {
  await unlink(outfile).catch(() => {});
  await rmdir(dir);
}
