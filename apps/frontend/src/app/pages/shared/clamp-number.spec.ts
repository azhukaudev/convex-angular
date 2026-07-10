import { clampNumber } from './clamp-number';

describe('clampNumber', () => {
  it('returns in-range values unchanged', () => {
    expect(clampNumber(5, 1, 50, 10)).toBe(5);
  });

  it('clamps values below the minimum', () => {
    expect(clampNumber(0, 1, 50, 10)).toBe(1);
    expect(clampNumber(-3, 1, 50, 10)).toBe(1);
  });

  it('clamps values above the maximum', () => {
    expect(clampNumber(999, 1, 50, 10)).toBe(50);
  });

  it('falls back when the input is cleared (null) or not a number', () => {
    expect(clampNumber(null, 1, 50, 10)).toBe(10);
    expect(clampNumber(undefined, 1, 50, 10)).toBe(10);
    expect(clampNumber(Number.NaN, 1, 50, 10)).toBe(10);
  });
});
