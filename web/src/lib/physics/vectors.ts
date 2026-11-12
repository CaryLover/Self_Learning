/** Check complete force roles and physical-coordinate unit directions. */
export function verifyForceDirections(input: unknown, expected: Record<string, readonly [number, number]>): boolean {
  if (!Array.isArray(input) || input.length !== Object.keys(expected).length) return false;
  const found = new Set<string>();
  for (const force of input) {
    if (!force || typeof force !== "object" || typeof force.role !== "string" || !Object.prototype.hasOwnProperty.call(expected, force.role) || found.has(force.role)) return false;
    const direction = force.direction;
    if (!Array.isArray(direction) || direction.length !== 2 || direction.some(x => typeof x !== "number" || !Number.isFinite(x))) return false;
    const [x, y] = expected[force.role];
    if (Math.abs(direction[0] - x) > 1e-6 || Math.abs(direction[1] - y) > 1e-6) return false;
    found.add(force.role);
  }
  return found.size === Object.keys(expected).length;
}
