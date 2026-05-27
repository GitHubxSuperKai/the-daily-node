import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('log', () => {
  let warnSpy, infoSpy, errorSpy;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    try { localStorage.removeItem('dailynode-debug'); } catch (_) { /* private mode */ }
  });

  it('errors always print', async () => {
    const { log } = await import('../../src/utils/log.js');
    log.error('boom');
    expect(errorSpy).toHaveBeenCalledWith('[DN]', 'boom');
  });

  it('warn/info silent when debug is off', async () => {
    const { log } = await import('../../src/utils/log.js');
    log.warn('x');
    log.info('y');
    expect(warnSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
  });

  it('warn/info print when localStorage flag is set', async () => {
    localStorage.setItem('dailynode-debug', '1');
    vi.resetModules();
    const { log } = await import('../../src/utils/log.js');
    log.warn('x');
    log.info('y');
    expect(warnSpy).toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalled();
  });
});
