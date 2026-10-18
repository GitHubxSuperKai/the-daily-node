// src/utils/feedXml.js
// Parse a raw RSS 2.0 or Atom document (from the /api/rss proxy) into the same
// shape rss2json returns — { title, items: [{ title, link, pubDate, categories,
// thumbnail, enclosure, description }] } — so useRSS maps both sources with one
// code path. Parsing happens in the browser (DOMParser), never on the server.

// Direct children only: a nested element of the same name (an Atom entry's
// <source><title>, say) must not stand in for the entry's own.
function child(el, localName) {
  for (const c of el.children) if (c.localName === localName) return c;
  return null;
}

function children(el, localName) {
  return Array.from(el.children).filter(c => c.localName === localName);
}

function text(el, localName) {
  const c = child(el, localName);
  return c ? c.textContent.trim() : '';
}

function mediaImage(el) {
  const thumb = child(el, 'thumbnail');
  if (thumb && thumb.getAttribute('url')) return thumb.getAttribute('url');
  for (const c of children(el, 'content')) {
    const type = c.getAttribute('type') || '';
    if (c.getAttribute('url') && (c.getAttribute('medium') === 'image' || type.startsWith('image/'))) {
      return c.getAttribute('url');
    }
  }
  return '';
}

function rssItem(item) {
  const enc = child(item, 'enclosure');
  return {
    title: text(item, 'title'),
    link: text(item, 'link'),
    pubDate: text(item, 'pubDate') || text(item, 'date'),
    categories: children(item, 'category').map(c => c.textContent.trim()).filter(Boolean),
    thumbnail: mediaImage(item),
    enclosure: enc ? { link: enc.getAttribute('url') || '', type: enc.getAttribute('type') || '' } : {},
    description: text(item, 'description') || text(item, 'encoded'),
  };
}

function atomEntry(entry) {
  const links = children(entry, 'link');
  const alt = links.find(l => (l.getAttribute('rel') || 'alternate') === 'alternate') || links[0];
  return {
    title: text(entry, 'title'),
    link: alt ? alt.getAttribute('href') || '' : '',
    pubDate: text(entry, 'published') || text(entry, 'updated'),
    categories: children(entry, 'category').map(c => c.getAttribute('term') || '').filter(Boolean),
    thumbnail: mediaImage(entry),
    enclosure: {},
    description: text(entry, 'summary') || text(entry, 'content'),
  };
}

export function parseFeedXml(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('rss-parse');
  const root = doc.documentElement;
  if (root.localName === 'rss') {
    const channel = child(root, 'channel');
    if (!channel) throw new Error('rss-parse');
    return { title: text(channel, 'title'), items: children(channel, 'item').map(rssItem) };
  }
  if (root.localName === 'feed') {
    return { title: text(root, 'title'), items: children(root, 'entry').map(atomEntry) };
  }
  throw new Error('rss-parse');
}
