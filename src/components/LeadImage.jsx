import React from 'react';
import { u } from '../utils/scale.js';

// The lead only ever holds a story with an image (see utils/newsSelect.js). If the
// image fails to load, onError lets useRSS hand the slot to the next qualifying story.
export function LeadImage({ src, onError }) {
  return (
    <img
      src={src}
      alt=""
      style={{ width: '100%', height: u(160), objectFit: 'cover', borderRadius: 3, display: 'block' }}
      onError={onError}
    />
  );
}

export default LeadImage;
