import { describe, it, expect } from 'vitest';
import { isValidLanIp } from '../../src/utils/ipValidation.js';

describe('isValidLanIp', () => {
  it.each([
    ['192.168.1.10', true],
    ['10.0.0.1',     true],
    ['172.16.5.5',   true],
    ['127.0.0.1',    true],
    ['8.8.8.8',      false],   // public
    ['256.0.0.1',    false],   // out of range
    ['not-an-ip',    false],
    ['',             false],
    ['192.168.1',    false],   // missing octet
  ])('isValidLanIp(%s) === %s', (ip, expected) => {
    expect(isValidLanIp(ip)).toBe(expected);
  });
});
