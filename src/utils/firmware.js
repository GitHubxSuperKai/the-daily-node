// ESP-Miner firmware version helpers.
//
// AxeOS reports `version` from /api/system/info (e.g. "v2.15.3", a git-describe
// "v2.15.0-12-gabcdef", or the literal "Unknown" fallback). Only the numeric
// major.minor.patch core is compared; any suffix is ignored.

const CORE = /^v?(\d+)\.(\d+)\.(\d+)(?![\d.])/;

/** [major, minor, patch] for a version string, or null when it can't be parsed. */
export function parseFirmwareVersion(value) {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(CORE);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/**
 * True only when both versions parse and the miner's core is strictly older than
 * the latest release. Equal cores (an rc of the latest, a dev build past it),
 * newer cores, and anything unparseable all return false, so no badge is shown.
 */
export function isFirmwareOutdated(current, latest) {
  const a = parseFirmwareVersion(current);
  const b = parseFirmwareVersion(latest);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}
