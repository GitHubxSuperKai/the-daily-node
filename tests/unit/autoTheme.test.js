import { describe, it, expect } from 'vitest';
import { themeFlipDecision } from '../../src/utils/autoTheme.js';

describe('themeFlipDecision', () => {
  it('is a no-op when shouldBeDark is unchanged', () => {
    expect(themeFlipDecision(true, true, true)).toEqual({ update: false, flip: false });
    expect(themeFlipDecision(false, false, false)).toEqual({ update: false, flip: false });
  });

  it('on first eval (null prev), records and flips when current theme disagrees', () => {
    // initial load after sunset, currently light -> should flip to dark
    expect(themeFlipDecision(null, true, false)).toEqual({ update: true, flip: true });
  });

  it('on first eval (null prev), records without flipping when already aligned', () => {
    expect(themeFlipDecision(null, true, true)).toEqual({ update: true, flip: false });
  });

  it('sunset crossing (light -> should-be-dark) flips to dark', () => {
    expect(themeFlipDecision(false, true, false)).toEqual({ update: true, flip: true });
  });

  it('sunrise crossing (dark -> should-be-light) flips to light', () => {
    expect(themeFlipDecision(true, false, true)).toEqual({ update: true, flip: true });
  });

  it('records a crossing without flipping when user is already in the target theme', () => {
    // sunset crossing but user had manually gone dark already
    expect(themeFlipDecision(false, true, true)).toEqual({ update: true, flip: false });
  });

  it('no-op (no crossing) even when dark state disagrees with shouldBeDark', () => {
    // same shouldBeDark as prev -> no crossing -> no flip even if dark is wrong
    expect(themeFlipDecision(true, true, false)).toEqual({ update: false, flip: false });
  });
});
