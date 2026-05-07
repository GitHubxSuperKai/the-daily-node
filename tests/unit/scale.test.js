import { describe, it, expect } from 'vitest';
import { u } from '../../src/utils/scale.js';

describe('u (viewport unit helper)', () => {
  it('produces a calc() expression with the --u variable', () => {
    expect(u(300)).toBe('calc(var(--u) * 300)');
  });
  it('handles zero', () => {
    expect(u(0)).toBe('calc(var(--u) * 0)');
  });
  it('handles fractional values', () => {
    expect(u(1.5)).toBe('calc(var(--u) * 1.5)');
  });
});
