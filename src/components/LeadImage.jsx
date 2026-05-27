import React from 'react';
import { useT } from '../theme';
import { u } from '../utils/scale.js';

export function LeadImage({ src, domain }) {
  const T = useT();
  const [errored, setErrored] = React.useState(false);
  if (errored) {
    return (
      <div style={{
        width: '100%',
        height: u(80),
        background: `repeating-linear-gradient(45deg, ${T.rule3} 0, ${T.rule3} 1px, transparent 0, transparent 8px)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 3,
      }}>
        <span style={{ fontFamily: T.mono, fontSize: u(10), color: T.ink4 }}>{domain}</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt=""
      style={{ width: '100%', height: u(160), objectFit: 'cover', borderRadius: 3, display: 'block' }}
      onError={() => setErrored(true)}
    />
  );
}

export default LeadImage;
