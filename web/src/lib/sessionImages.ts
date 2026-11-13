import type { Session } from "./types";

/** Returns null when the saved record says an original image is missing. */
export function recoverLessonImages(session: Session): string[] | null {
  const source = [...session.messages].reverse().find(message => message.role === "user");
  const images = source?.images ?? [];
  const expected = session.eli5?.sourceImageCount;
  if (expected === undefined && images.length === 0 && (source?.content ?? session.eli5?.topic) === "请讲解这张图片里的题目。") return null;
  return expected !== undefined && (expected !== images.length || images.some(image => typeof image !== "string" || !image.startsWith("data:image/"))) ? null : images;
}
