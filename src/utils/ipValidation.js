export function isValidLanIp(ip) {
  if (typeof ip !== 'string') return false;
  const m = ip.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const o = m.slice(1).map(Number);
  if (o.some(n => n < 0 || n > 255)) return false;
  // Private: 10/8, 172.16/12, 192.168/16. Loopback: 127/8.
  if (o[0] === 10) return true;
  if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true;
  if (o[0] === 192 && o[1] === 168) return true;
  if (o[0] === 127) return true;
  return false;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { isValidLanIp };
}
