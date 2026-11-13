export type CircuitNode =
  | { kind: "resistor"; id: string; resistance: number }
  | { kind: "series" | "parallel"; children: CircuitNode[] };

export interface CircuitModel {
  kind: "resistive-circuit";
  voltage: number;
  network: CircuitNode;
  requested: ("equivalent" | "current")[];
}

export interface CircuitResult {
  regime: "dc-steady-state";
  conducts: true;
  resistance: number;
  voltage: number;
  current: number;
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const hasOnly = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every(key => keys.includes(key));

/** A bounded series/parallel tree; free-form model output never becomes Typst code. */
export function validateCircuit(input: unknown): { ok: true; model: CircuitModel } | { ok: false; reasons: string[] } {
  if (!record(input) || !hasOnly(input, ["kind", "voltage", "network", "requested"]) || input.kind !== "resistive-circuit") return { ok: false, reasons: ["电路结构不在支持范围"] };
  if (typeof input.voltage !== "number" || !Number.isFinite(input.voltage) || input.voltage < 1e-6 || input.voltage > 1e6) return { ok: false, reasons: ["电源电压缺失或超出支持范围"] };
  if (!Array.isArray(input.requested) || input.requested.length < 1 || input.requested.some(value => value !== "equivalent" && value !== "current") || new Set(input.requested).size !== input.requested.length) return { ok: false, reasons: ["待求内容缺失或超出支持范围"] };
  const names = new Set<string>(["V"]);
  let count = 0;
  function parse(node: unknown, depth: number): CircuitNode | null {
    if (depth > 4 || !record(node)) return null;
    if (node.kind === "resistor") {
      if (!hasOnly(node, ["kind", "id", "resistance"]) || typeof node.id !== "string" || !/^[A-Za-z][A-Za-z0-9]{0,7}$/.test(node.id) || names.has(node.id) || typeof node.resistance !== "number" || !Number.isFinite(node.resistance) || node.resistance < 1e-6 || node.resistance > 1e9) return null;
      names.add(node.id);
      if (++count > 8) return null;
      return { kind: "resistor", id: node.id, resistance: node.resistance };
    }
    if ((node.kind !== "series" && node.kind !== "parallel") || !hasOnly(node, ["kind", "children"]) || !Array.isArray(node.children) || node.children.length < 2 || node.children.length > 4) return null;
    const children: CircuitNode[] = [];
    for (const child of node.children) {
      const parsed = parse(child, depth + 1);
      if (!parsed) return null;
      children.push(parsed);
    }
    return { kind: node.kind, children };
  }
  const network = parse(input.network, 0);
  if (!network) return { ok: false, reasons: ["电阻或串并联连接条件不完整，或超出支持范围"] };
  const requested: CircuitModel["requested"] = input.requested;
  return { ok: true, model: { kind: "resistive-circuit", voltage: input.voltage, network, requested } };
}

/** Independent reduction checks the numerical values returned by typed-physics. */
export function circuitReference(model: CircuitModel): { resistance: number; current: number } {
  function reduce(node: CircuitNode): number {
    if (node.kind === "resistor") return node.resistance;
    const values = node.children.map(reduce);
    return node.kind === "series" ? values.reduce((a, b) => a + b, 0) : 1 / values.reduce((a, b) => a + 1 / b, 0);
  }
  const resistance = reduce(model.network);
  return { resistance, current: model.voltage / resistance };
}

export function verifyCircuitResult(model: CircuitModel, value: unknown): value is CircuitResult {
  if (!record(value) || value.regime !== "dc-steady-state" || value.conducts !== true) return false;
  const reference = circuitReference(model);
  const close = (actual: unknown, expected: number) => typeof actual === "number" && Number.isFinite(actual) && Math.abs(actual - expected) <= Math.max(100 * Number.MIN_VALUE, Math.abs(expected) * 1e-6);
  return close(value.voltage, model.voltage) && close(value.resistance, reference.resistance) && close(value.current, reference.current);
}

export function makeCircuitSource(input: unknown): { source: string; model: CircuitModel; assumptions: string[] } {
  const checked = validateCircuit(input);
  if (!checked.ok) throw new Error(checked.reasons.join("；"));
  function emit(node: CircuitNode): string {
    if (node.kind === "resistor") return `e.resistor(${JSON.stringify(node.id)}, resistance: ${node.resistance})`;
    return `e.${node.kind}(${node.children.map(emit).join(", ")})`;
  }
  const source = `#import "@preview/typed-physics:0.3.0": electricity as e\n#let c = e.dc-circuit(e.voltage-source("V", voltage: ${checked.model.voltage}), ${emit(checked.model.network)})\n#let r = e.results(c)\n#metadata((regime: r.regime, conducts: r.conducts, resistance: r.resistance.value, voltage: r.voltage.value, current: r.current.value)) <physics-result>`;
  return { source, model: checked.model, assumptions: [] };
}
