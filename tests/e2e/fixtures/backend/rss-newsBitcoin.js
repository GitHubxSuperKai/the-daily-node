// Synthetic /api/rss?feed=newsBitcoin. Same shape and rules as rss-bitcoinMagazine.js:
// invented stories, every headline names Bitcoin, fixed past dates.
const items = [
  ['Synthetic News: Bitcoin Lightning capacity grows again', 'Sun, 15 Nov 2026 20:00:00 GMT'],
  ['Synthetic News: Bitcoin ATM operators expand in new markets', 'Sun, 15 Nov 2026 12:00:00 GMT'],
  ['Synthetic News: Bitcoin conference schedule announced', 'Sat, 14 Nov 2026 08:00:00 GMT'],
];

const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>News.Bitcoin.com</title>
    <link>https://example.com/news-bitcoin</link>
    <description>Synthetic feed for the verify fixtures.</description>
${items.map(([title, pubDate], i) => `    <item>
      <title>${title}</title>
      <link>https://example.com/news-bitcoin/story-${i + 1}</link>
      <pubDate>${pubDate}</pubDate>
      <category>News</category>
      <media:thumbnail url="https://img.invalid/placeholder.png"/>
      <description>Synthetic story ${i + 1} for the verify fixtures. It is long enough to serve as a lead snippet and says nothing real.</description>
    </item>`).join('\n')}
  </channel>
</rss>
`;

module.exports = {
  match: '**/api/rss?feed=newsBitcoin',
  status: 200,
  contentType: 'text/plain; charset=utf-8',
  body,
};
