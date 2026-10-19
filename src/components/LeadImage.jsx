import React from 'react';
import { u } from '../utils/scale.js';

// The lead only ever holds a story with an image (see utils/newsSelect.js). If the
// image fails to load, onError lets useRSS hand the slot to the next qualifying story.
export function LeadImage({ src, onError }) {
  return (
    <img
      src={src}
      alt=""
      style={{
        width: '100%',
        height: 'auto',
        // The image's own ratio once loaded (16/9 reserves the box before then). It
        // grows to the full image when the headline leaves room and shrinks toward
        // 160 when it doesn't; minHeight is what lets it shrink at all, since a flex
        // item's automatic minimum is its ratio height. Any crop then falls on the
        // bottom edge, never on a title set across the top of the image.
        aspectRatio: 'auto 16 / 9',
        flex: '0 1 auto',
        minHeight: u(160),
        maxHeight: u(270),
        objectFit: 'cover',
        objectPosition: 'top',
        borderRadius: 3,
        display: 'block',
      }}
      onError={onError}
    />
  );
}

export default LeadImage;
