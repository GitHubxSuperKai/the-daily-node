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
        // item's automatic minimum is its ratio height. The crop is anchored to the
        // top, so a title set across the top of the image survives (an image wider
        // than 3:1 at the 160 floor is cropped at the sides instead). The large
        // shrink factor makes the image give way first; the summary below it only
        // shrinks once the image is down to 160.
        aspectRatio: 'auto 16 / 9',
        flex: '0 1000 auto',
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
