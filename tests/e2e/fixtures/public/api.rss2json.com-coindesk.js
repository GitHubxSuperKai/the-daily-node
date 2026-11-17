// Recorded by scripts/verify-refresh-fixtures.cjs from https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fwww.coindesk.com%2Farc%2Foutboundfeeds%2Frss%2F%3FoutputType%3Dxml
// Do not edit by hand: rerun `npm run verify:refresh-fixtures` and review the diff.
module.exports = {
  match: "https://api.rss2json.com/v1/api.json?rss_url=https%3A%2F%2Fwww.coindesk.com%2Farc%2Foutboundfeeds%2Frss%2F%3FoutputType%3Dxml",
  status: 200,
  contentType: "application/json",
  body: JSON.stringify({
    "status": "ok",
    "feed": {
      "url": "https://www.coindesk.com/arc/outboundfeeds/rss/?outputType=xml",
      "title": "CoinDesk: Bitcoin, Ethereum, Crypto News and Price Data",
      "link": "https://www.coindesk.com/",
      "author": "",
      "description": "Leader in cryptocurrency, Bitcoin, Ethereum, XRP, blockchain, DeFi, digital finance and Web 3.0 news with analysis, video and live price updates.",
      "image": "https://img.invalid/placeholder.png"
    },
    "items": [
      {
        "title": "Former Robinhood engineer pleads guilty to insider trading scheme on Hyperliquid",
        "pubDate": "2026-11-16 21:51:04",
        "link": "https://www.coindesk.com/markets/2026/11/16/former-robinhood-engineer-pleads-guilty-to-insider-trading-scheme-on-hyperliquid",
        "guid": "4a43fc8d-d0bd-4112-90a1-18792404df11",
        "thumbnail": "",
        "description": "Huaisong Xiang admitted using confidential crypto listing information to make $125,523 trading perpetual futures on Hyperliquid.",
        "enclosure": {
          "link": "https://img.invalid/placeholder.png",
          "type": "image/*"
        },
        "categories": ["Markets", "Robinhood", "News"]
      },
      {
        "title": "Bitcoin risks falling below $60,000 as Nvidia earnings threaten to deepen crypto sell-off",
        "pubDate": "2026-11-16 20:35:21",
        "link": "https://www.coindesk.com/markets/2026/11/16/bitcoin-risks-falling-below-usd60-000-as-nvidia-earnings-threaten-to-deepen-crypto-sell-off",
        "guid": "7adfcc8d-b1de-4530-82ae-b6d936d06682",
        "thumbnail": "",
        "description": "Rising bond yields, ETF outflows and forced selling are weighing on bitcoin as traders brace for more losses.",
        "enclosure": {
          "link": "https://img.invalid/placeholder.png",
          "type": "image/*"
        },
        "categories": ["Markets", "Bitcoin News", "News"]
      },
      {
        "title": "U.S. Senate Democrats tell CFTC to back off its demand prediction markets defy bans",
        "pubDate": "2026-11-16 18:54:19",
        "link": "https://www.coindesk.com/policy/2026/11/16/u-s-senate-democrats-tell-cftc-to-back-off-its-demand-prediction-markets-defy-bans",
        "guid": "6d280e0f-5f56-4954-ac43-10fe526f463d",
        "thumbnail": "",
        "description": "The Commodity Futures Trading Commission directed platforms such as Kalshi to defy state bans, but the Democrats want it to reverse course, citing court orders.",
        "enclosure": {
          "link": "https://img.invalid/placeholder.png",
          "type": "image/*"
        },
        "categories": ["Policy", "Regulation", "Prediction Markets", "Kalshi", "Polymarket"]
      },
      {
        "title": "Lighter suspends all withdrawals after $10.4 million crypto exploit",
        "pubDate": "2026-11-16 16:41:42",
        "link": "https://www.coindesk.com/tech/2026/11/16/lighter-suspends-all-withdrawals-after-usd10-4-million-crypto-exploit",
        "guid": "f903252b-00f5-4f32-96d2-4ef125520687",
        "thumbnail": "",
        "description": "The decentralized exchange blamed a leaked trading API key and said its smart contracts were unaffected, while investigators traced funds to Hyperliquid.",
        "enclosure": {
          "link": "https://img.invalid/placeholder.png",
          "type": "image/*"
        },
        "categories": ["Tech", "Hack", "Binance", "News"]
      },
      {
        "title": "Brazil's central bank faces backlash over stablecoin money laundering remarks",
        "pubDate": "2026-11-16 15:54:11",
        "link": "https://www.coindesk.com/business/2026/11/16/brazil-s-central-bank-faces-backlash-over-stablecoin-money-laundering-remarks",
        "guid": "128c421c-3ce9-4cbb-b350-d80bdd470984",
        "thumbnail": "",
        "description": "A central bank official reportedly said legitimate funds become tainted when moved into stablecoins, comparing the market to the informal \"dólar-cabo\" system.",
        "enclosure": {
          "link": "https://img.invalid/placeholder.png",
          "type": "image/*"
        },
        "categories": ["Finance", "Brazil", "Stablecoins", "News"]
      }
    ]
  }),
};
