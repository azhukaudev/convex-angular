import { numberField } from './number-field';

describe('numberField', () => {
  it('starts at the initial value with effective equal to it', () => {
    const field = numberField(5, 1, 50);

    expect(field.value()).toBe(5);
    expect(field.effective()).toBe(5);
  });

  it('keeps in-range writes as-is', () => {
    const field = numberField(5, 1, 50);

    field.value.set(20);

    expect(field.effective()).toBe(20);
  });

  it('clamps out-of-range values in effective while value holds the raw input', () => {
    const field = numberField(5, 1, 50);

    field.value.set(999);
    expect(field.value()).toBe(999);
    expect(field.effective()).toBe(50);

    field.value.set(-3);
    expect(field.effective()).toBe(1);
  });

  it('falls back to the initial value when the input is cleared', () => {
    const field = numberField(5, 1, 50);

    field.value.set(null);

    expect(field.effective()).toBe(5);
  });

  it('normalize writes the effective value back to the raw value', () => {
    const field = numberField(5, 1, 50);

    field.value.set(999);
    field.normalize();
    expect(field.value()).toBe(50);

    field.value.set(null);
    field.normalize();
    expect(field.value()).toBe(5);
  });
});
