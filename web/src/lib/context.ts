/** 上下文截断：每轮请求 = 系统提示词 + 技能地图状态 + 最近对话（防上下文超限） */

import type { Turn } from "./types";

export interface ContextWindow {
  turns: Turn[];
  truncated: boolean;
  dropped: number;
}

const TURN_CAP = 6000; // 单轮超长时截断（防个别超长轮次吃掉全部预算）

function capTurn(t: Turn, cap = TURN_CAP): Turn {
  if (t.content.length <= cap) return t;
  const half = Math.floor(cap / 2);
  return {
    ...t,
    content:
      t.role === "user"
        ? `${t.content.slice(0, half)}\n…（中间过长已省略）…\n${t.content.slice(-half)}`
        : `${t.content.slice(0, cap)}\n…（后续内容过长已省略）…`,
  };
}

/** 估算一轮的上下文占用：图片按固定成本计 */
function turnCost(t: Turn): number {
  return t.content.length + (t.images?.length ?? 0) * 1500;
}

/**
 * 保留两段：首轮（孩子最初要学的主题，苏格拉底全程需要锚定）+ 最近的对话。
 * 其余轮次丢弃，由调用方在系统提示里注入一句"更早对话已省略"。
 */
export function buildContext(turns: Turn[], budgetChars = 14000): ContextWindow {
  if (turns.length === 0) return { turns: [], truncated: false, dropped: 0 };

  const first = capTurn(turns[0]);
  const rest = turns.slice(1).map((t) => capTurn(t));

  // 从最新往回收，直到预算耗尽
  const kept: Turn[] = [];
  let used = turnCost(first);
  let dropped = 0;
  for (let i = rest.length - 1; i >= 0; i--) {
    const len = turnCost(rest[i]);
    if (used + len > budgetChars && kept.length >= 2) {
      dropped = i + 1;
      break;
    }
    used += len;
    kept.unshift(rest[i]);
  }

  const out: Turn[] = turns.length > 0 ? [first, ...kept] : kept;
  return { turns: out, truncated: dropped > 0, dropped };
}
