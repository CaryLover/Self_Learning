import { validateCircuit, type CircuitModel, type CircuitNode } from "./circuit";

type Extraction = { status: "candidate"; model: CircuitModel; assumptions: string[]; evidence: Record<string, string> } | { status: "needs_review"; reason: string };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

/** Evidence confirms that excerpts occur in the input, not that the model understood the topology. */
export function parseCircuitExtraction(value: Record<string, unknown>, original: string): Extraction {
  const checked = validateCircuit(value.model);
  if (!checked.ok) return { status: "needs_review", reason: checked.reasons.join("；") };
  const ideal = /理想(?:直流)?电源|直流理想电源/.test(original) && /直流/.test(original) && !/(?:非|不|并非|不是).{0,4}(?:理想(?:直流)?电源|直流)/.test(original);
  const resistiveOnly = /纯电阻|(?:仅|只)(?:由|有|含)电阻|只有电阻/.test(original) && !/(?:非|不|并非|不是).{0,4}(?:纯电阻|(?:仅|只)(?:由|有|含)电阻|只有电阻)/.test(original);
  if (!ideal || !resistiveOnly || /电容|电感|交流|开关|变阻器|电流表|电压表|短路|断路|内阻|功率|电能|电热|灯泡|二极管|电动机/.test(original)) return { status: "needs_review", reason: "需要明确理想电源与纯电阻连接，其他元件或待求量暂不支持" };
  const targets: Record<CircuitModel["requested"][number], RegExp> = { equivalent: /总电阻|等效电阻/, current: /总电流|干路电流|电源(?:的|提供的)?电流/ };
  if (checked.model.requested.some(target => !targets[target].test(original))) return { status: "needs_review", reason: "待求的总电阻或总电流缺少明确题面依据" };
  const evidence = value.evidence;
  if (!record(evidence) || !record(evidence.resistors)) return { status: "needs_review", reason: "缺少电路题目的原文依据" };
  const excerpt = (input: unknown, limit: number): input is string => typeof input === "string" && !!input.trim() && input.length <= limit && original.includes(input);
  if (!excerpt(evidence.voltage, 200) || !excerpt(evidence.topology, 500)) return { status: "needs_review", reason: "电源或连接关系缺少可核对的原文依据" };
  const topology = evidence.topology;
  const resistorEvidence = evidence.resistors;
  const position = original.indexOf(topology);
  const context = original.slice(Math.max(0, position - 12), Math.min(original.length, position + topology.length + 12));
  if (/(?:不|非|并非|不是|没有|未|可能|或许|不一定)[^。；;，,]{0,40}(?:串联|并联)|(?:串联|并联)[^。；;，,]{0,10}(?:还是|或者|不确定)/.test(context)) return { status: "needs_review", reason: "串并联连接关系存在否定或不确定描述" };
  const numberWithUnit = (text: string, expected: number, units: string): boolean => {
    const withoutExponents = text.replace(/(?:\d+(?:\.\d+)?|\.\d+)[eE][+-]?\d+/g, "");
    if (/[+\-−－×*÷/＋]/.test(withoutExponents) || /\d[\s,，]+\d/.test(withoutExponents)) return false;
    const pattern = new RegExp(`(?<![A-Za-z\\d.,，+-])((?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:[eE][+-]?\\d+)?)\\s*(?:${units})`, "gi");
    const values = [...text.matchAll(pattern)];
    return values.length === 1 && Number(values[0][1]) === expected;
  };
  if (!numberWithUnit(evidence.voltage, checked.model.voltage, "V(?![A-Za-z/])|伏特(?![A-Za-z/安每])|伏(?![A-Za-z/特安每])")) return { status: "needs_review", reason: "电源电压与原文依据不一致，暂只支持伏特" };
  const flattened: Record<string, string> = { voltage: evidence.voltage, topology: evidence.topology };
  const resistorNames = new Set<string>();
  let reason = "";
  function check(node: CircuitNode): void {
    if (node.kind !== "resistor") {
      const word = node.kind === "series" ? "串联" : "并联";
      if (!topology.includes(word)) reason = `连接关系缺少“${word}”的原文依据`;
      node.children.forEach(check);
      return;
    }
    const fragment = resistorEvidence[node.id];
    resistorNames.add(node.id);
    const id = new RegExp(`\\b${node.id}\\b`);
    if (!excerpt(fragment, 200) || !id.test(fragment) || !id.test(topology) || !numberWithUnit(fragment.replace(id, ""), node.resistance, "Ω(?![A-Za-z/])|欧姆(?![A-Za-z/每])|欧(?![A-Za-z/姆每])")) reason = `${node.id} 的阻值或连接关系缺少可核对的原文依据，暂只支持欧姆`;
    else flattened[`resistor:${node.id}`] = fragment;
  }
  check(checked.model.network);
  if ([...original.matchAll(/\bR\d+\b/g)].some(match => !resistorNames.has(match[0]))) reason = "题目可能包含未建模的电阻，请核对完整连接关系";
  return reason ? { status: "needs_review", reason } : { status: "candidate", model: checked.model, assumptions: [], evidence: flattened };
}
