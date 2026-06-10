import { describe, it, expect } from 'vitest';
import { estimateStepsKcal, pickResolvedActivityKcal } from './wearableActivityCalories';

describe('pickResolvedActivityKcal', () => {
  it('prioriza energía activa sobre estimación por pasos', () => {
    expect(pickResolvedActivityKcal(120, 5000)).toBe(120);
  });

  it('usa estimación por pasos si no hay energía activa', () => {
    expect(pickResolvedActivityKcal(null, 5000)).toBe(estimateStepsKcal(5000));
  });

  it('devuelve null sin ambos', () => {
    expect(pickResolvedActivityKcal(null, null)).toBe(null);
  });
});
