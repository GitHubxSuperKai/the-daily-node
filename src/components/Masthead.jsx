import React from 'react';
import { useT } from '../theme';

const MASTHEAD_QUOTES = [
  { text: "The root problem with conventional currency is all the trust that's required to make it work.", attr: 'Satoshi Nakamoto · 2009' },
  { text: 'Running bitcoin.', attr: 'Hal Finney · Jan 11, 2009' },
  { text: 'It might make sense just to get some in case it catches on.', attr: 'Satoshi Nakamoto · 2009' },
  { text: 'Bitcoin is the internet of money.', attr: 'Andreas Antonopoulos' },
  { text: 'Not your keys, not your coins.', attr: 'Andreas Antonopoulos' },
  { text: 'Be your own bank.', attr: 'Andreas Antonopoulos' },
  { text: 'Stay humble. Stack sats.', attr: 'Matt Odell' },
  { text: 'Bitcoin is the hardest money ever invented.', attr: 'Saifedean Ammous' },
  { text: 'Trusted third parties are security holes.', attr: 'Nick Szabo' },
  { text: 'There is no second best.', attr: 'Pierre Rochard' },
  { text: 'Bitcoin fixes this.', attr: 'Jack Mallers' },
  { text: 'Bitcoin changes absolutely everything.', attr: 'Jack Dorsey' },
  { text: 'Bitcoin is hope.', attr: 'Michael Saylor' },
  { text: 'Bitcoin is a swarm of cyber hornets serving the goddess of wisdom.', attr: 'Michael Saylor' },
  { text: 'Bitcoin is digital scarcity.', attr: 'Adam Back' },
  { text: 'Bitcoin is the separation of money and state.', attr: 'Erik Voorhees' },
  { text: "Don't trust, verify.", attr: 'Bitcoin cypherpunk tradition' },
  { text: 'Gradually, then suddenly.', attr: 'Jeff Booth · The Price of Tomorrow' },
  { text: 'Have fun staying poor.', attr: 'Bitcoin Twitter, circa 2017' },
  { text: 'One bitcoin equals one bitcoin.', attr: 'Bitcoin axiom' },
  { text: 'Bitcoin is an exit.', attr: 'Nic Carter' },
  { text: 'Bitcoin is the most important monetary invention in 500 years.', attr: 'Max Keiser' },
  { text: 'Number go up.', attr: 'Bitcoin maxim' },
  { text: 'Gradually, then all at once.', attr: 'Bitcoin community' },
];

export function Masthead({ clock, wxSummary, blockReward, rewardEra, dark, onToggleDark, onOpenSettings }) {
  const T = useT();

  // One quote per hour — 24 quotes maps perfectly to hours 0–23
  const quote = MASTHEAD_QUOTES[new Date().getHours()];

  const metaStyle = {
    fontFamily: T.sans,
    fontSize: 10,
    fontWeight: 500,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: T.ink3,
    lineHeight: 1.7,
  };

  const btnBase = {
    cursor: 'pointer',
    fontFamily: T.sans,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    padding: '5px 12px',
    whiteSpace: 'nowrap',
    border: `1px solid ${T.ink3}`,
  };

  return (
    <div style={{ width: '100%', paddingBottom: 10 }}>
      <div style={{ borderTop: `1px solid ${T.rule}`, marginBottom: 7 }} />

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        gap: 24,
      }}>
        {/* LEFT — edition info + rotating quote below */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={metaStyle}>Home Edition · Vol. XXI, Nº 238</div>
          <div style={{ ...metaStyle, color: T.ink4 }}>Est. 2026 · Printed on the blockchain</div>
          <div style={{ marginTop: 5, fontFamily: T.body, fontStyle: 'italic', fontSize: 11, color: T.ink2, lineHeight: 1.4, maxWidth: 340 }}>
            "{quote.text}"
          </div>
          <div style={{ fontFamily: T.sans, fontSize: 9, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', color: T.ink4, marginTop: 2 }}>
            — {quote.attr}
          </div>
        </div>

        {/* CENTER — wordmark */}
        <div style={{ textAlign: 'center', padding: '0 40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 5 }}>
            <div style={{ flex: 1, borderTop: `1px solid ${T.rule2}` }} />
            <div style={{
              fontFamily: T.sans,
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: 3.5,
              textTransform: 'uppercase',
              color: T.ink3,
              whiteSpace: 'nowrap',
            }}>Bitcoin Command Center</div>
            <div style={{ flex: 1, borderTop: `1px solid ${T.rule2}` }} />
          </div>

          <div style={{
            fontFamily: T.serif,
            fontSize: 80,
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: -2.5,
            color: T.ink,
            whiteSpace: 'nowrap',
            paddingBottom: 6,
          }}>
            The Daily Node
          </div>
        </div>

        {/* RIGHT — controls top, data below */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
          {/* Controls — prominent, top position */}
          <div style={{ display: 'flex', gap: 5 }}>
            <button
              onClick={onToggleDark}
              style={{
                ...btnBase,
                background: dark ? T.ink : 'none',
                color: dark ? T.paper : T.ink2,
                border: `1px solid ${dark ? T.ink : T.ink3}`,
              }}
            >
              {dark ? '◑ Light' : '◐ Dark'}
            </button>
            <button
              onClick={onOpenSettings}
              style={{ ...btnBase, background: 'none', color: T.ink2 }}
            >
              ⚙ Settings
            </button>
          </div>
          {/* Data */}
          {blockReward && (
            <div style={metaStyle}>
              Block Reward {blockReward} · Era {rewardEra} of 33
            </div>
          )}
          <div style={{ ...metaStyle, color: T.ink4, fontStyle: 'italic', fontFamily: T.body, fontSize: 9, letterSpacing: 0.3, textTransform: 'none' }}>
            "The Times 03/Jan/2009 Chancellor on brink of second bailout for banks"
          </div>
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${T.rule}`, marginTop: 9 }} />
    </div>
  );
}
