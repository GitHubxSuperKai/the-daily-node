import React from 'react';
import { useT } from '../theme';
import Kicker from './Kicker';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const BTC_HISTORY = [
  { mo:1,  d:3,  y:2009, t:'Satoshi mines the Genesis Block (block 0), embedding "The Times 03/Jan/2009 Chancellor on brink of second bailout for banks."' },
  { mo:1,  d:9,  y:2009, t:'Bitcoin v0.1 released and the network goes live. Satoshi sends 10 BTC to Hal Finney in the first transaction (block 170).' },
  { mo:2,  d:6,  y:2010, t:'First Bitcoin exchange (Bitcoin Market) established, enabling BTC/USD trades.' },
  { mo:2,  d:28, y:2014, t:'Mt. Gox files for bankruptcy, disclosing 850,000 BTC missing.' },
  { mo:3,  d:6,  y:2014, t:'Newsweek claims Dorian Nakamoto is Satoshi. He denies it. Satoshi posts "I am not Dorian Nakamoto."' },
  { mo:4,  d:1,  y:2013, t:'Bitcoin surpasses $100 for the first time, driven by the Cyprus banking crisis and safe-haven demand.' },
  { mo:4,  d:19, y:2024, t:'Fourth halving at block 840,000. Block reward drops from 6.25 to 3.125 BTC.' },
  { mo:5,  d:22, y:2010, t:'Laszlo Hanyecz makes the first commercial Bitcoin transaction — 10,000 BTC for two pizzas.' },
  { mo:6,  d:12, y:2022, t:'Celsius Network halts all withdrawals amid crypto contagion, triggering a wave of lender insolvencies.' },
  { mo:6,  d:15, y:2021, t:'El Salvador Congress passes Bitcoin Legal Tender Law, making it the first country to adopt BTC as official currency.' },
  { mo:7,  d:9,  y:2016, t:'Third halving at block 420,000. Reward drops from 25 to 12.5 BTC.' },
  { mo:8,  d:1,  y:2017, t:'Bitcoin Cash hard fork at block 478,558.' },
  { mo:8,  d:23, y:2017, t:'SegWit activates on mainnet, clearing the path for the Lightning Network.' },
  { mo:9,  d:7,  y:2021, t:'El Salvador becomes the first country to adopt Bitcoin as legal tender.' },
  { mo:10, d:5,  y:2009, t:'New Liberty Standard publishes the first BTC exchange rate: 1,309.03 BTC = $1.' },
  { mo:10, d:31, y:2008, t:'Satoshi Nakamoto publishes the Bitcoin whitepaper to the Cryptography Mailing List.' },
  { mo:11, d:10, y:2021, t:'Bitcoin hits all-time high of $69,044 on Coinbase.' },
  { mo:11, d:11, y:2022, t:'FTX files for Chapter 11 bankruptcy. SBF resigns as CEO.' },
  { mo:11, d:28, y:2012, t:'First halving at block 210,000. Block reward drops from 50 to 25 BTC.' },
  { mo:12, d:17, y:2017, t:'Bitcoin reaches then-ATH of $19,783 on Coinbase. Futures launch on CME two days later.' },
  { mo:1,  d:11, y:2024, t:'SEC approves 11 spot Bitcoin ETFs. BlackRock iShares Bitcoin Trust begins trading.' },
  { mo:3,  d:14, y:2024, t:'Bitcoin hits new all-time high of $73,738 ahead of the halving.' },
  { mo:6,  d:9,  y:2023, t:'BlackRock files for spot Bitcoin ETF, sparking institutional wave.' },
  { mo:7,  d:16, y:2010, t:'Mt. Gox opens. Bitcoin price jumps from $0.008 to $0.08 in five days.' },
  { mo:9,  d:13, y:2012, t:'BitPay announces it has signed up 1,000 merchants to accept Bitcoin.' },
  { mo:2,  d:9,  y:2011, t:'Bitcoin reaches parity with the US dollar for the first time.' },
];

function getOnThisDay(date) {
  const mo = date.getMonth() + 1;
  const d  = date.getDate();
  let best = null, bestDist = Infinity;
  for (const e of BTC_HISTORY) {
    const eDoy = e.mo * 31 + e.d;
    const tDoy = mo * 31 + d;
    const dist = Math.min(Math.abs(eDoy - tDoy), 31 * 12 - Math.abs(eDoy - tDoy));
    if (dist < bestDist) { bestDist = dist; best = e; }
  }
  return best;
}

export function OnThisDay() {
  const T = useT();
  const entry = getOnThisDay(new Date());
  if (!entry) return null;

  return (
    <div>
      <Kicker>On This Day</Kicker>
      <div style={{ marginTop: 7 }}>
        <div style={{
          fontFamily: T.sans,
          fontSize: u(9),
          fontWeight: 600,
          letterSpacing: u(2),
          textTransform: 'uppercase',
          color: T.orange,
          marginBottom: u(4),
        }}>
          {MONTHS[entry.mo - 1]} {entry.d}, {entry.y}
        </div>
        <div style={{
          fontFamily: T.body,
          fontSize: u(13),
          lineHeight: 1.5,
          color: T.ink2,
        }}>
          {entry.t}
        </div>
      </div>
    </div>
  );
}

export default OnThisDay;
