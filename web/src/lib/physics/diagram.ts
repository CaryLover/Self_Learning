import type { SmoothInclineModel } from "./model";
import type { HangingModel } from "./hanging";
import type { CircuitModel, CircuitNode } from "./circuit";

const esc = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const n = (value: number): string => Number(value.toPrecision(4)).toString();
const font = "font-family=\"system-ui, 'Microsoft YaHei', sans-serif\"";

function arrow(x1: number, y1: number, x2: number, y2: number, color: string, width = 3): string {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = 9;
  const hx = x2 - Math.cos(angle) * head;
  const hy = y2 - Math.sin(angle) * head;
  const px = Math.sin(angle) * head * 0.55;
  const py = -Math.cos(angle) * head * 0.55;
  return `<line x1="${x1}" y1="${y1}" x2="${hx}" y2="${hy}" stroke="${color}" stroke-width="${width}" stroke-linecap="round"/>` +
    `<polygon points="${x2},${y2} ${hx + px},${hy + py} ${hx - px},${hy - py}" fill="${color}"/>`;
}

function label(x: number, y: number, text: string, color = "#243b35", size = 15, anchor = "middle"): string {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" ${font} font-size="${size}" fill="${color}">${esc(text)}</text>`;
}

function panel(x: number, y: number, width: number, height: number, title: string): string {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="12" fill="#f8fcfa" stroke="#cfe3da"/>` +
    `<text x="${x + 16}" y="${y + 24}" ${font} font-size="14" font-weight="600" fill="#386052">${esc(title)}</text>`;
}

/** 光滑固定斜面的场景图和物块受力图，使用普通 SVG，不依赖 CeTZ。 */
export function inclineDiagram(model: SmoothInclineModel, result: { normal: number; acceleration: number }): string {
  const theta = (model.angleDeg.value * Math.PI) / 180;
  const sin = Math.sin(theta);
  const cos = Math.cos(theta);
  const x0 = 60;
  const baseY = 230;
  const baseW = 360;
  const topY = baseY - baseW * Math.tan(theta);
  const t = 0.55;
  const bx = x0 + baseW * t;
  const by = baseY - (baseY - topY) * t;
  const normalLen = 76;
  const nx = bx - sin * normalLen;
  const ny = by - cos * normalLen;
  const fbdX = 260;
  const fbdY = 395;
  const fnx = fbdX - sin * normalLen;
  const fny = fbdY - cos * normalLen;
  const object = esc(model.objectName);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 500" role="img" aria-label="光滑斜面上的物块及其受力图">` +
    `<title>光滑斜面上的物块和受力图</title>` +
    panel(10, 10, 500, 250, "场景图") +
    `<line x1="${x0}" y1="${baseY}" x2="${x0 + baseW}" y2="${baseY}" stroke="#31473f" stroke-width="4"/>` +
    `<line x1="${x0 + baseW}" y1="${baseY}" x2="${x0 + baseW}" y2="${topY}" stroke="#31473f" stroke-width="4"/>` +
    `<line x1="${x0}" y1="${baseY}" x2="${x0 + baseW}" y2="${topY}" stroke="#31473f" stroke-width="4"/>` +
    label(x0 + 88, baseY - 8, `${n(model.angleDeg.value)}°`, "#386052", 14) +
    `<g transform="translate(${bx},${by}) rotate(${-model.angleDeg.value})">` +
    `<rect x="-32" y="-20" width="64" height="40" rx="4" fill="#d9edf5" stroke="#2d5d78" stroke-width="3"/>` +
    label(0, 7, object, "#1d3f50", 16) + `</g>` +
    arrow(bx, by, bx, by + 82, "#b33a2b") +
    label(bx + 18, by + 78, "W", "#b33a2b", 16, "start") +
    arrow(bx - 8, by - 8, nx, ny, "#1d6b9c") +
    label(nx - 8, ny - 8, "N", "#1d6b9c", 16, "end") +
    panel(10, 275, 500, 215, "受力图（不按比例）") +
    `<rect x="${fbdX - 28}" y="${fbdY - 28}" width="56" height="56" rx="5" fill="#d9edf5" stroke="#2d5d78" stroke-width="3"/>` +
    label(fbdX, fbdY + 7, "A", "#1d3f50", 17) +
    arrow(fbdX, fbdY + 28, fbdX, fbdY + 85, "#b33a2b") +
    label(fbdX + 16, fbdY + 80, "W", "#b33a2b", 16, "start") +
    arrow(fbdX - 8, fbdY - 8, fnx, fny, "#1d6b9c") +
    label(fnx - 8, fny - 8, "N", "#1d6b9c", 16, "end") +
    label(480, 300, `N≈${n(result.normal)} N　a≈${n(result.acceleration)} m/s²`, "#386052", 12, "end") +
    `</svg>`;
}

/** 竖直悬挂静止的场景图和物块受力图。 */
export function hangingDiagram(model: HangingModel, result: { tension: number }): string {
  const ceilingY = 50;
  const ropeTop = ceilingY;
  const blockTop = 150;
  const blockW = 86;
  const blockH = 54;
  const cx = 260;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 500" role="img" aria-label="竖直悬挂的物体及其受力图">` +
    `<title>竖直悬挂的物体和受力图</title>` +
    panel(10, 10, 500, 245, "场景图") +
    `<line x1="70" y1="${ceilingY}" x2="450" y2="${ceilingY}" stroke="#31473f" stroke-width="5"/>` +
    Array.from({ length: 14 }, (_, i) => `<line x1="${78 + i * 26}" y1="${ceilingY}" x2="${70 + i * 26}" y2="${ceilingY - 15}" stroke="#7c8f86" stroke-width="2"/>`).join("") +
    `<line x1="${cx}" y1="${ropeTop}" x2="${cx}" y2="${blockTop}" stroke="#495057" stroke-width="4"/>` +
    `<rect x="${cx - blockW / 2}" y="${blockTop}" width="${blockW}" height="${blockH}" rx="4" fill="#d9edf5" stroke="#2d5d78" stroke-width="3"/>` +
    label(cx, blockTop + 36, "A", "#1d3f50", 18) +
    arrow(cx, blockTop + blockH, cx, blockTop + blockH + 32, "#b33a2b") +
    label(cx + 18, blockTop + blockH + 28, "W", "#b33a2b", 16, "start") +
    arrow(cx, blockTop - 8, cx, ropeTop + 34, "#1d6b9c") +
    label(cx + 16, ropeTop + 38, "T", "#1d6b9c", 16, "start") +
    panel(10, 270, 500, 220, "受力图（不按比例）") +
    `<rect x="232" y="370" width="56" height="56" rx="5" fill="#d9edf5" stroke="#2d5d78" stroke-width="3"/>` +
    label(260, 404, "A", "#1d3f50", 17) +
    arrow(260, 426, 260, 478, "#b33a2b") +
    label(276, 474, "W", "#b33a2b", 16, "start") +
    arrow(260, 370, 260, 300, "#1d6b9c") +
    label(276, 306, "T", "#1d6b9c", 16, "start") +
    label(480, 476, `T=${n(result.tension)} N`, "#386052", 12, "end") +
    `</svg>`;
}

type CircuitLayout = { width: number; height: number; draw: string; leftY: number; rightY: number };

const resistor = (node: Extract<CircuitNode, { kind: "resistor" }>): CircuitLayout => {
  const width = 112;
  const height = 48;
  return {
    width,
    height,
    leftY: height / 2,
    rightY: height / 2,
    draw: `<line x1="0" y1="24" x2="20" y2="24" stroke="#31473f" stroke-width="2"/>` +
      `<rect x="20" y="12" width="72" height="24" rx="3" fill="#fff" stroke="#31473f" stroke-width="2"/>` +
      label(56, 29, node.id, "#243b35", 13) +
      `<line x1="92" y1="24" x2="${width}" y2="24" stroke="#31473f" stroke-width="2"/>`,
  };
};

function layoutCircuit(node: CircuitNode): CircuitLayout {
  if (node.kind === "resistor") return resistor(node);
  const children = node.children.map(layoutCircuit);
  if (node.kind === "series") {
    const gap = 26;
    const width = children.reduce((sum, child) => sum + child.width, 0) + gap * (children.length - 1);
    const height = Math.max(...children.map(child => child.height));
    let x = 0;
    const parts: string[] = [];
    children.forEach((child, index) => {
      const y = (height - child.height) / 2;
      parts.push(`<g transform="translate(${x},${y})">${child.draw}</g>`);
      if (index < children.length - 1) {
        parts.push(`<line x1="${x + child.width}" y1="${height / 2}" x2="${x + child.width + gap}" y2="${height / 2}" stroke="#31473f" stroke-width="2"/>`);
        x += child.width + gap;
      } else {
        x += child.width;
      }
    });
    return { width, height, leftY: height / 2, rightY: height / 2, draw: parts.join("") };
  }
  const gap = 22;
  const width = Math.max(...children.map(child => child.width)) + 70;
  const height = children.reduce((sum, child) => sum + child.height, 0) + gap * (children.length - 1);
  const leftBus = 35;
  const rightBus = width - 35;
  const parts: string[] = [];
  let y = 0;
  const centers: number[] = [];
  for (const child of children) {
    const childY = y;
    const cy = childY + child.height / 2;
    centers.push(cy);
    parts.push(`<g transform="translate(${(width - child.width) / 2},${childY})">${child.draw}</g>`);
    parts.push(`<line x1="${leftBus}" y1="${cy}" x2="${(width - child.width) / 2}" y2="${cy}" stroke="#31473f" stroke-width="2"/>`);
    parts.push(`<line x1="${(width + child.width) / 2}" y1="${cy}" x2="${rightBus}" y2="${cy}" stroke="#31473f" stroke-width="2"/>`);
    y += child.height + gap;
  }
  parts.push(`<line x1="${leftBus}" y1="${centers[0]}" x2="${leftBus}" y2="${centers[centers.length - 1]}" stroke="#31473f" stroke-width="2"/>`);
  parts.push(`<line x1="${rightBus}" y1="${centers[0]}" x2="${rightBus}" y2="${centers[centers.length - 1]}" stroke="#31473f" stroke-width="2"/>`);
  parts.push(`<line x1="0" y1="${height / 2}" x2="${leftBus}" y2="${height / 2}" stroke="#31473f" stroke-width="2"/>`);
  parts.push(`<line x1="${rightBus}" y1="${height / 2}" x2="${width}" y2="${height / 2}" stroke="#31473f" stroke-width="2"/>`);
  for (const cy of centers) {
    parts.push(`<circle cx="${leftBus}" cy="${cy}" r="4" fill="#31473f"/>`);
    parts.push(`<circle cx="${rightBus}" cy="${cy}" r="4" fill="#31473f"/>`);
  }
  return { width, height, leftY: height / 2, rightY: height / 2, draw: parts.join("") };
}

/** 有界纯电阻网络的直流电路图；只画声明过的电阻和连接。 */
export function circuitDiagram(model: CircuitModel, result: { resistance: number; current: number }): string {
  const layout = layoutCircuit(model.network);
  const networkX = 115;
  const networkY = 105;
  const leftRail = 70;
  const rightRail = networkX + layout.width + 45;
  const railTop = networkY + Math.min(layout.leftY, layout.rightY);
  const bottomY = networkY + layout.height + 115;
  const sourceX = (leftRail + rightRail) / 2;
  const sourceY = bottomY;
  const width = rightRail + 45;
  const height = bottomY + 55;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.max(520, width)} ${Math.max(360, height)}" role="img" aria-label="理想直流电源和纯电阻网络">` +
    `<title>直流电路图</title>` +
    `<line x1="${leftRail}" y1="${railTop}" x2="${leftRail}" y2="${bottomY}" stroke="#31473f" stroke-width="2"/>` +
    `<line x1="${rightRail}" y1="${railTop}" x2="${rightRail}" y2="${bottomY}" stroke="#31473f" stroke-width="2"/>` +
    `<line x1="${leftRail}" y1="${networkY + layout.leftY}" x2="${networkX}" y2="${networkY + layout.leftY}" stroke="#31473f" stroke-width="2"/>` +
    `<line x1="${networkX + layout.width}" y1="${networkY + layout.rightY}" x2="${rightRail}" y2="${networkY + layout.rightY}" stroke="#31473f" stroke-width="2"/>` +
    `<g transform="translate(${networkX},${networkY})">${layout.draw}</g>` +
    `<line x1="${sourceX - 48}" y1="${sourceY}" x2="${sourceX - 22}" y2="${sourceY}" stroke="#31473f" stroke-width="2"/>` +
    `<circle cx="${sourceX}" cy="${sourceY}" r="22" fill="#fff" stroke="#31473f" stroke-width="2"/>` +
    `<line x1="${sourceX - 9}" y1="${sourceY - 13}" x2="${sourceX - 9}" y2="${sourceY + 13}" stroke="#31473f" stroke-width="2"/>` +
    `<line x1="${sourceX + 8}" y1="${sourceY - 7}" x2="${sourceX + 8}" y2="${sourceY + 7}" stroke="#31473f" stroke-width="2"/>` +
    label(sourceX - 18, sourceY - 10, "＋", "#243b35", 12, "end") +
    label(sourceX + 18, sourceY + 16, "－", "#243b35", 12, "start") +
    `<line x1="${sourceX + 22}" y1="${sourceY}" x2="${sourceX + 48}" y2="${sourceY}" stroke="#31473f" stroke-width="2"/>` +
    label(sourceX, sourceY - 30, "V", "#243b35", 14) +
    `<line x1="${leftRail}" y1="${bottomY}" x2="${sourceX - 48}" y2="${sourceY}" stroke="#31473f" stroke-width="2"/>` +
    `<line x1="${sourceX + 48}" y1="${sourceY}" x2="${rightRail}" y2="${bottomY}" stroke="#31473f" stroke-width="2"/>` +
    label(20, 24, `V=${n(model.voltage)} V`, "#243b35", 13, "start") +
    label(20, 44, `R≈${n(result.resistance)} Ω　I≈${n(result.current)} A`, "#386052", 12, "start") +
    `</svg>`;
}
