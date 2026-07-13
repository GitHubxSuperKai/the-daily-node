// Returns a CSS calc() expression scaling design-px value by the --u viewport unit.
// Usage: u(300) → 'calc(var(--u) * 300)'
//
// WARNING: desktop canvas only. --u defaults to 1px in :root (index.html) and is
// only rescaled by the 1920x1080 desktop scaling system. In mobile context --u
// stays at its 1px default, so calc(var(--u) * N) is valid CSS but renders
// unscaled 1:1 — not the intended design-px value.
// Do NOT use u() in any component that can be mounted outside the desktop canvas
// (e.g. mobile layout components, shared widgets rendered in mobile view).
// Discovered via PR #84: NetworkStatusWidget badge prop used u() for padding/font-size
// in mobile context and rendered unscaled.
export const u = (n) => `calc(var(--u) * ${n})`;
