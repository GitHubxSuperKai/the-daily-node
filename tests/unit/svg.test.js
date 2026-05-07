import { describe, it, expect } from 'vitest';
import { ANIM_SPEED, METEOCONS_SVG, _processSvg } from '../../src/utils/svg.js';

describe('ANIM_SPEED table', () => {
  it('defines a speed for every weather icon name', () => {
    const iconNames = Object.keys(METEOCONS_SVG);
    for (const name of iconNames) {
      expect(ANIM_SPEED).toHaveProperty(name);
      expect(typeof ANIM_SPEED[name]).toBe('number');
    }
  });
});

describe('METEOCONS_SVG library', () => {
  it('contains the canonical icon set', () => {
    const expected = [
      'clear-day', 'clear-night', 'partly-cloudy-day', 'partly-cloudy-night',
      'overcast', 'rain', 'snow', 'fog', 'wind', 'drizzle', 'thunderstorms',
    ];
    for (const name of expected) {
      expect(METEOCONS_SVG).toHaveProperty(name);
      expect(METEOCONS_SVG[name]).toMatch(/^<svg[\s>]/);
    }
  });
});

describe('_processSvg', () => {
  const sample = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><g id="foo"><circle id="bar"/><use href="#foo"/></g><animateTransform dur="3s"/></svg>`;

  it('namespaces ids with the uid prefix', () => {
    const out = _processSvg(sample, 7, 1, 64);
    expect(out).toContain('id="wi7-foo"');
    expect(out).toContain('id="wi7-bar"');
    expect(out).not.toMatch(/\bid="foo"/);
  });

  it('rewrites href references to namespaced ids', () => {
    const out = _processSvg(sample, 7, 1, 64);
    expect(out).toContain('href="#wi7-foo"');
  });

  it('scales SMIL durations by speedMult', () => {
    const out = _processSvg(sample, 1, 2, 64);
    expect(out).toContain('dur="6.000s"');  // 3s * 2
  });

  it('injects width/height attributes on the root <svg>', () => {
    const out = _processSvg(sample, 1, 1, 48);
    expect(out).toMatch(/^<svg width="48" height="48" /);
  });

  it('scales ms-unit SMIL durations by speedMult', () => {
    const withMs = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><animateTransform dur="500ms"/></svg>`;
    const out = _processSvg(withMs, 1, 2, 64);
    expect(out).toContain('dur="1000ms"');  // 500ms * 2
  });
});
