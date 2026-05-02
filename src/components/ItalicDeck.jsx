import React from 'react';

// Import useT hook from theme context (available in build context)

function ItalicDeck({ children, style = {} }) {
  const T = useT();
  return <div style={{ fontFamily: T.body, fontStyle: 'italic', fontSize: u(18), lineHeight: 1.45, color: T.ink2, ...style }}>{children}</div>;
}

export default ItalicDeck;
