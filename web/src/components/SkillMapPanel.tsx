import type { SkillMap } from "../lib/types";

const LEVEL_HINT = ["没接触过", "听说过", "能看懂", "需要帮助", "能独立做", "能教别人"];

function Bar({ level }: { level: number }) {
  return (
    <div className="sk-bar" role="img" aria-label={`技能等级 ${level} / 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={`sk-seg${i <= level ? " on" : ""}`} />
      ))}
    </div>
  );
}

export function SkillMapPanel({ map }: { map?: SkillMap }) {
  if (!map || map.skills.length === 0) return null;
  return (
    <aside className="skillmap">
      <div className="skillmap-head">
        <h3><i className="ti ti-map-2" aria-hidden="true"></i> 技能地图</h3>
        <div className="sk-topic">{map.topic}</div>
      </div>
      <div className="sk-overall">
        <span>总体进度</span>
        <Bar level={Math.round((map.overall / 100) * 5)} />
        <b>{map.overall}%</b>
      </div>
      <ul>
        {map.skills.map((s, i) => (
          <li key={i} className={s.focus ? "focus" : ""}>
            <div className="sk-name">
              {s.focus && <span className="focus-dot"><i className="ti ti-caret-right" aria-hidden="true"></i></span>}
              {s.name}
              <span className="sk-level">
                {s.level}/5 {LEVEL_HINT[s.level] ?? ""}
              </span>
            </div>
            <Bar level={s.level} />
            {s.note && <div className="sk-note">{s.note}</div>}
          </li>
        ))}
      </ul>
    </aside>
  );
}
