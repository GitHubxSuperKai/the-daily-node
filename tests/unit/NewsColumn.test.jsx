import React from 'react';
globalThis.React = React;

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeCtx, LIGHT } from '../../src/theme.js';
import { NewsColumn } from '../../src/components/NewsColumn.jsx';

function mount(props) {
  return render(
    <ThemeCtx.Provider value={LIGHT}>
      <NewsColumn newsItems={[]} rssErr={false} loaded={false} hasLead={false} {...props} />
    </ThemeCtx.Provider>,
  );
}

const ITEM = { hed: 'Hashrate hits a new high', link: 'https://example.com/a', src: 'CoinDesk', t: '1h', topic: 'MINING' };

describe('NewsColumn — empty states', () => {
  it('loaded with no items and no lead: "No Bitcoin headlines right now"', () => {
    mount({ loaded: true, hasLead: false });
    expect(screen.getByText('No Bitcoin headlines right now')).toBeDefined();
    expect(screen.queryByText('No more headlines right now')).toBeNull();
  });

  it('loaded with no items but a lead shown: "No more headlines right now"', () => {
    mount({ loaded: true, hasLead: true });
    expect(screen.getByText('No more headlines right now')).toBeDefined();
    expect(screen.queryByText('No Bitcoin headlines right now')).toBeNull();
  });

  it('not loaded yet: loading copy, neither empty state', () => {
    mount({ loaded: false, hasLead: true });
    expect(screen.getByText('Loading headlines…')).toBeDefined();
    expect(screen.queryByText(/headlines right now/)).toBeNull();
  });

  it('a feed error wins over the empty states', () => {
    mount({ rssErr: true, loaded: true, hasLead: false });
    expect(screen.getByText('All feeds unavailable')).toBeDefined();
    expect(screen.queryByText(/headlines right now/)).toBeNull();
  });

  it('items present: renders them, no empty state', () => {
    mount({ newsItems: [ITEM], loaded: true, hasLead: false });
    expect(screen.getByText('Hashrate hits a new high')).toBeDefined();
    expect(screen.queryByText(/headlines right now/)).toBeNull();
  });
});
