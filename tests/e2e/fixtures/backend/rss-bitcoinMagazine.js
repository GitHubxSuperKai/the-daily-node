// Synthetic /api/rss?feed=bitcoinMagazine. bitaxe_api.py passes the feed's raw RSS
// through as text/plain and the browser parses it (src/utils/feedXml.js). Invented
// stories, no third-party article text. Every headline names Bitcoin so the relevance
// filter (src/utils/newsSelect.js) keeps it, and each feed has its own headlines so a
// flow can tell feeds apart. Dates are fixed and before the first recording: they stay
// in the past when recorded-at.json moves forward.
const items = [
  ['Synthetic Magazine: Bitcoin node count reaches a new high', 'Sun, 15 Nov 2026 22:00:00 GMT'],
  ['Synthetic Magazine: Bitcoin developers publish a fee report', 'Sun, 15 Nov 2026 16:00:00 GMT'],
  ['Synthetic Magazine: A beginner guide to Bitcoin self-custody', 'Sat, 14 Nov 2026 12:00:00 GMT'],
];

const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Bitcoin Magazine</title>
    <link>https://example.com/bitcoin-magazine</link>
    <description>Synthetic feed for the verify fixtures.</description>
${items.map(([title, pubDate], i) => `    <item>
      <title>${title}</title>
      <link>https://example.com/bitcoin-magazine/story-${i + 1}</link>
      <pubDate>${pubDate}</pubDate>
      <category>Bitcoin</category>
      <media:thumbnail url="https://img.invalid/placeholder.png"/>
      <description>Synthetic story ${i + 1} for the verify fixtures. It is long enough to serve as a lead snippet and says nothing real.</description>
    </item>`).join('\n')}
  </channel>
</rss>
`;

module.exports = {
  match: '**/api/rss?feed=bitcoinMagazine',
  status: 200,
  contentType: 'text/plain; charset=utf-8',
  body,
};
