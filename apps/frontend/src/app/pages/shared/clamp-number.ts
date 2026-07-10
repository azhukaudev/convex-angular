/**
 * Clamps a numeric form value to [min, max], falling back when the value is
 * missing. Native number inputs emit null when cleared and do not enforce
 * min/max on typed values, so raw ngModel values must not reach query args
 * (Convex arg validation rejects null) or pagination sizes.
 */
export function clampNumber(value: number | null | undefined, min: number, max: number, fallback: number): number {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}
