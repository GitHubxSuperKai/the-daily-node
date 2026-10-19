import { describe, it, expect, vi } from 'vitest';
import { parseFeedXml, htmlToText } from '../../src/utils/feedXml.js';

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Stub RSS</title>
    <item>
      <title><![CDATA[Block 900,000 & beyond]]></title>
      <link>https://example.com/a</link>
      <pubDate>Sat, 17 Oct 2026 12:00:00 GMT</pubDate>
      <category>Mining</category>
      <category>Bitcoin</category>
      <media:thumbnail url="https://example.com/a-thumb.jpg"/>
      <description><![CDATA[<p>Lead <b>snippet</b></p>]]></description>
    </item>
    <item>
      <title>Enclosure only</title>
      <link>https://example.com/b</link>
      <pubDate>Fri, 16 Oct 2026 12:00:00 GMT</pubDate>
      <enclosure url="https://example.com/b.png" type="image/png" length="1"/>
      <content:encoded><![CDATA[<p>Full body</p>]]></content:encoded>
    </item>
    <item>
      <title>Media content image</title>
      <media:content url="https://example.com/c.jpg" medium="image"/>
    </item>
  </channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Stub Atom</title>
  <entry>
    <title>Newsletter #400</title>
    <link rel="self" href="https://example.com/self"/>
    <link rel="alternate" href="https://example.com/n400"/>
    <updated>2026-10-16T00:00:00Z</updated>
    <published>2026-10-15T00:00:00Z</published>
    <category term="newsletter"/>
    <summary>Weekly summary</summary>
    <source><title>Not the entry title</title></source>
  </entry>
  <entry>
    <title>Updated only</title>
    <link href="https://example.com/u"/>
    <updated>2026-10-14T00:00:00Z</updated>
    <content type="html">&lt;p&gt;Body&lt;/p&gt;</content>
  </entry>
</feed>`;

describe('parseFeedXml — RSS 2.0', () => {
  const feed = parseFeedXml(RSS);

  it('reads the channel title and every item', () => {
    expect(feed.title).toBe('Stub RSS');
    expect(feed.items.map(i => i.title)).toEqual(['Block 900,000 & beyond', 'Enclosure only', 'Media content image']);
  });

  it('maps the fields useRSS consumes', () => {
    expect(feed.items[0]).toEqual({
      title: 'Block 900,000 & beyond',
      link: 'https://example.com/a',
      pubDate: 'Sat, 17 Oct 2026 12:00:00 GMT',
      categories: ['Mining', 'Bitcoin'],
      thumbnail: 'https://example.com/a-thumb.jpg',
      enclosure: {},
      description: '<p>Lead <b>snippet</b></p>',
    });
  });

  it('keeps an image enclosure and falls back to content:encoded', () => {
    expect(feed.items[1].enclosure).toEqual({ link: 'https://example.com/b.png', type: 'image/png' });
    expect(feed.items[1].description).toBe('<p>Full body</p>');
    expect(feed.items[1].thumbnail).toBe('');
  });

  it('takes a media:content image as the thumbnail', () => {
    expect(feed.items[2].thumbnail).toBe('https://example.com/c.jpg');
  });
});

describe('parseFeedXml — Atom', () => {
  const feed = parseFeedXml(ATOM);

  it('uses the alternate link, published date and own title', () => {
    expect(feed.title).toBe('Stub Atom');
    const [e] = feed.items;
    expect(e.title).toBe('Newsletter #400');
    expect(e.link).toBe('https://example.com/n400');
    expect(e.pubDate).toBe('2026-10-15T00:00:00Z');
    expect(e.categories).toEqual(['newsletter']);
    expect(e.description).toBe('Weekly summary');
  });

  it('falls back to a rel-less link, updated, and content', () => {
    const e = feed.items[1];
    expect(e.link).toBe('https://example.com/u');
    expect(e.pubDate).toBe('2026-10-14T00:00:00Z');
    expect(e.description).toBe('<p>Body</p>');
  });
});

describe('parseFeedXml — rejects what is not a feed', () => {
  it.each([
    ['malformed XML', '<rss><channel><item></rss>'],
    ['an HTML error page', '<html><body>Just a moment...</body></html>'],
    ['RSS without a channel', '<rss version="2.0"></rss>'],
    ['an empty body', ''],
  ])('%s throws', (_, xml) => {
    expect(() => parseFeedXml(xml)).toThrow();
  });
});

describe('htmlToText', () => {
  it('strips markup and decodes entities', () => {
    expect(htmlToText('<p>Bitcoin &amp; <b>Lightning</b> &lt;3</p>')).toBe('Bitcoin & Lightning <3');
  });
  it('leaves no tag fragment behind', () => {
    // The old /<[^>]+>/ pass left an unclosed tag intact (CodeQL alert 203).
    expect(htmlToText('Read more <script src=x')).not.toMatch(/<script/i);
  });
  it('parses in an inert DOMParser document, never the live one', () => {
    // jsdom runs neither payload even in the live document, so a behavioural check
    // cannot tell this apart from `div.innerHTML = html`, which in a real browser
    // fetches <img src> and fires onerror. Pin the mechanism instead.
    const parse = vi.spyOn(DOMParser.prototype, 'parseFromString');
    const create = vi.spyOn(document, 'createElement');
    try {
      expect(htmlToText('<img src="x" onerror="alert(1)">hi')).toBe('hi');
      expect(parse).toHaveBeenCalledWith(expect.any(String), 'text/html');
      expect(create).not.toHaveBeenCalled();
    } finally {
      parse.mockRestore();
      create.mockRestore();
    }
  });
  it('collapses whitespace and handles empty input', () => {
    expect(htmlToText('<p>one</p>\n\n<p>two</p>')).toBe('one two');
    expect(htmlToText('')).toBe('');
    expect(htmlToText(undefined)).toBe('');
  });
});
