// Synthetic /api/rss?feed=coindesk. Same shape and rules as rss-bitcoinMagazine.js:
// invented stories, every headline names Bitcoin, fixed past dates.
const items = [
  ['Synthetic Desk: Bitcoin futures volume climbs for a third week', 'Sun, 15 Nov 2026 21:00:00 GMT'],
  ['Synthetic Desk: Bitcoin miners report steady hashprice', 'Sun, 15 Nov 2026 14:00:00 GMT'],
  ['Synthetic Desk: What the next Bitcoin difficulty change means', 'Sat, 14 Nov 2026 10:00:00 GMT'],
];

const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>CoinDesk</title>
    <link>https://example.com/coindesk</link>
    <description>Synthetic feed for the verify fixtures.</description>
${items.map(([title, pubDate], i) => `    <item>
      <title>${title}</title>
      <link>https://example.com/coindesk/story-${i + 1}</link>
      <pubDate>${pubDate}</pubDate>
      <category>Markets</category>
      <media:thumbnail url="https://img.invalid/placeholder.png"/>
      <description>Synthetic story ${i + 1} for the verify fixtures. It is long enough to serve as a lead snippet and says nothing real.</description>
    </item>`).join('\n')}
  </channel>
</rss>
`;

module.exports = {
  match: '**/api/rss?feed=coindesk',
  status: 200,
  contentType: 'text/plain; charset=utf-8',
  body,
};
