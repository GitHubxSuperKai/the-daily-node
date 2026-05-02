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

  const quote = MASTHEAD_QUOTES[new Date().getHours()];

  const metaStyle = {
    fontFamily: T.sans,
    fontSize: u(10),
    fontWeight: 500,
    letterSpacing: u(1.6),
    textTransform: 'uppercase',
    color: T.ink3,
    lineHeight: 1.7,
  };

  const btnBase = {
    cursor: 'pointer',
    fontFamily: T.sans,
    fontSize: u(9),
    fontWeight: 700,
    letterSpacing: u(1.6),
    textTransform: 'uppercase',
    padding: `${u(5)} ${u(12)}`,
    whiteSpace: 'nowrap',
    border: `1px solid ${T.ink3}`,
  };

  return (
    <div style={{ width: '100%', paddingBottom: u(10) }}>
      <div style={{ borderTop: `1px solid ${T.rule}`, marginBottom: u(7) }} />

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        gap: u(24),
      }}>
        {/* LEFT — edition info + rotating quote below */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: u(2) }}>
          <div style={metaStyle}>Home Miner Edition · Vol. XXI, Nº 007</div>
          <div style={{ ...metaStyle, color: T.ink4 }}>Est. 2026 · Printed on the blockchain</div>
          <div style={{ marginTop: u(5), fontFamily: T.body, fontStyle: 'italic', fontSize: u(11), color: T.ink2, lineHeight: 1.4, maxWidth: u(340) }}>
            "{quote.text}"
          </div>
          <div style={{ fontFamily: T.sans, fontSize: u(9), fontWeight: 600, letterSpacing: u(1.4), textTransform: 'uppercase', color: T.ink4, marginTop: u(2) }}>
            — {quote.attr}
          </div>
        </div>

        {/* CENTER — wordmark */}
        <div style={{ textAlign: 'center', padding: `0 ${u(40)}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: u(14), marginBottom: u(5) }}>
            <div style={{ flex: 1, borderTop: `1px solid ${T.rule2}` }} />
            <div style={{
              fontFamily: T.sans,
              fontSize: u(9),
              fontWeight: 600,
              letterSpacing: u(3.5),
              textTransform: 'uppercase',
              color: T.ink3,
              whiteSpace: 'nowrap',
            }}>Bitcoin Command Center</div>
            <div style={{ flex: 1, borderTop: `1px solid ${T.rule2}` }} />
          </div>

          <div style={{
            fontFamily: T.serif,
            fontSize: u(80),
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: u(-2.5),
            color: T.ink,
            whiteSpace: 'nowrap',
            paddingBottom: u(6),
          }}>
            The Daily Node
          </div>
        </div>

        {/* RIGHT — controls top, data below */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: u(5) }}>
          <div style={{ display: 'flex', gap: u(5) }}>
            <button
              onClick={onToggleDark}
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              style={{
                cursor: 'pointer',
                background: 'none',
                border: 'none',
                padding: `${u(5)} ${u(6)}`,
                color: T.ink4,
                fontSize: u(14),
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {dark ? '◑' : '◐'}
            </button>
            <button
              onClick={onOpenSettings}
              style={{ ...btnBase, background: 'none', color: T.ink2 }}
            >
              ⚙ Settings
            </button>
          </div>
          {blockReward && (
            <div style={metaStyle}>
              Block Reward {blockReward} · Era {rewardEra} of 33
            </div>
          )}
          <div style={{ ...metaStyle, color: T.ink4, fontStyle: 'italic', fontFamily: T.body, fontSize: u(9), letterSpacing: u(0.3), textTransform: 'none' }}>
            "The Times 03/Jan/2009 Chancellor on brink of second bailout for banks"
          </div>
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${T.rule}`, marginTop: u(9) }} />
    </div>
  );
}
