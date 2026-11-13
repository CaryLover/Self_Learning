import { useMemo } from "react";
import type { ChatMsg } from "../lib/types";
import { renderMarkdown } from "../lib/markdown";

export function MessageBubble({ msg, streaming, ariaHidden }: { msg: ChatMsg; streaming?: boolean; ariaHidden?: boolean }) {
  const html = useMemo(() => renderMarkdown(msg.content), [msg.content]);
  return (
    <div className={`msg-row ${msg.role}`} aria-hidden={ariaHidden || undefined}>
      <div className={`bubble ${msg.role}${msg.error ? " error" : ""}`}>
        {msg.images && msg.images.length > 0 && (
          <div className="bubble-imgs">
            {msg.images.map((src, i) => (
              <img key={i} src={src} alt={`附图 ${i + 1}`} />
            ))}
          </div>
        )}
        {msg.content === "" ? (
          <span className="dots" aria-label="正在思考">
            <i />
            <i />
            <i />
          </span>
        ) : (
          <div className="md" dangerouslySetInnerHTML={{ __html: html }} />
        )}
        {streaming && <span className="cursor">▍</span>}
      </div>
    </div>
  );
}
