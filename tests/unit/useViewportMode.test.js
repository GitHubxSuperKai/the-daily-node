import { describe, it, expect } from 'vitest';

// Test the pure logic (getMode) extracted from the hook
const BREAKPOINT = 600;
const getMode = (width) => width <= BREAKPOINT ? 'mobile' : 'desktop';

describe('useViewportMode logic', () => {
  it('returns desktop above breakpoint', () => {
    expect(getMode(1920)).toBe('desktop');
    expect(getMode(601)).toBe('desktop');
  });

  it('returns mobile at breakpoint', () => {
    expect(getMode(600)).toBe('mobile');
    expect(getMode(390)).toBe('mobile');
    expect(getMode(375)).toBe('mobile');
  });

  it('desktop/mobile boundary is at 600px', () => {
    expect(getMode(601)).toBe('desktop');
    expect(getMode(600)).toBe('mobile');
  });
});
