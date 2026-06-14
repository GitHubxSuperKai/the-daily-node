// Returns a CSS calc() expression scaling design-px value by the --u viewport unit.
// Usage: u(300) → 'calc(var(--u) * 300)'
//
// WARNING: desktop canvas only. --u is set exclusively by the 1920x1080 desktop
// scaling system. In mobile context --u is unset, so calc(var(--u) * N) resolves
// to an invalid value — padding collapses to 0, font-size falls back to inherited.
// Do NOT use u() in any component that can be mounted outside the desktop canvas
// (e.g. mobile layout components, shared widgets rendered in mobile view).
// Discovered via PR #84: NetworkStatusWidget badge prop used u() for padding/font-size
// in mobile context and rendered broken.
export const u = (n) => `calc(var(--u) * ${n})`;
