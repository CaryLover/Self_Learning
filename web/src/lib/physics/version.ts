import type { PhysicsModel } from "./pipeline";

export function physicsModelVersion(kind: PhysicsModel["kind"]): string {
  switch (kind) {
    case "person-board-rest": return "person-board-static:1";
    case "smooth-incline":
    case "hanging-at-rest":
    case "resistive-circuit": return "typed-physics:0.3.0";
    default: {
      const unsupported: never = kind;
      throw new Error(`不支持的物理模型：${unsupported}`);
    }
  }
}
