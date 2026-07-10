import { Signal, WritableSignal, computed, signal } from '@angular/core';

export type NumberField = {
  /** Raw input state — bind with [(ngModel)]. Holds null while cleared. */
  readonly value: WritableSignal<number | null>;
  /** Always a valid number in [min, max]; the only accessor consumers should read. */
  readonly effective: Signal<number>;
  /** Snaps the raw value to the effective one — wire to the input's (blur). */
  readonly normalize: () => void;
};

/**
 * State for a numeric form input. Native number inputs emit null when
 * cleared and do not enforce min/max on typed values, so raw ngModel values
 * must never reach query args (Convex arg validation rejects null) or
 * pagination sizes — consumers read `effective` instead.
 */
export function numberField(initial: number, min: number, max: number): NumberField {
  const value = signal<number | null>(initial);
  const effective = computed(() => {
    const raw = value();
    if (raw === null || Number.isNaN(raw)) {
      return initial;
    }

    return Math.min(max, Math.max(min, raw));
  });

  return {
    value,
    effective,
    normalize: () => value.set(effective()),
  };
}
