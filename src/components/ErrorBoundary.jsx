import React from 'react';
import { ThemeCtx } from '../theme';
import { log } from '../utils/log.js';

/**
 * ErrorBoundary — isolates render failures to a single subtree.
 *
 * A throw in any wrapped child (e.g. a data hook handing a component a
 * malformed shape) renders a small inline fallback instead of unmounting
 * the whole React tree. Class component because React exposes error
 * boundaries only via getDerivedStateFromError / componentDidCatch — no
 * hook equivalent. Theme is read through legacy contextType since hooks
 * are unavailable here.
 */
export class ErrorBoundary extends React.Component {
  static contextType = ThemeCtx;

  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    const tag = this.props.label ? `[ErrorBoundary · ${this.props.label}]` : '[ErrorBoundary]';
    log.error(tag, error, info && info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const T = this.context || {};
    return (
      <div
        style={{
          padding: 14,
          border: `1px solid ${T.rule2 || '#ccc'}`,
          borderRadius: 3,
          background: T.paper || 'transparent',
          fontFamily: T.mono || 'monospace',
          fontSize: 12,
          lineHeight: 1.4,
          color: T.ink3 || '#888',
        }}
      >
        {this.props.label ? `${this.props.label} unavailable` : 'Section unavailable'}
      </div>
    );
  }
}
