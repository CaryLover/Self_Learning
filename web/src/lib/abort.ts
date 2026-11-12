/** Works on browsers that implement AbortController without AbortSignal.throwIfAborted. */
export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason ?? new DOMException("已停止生成", "AbortError");
}
