/** Squared distance between two points on the XZ plane. */
export function distSq(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

/**
 * Compute the absolute angle difference between two angles in radians.
 * Uses atan2(dx, dz) convention (same as game rotY).
 * Returns a value in [0, PI].
 */
export function angleBetween(fromAngle: number, toAngle: number): number {
  let diff = toAngle - fromAngle;
  diff = ((diff + Math.PI) % (2 * Math.PI)) - Math.PI;
  if (diff < -Math.PI) diff += 2 * Math.PI;
  return Math.abs(diff);
}

/**
 * Check if a source position is behind a target (relative to target's facing direction).
 * @param targetRotY - The facing angle of the target (atan2(dx, dz) convention)
 * @param targetX/Z - Target position
 * @param sourceX/Z - Source position (attacker)
 * @param thresholdDeg - Angle threshold in degrees (default 100°)
 */
export function isFromBehind(
  targetRotY: number,
  targetX: number,
  targetZ: number,
  sourceX: number,
  sourceZ: number,
  thresholdDeg: number = 100,
): boolean {
  const dx = sourceX - targetX;
  const dz = sourceZ - targetZ;
  const hitAngle = Math.atan2(dx, dz);
  return angleBetween(targetRotY, hitAngle) > (thresholdDeg * Math.PI) / 180;
}
