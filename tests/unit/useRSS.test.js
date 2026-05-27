import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useRSS } from '../../src/hooks/useRSS.js';

const feedResp = (count, prefix = 'a') => ({
  ok: true,
  json: async () => ({
    status: 'ok',
    feed: { title: `Stub-${prefix}` },
    items: Array.from({ length: count }, (_, i) => ({
      title: `${prefix} Story ${i}`,
      link: `https://example.com/${prefix}/${i}`,
      pubDate: new Date(2026, 0, i + 1).toISOString(),
      description: '',
      categories: ['News'],
    })),
  }),
});

describe('useRSS', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // useRSS references classifyTopic + timeAgo as build-time globals (concatenated
    // from src/utils/formatting.js by build.js). Tests run the source directly, so
    // stub the names the hook expects.
    globalThis.classifyTopic = () => 'BITCOIN';
    globalThis.timeAgo = () => '1m';
  });

  it('flattens items from all feeds and exposes leadStory + items', async () => {
    global.fetch = vi.fn().mockResolvedValue(feedResp(5));
    const { result } = renderHook(() => useRSS());
    await waitFor(() => expect(result.current.leadStory).not.toBeNull());

    expect(result.current.items.length).toBeGreaterThan(0);
    expect(result.current.err).toBe(false);
    expect(result.current.lastOk).toBeGreaterThan(0);
    expect(result.current.leadStory).toHaveProperty('hed');
  });

  it('marks err=true when every feed fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('network'));
    const { result } = renderHook(() => useRSS());
    await waitFor(() => expect(result.current.err).toBe(true));
    expect(result.current.items).toEqual([]);
    expect(result.current.leadStory).toBeNull();
  });
});
