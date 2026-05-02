// Returns a CSS calc() expression scaling design-px value by the --u viewport unit.
// Usage: u(300) → 'calc(var(--u) * 300)'
export const u = (n) => `calc(var(--u) * ${n})`;
