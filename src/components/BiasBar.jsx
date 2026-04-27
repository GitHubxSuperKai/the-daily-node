import { useT } from '../theme';

export function BiasBar({ left, center, right, total }) {
  const T = useT();
  const tot = left + center + right || 1;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: T.mono, fontSize: 10, color: T.ink3, marginBottom: 4 }}>
        <span>{total} sources</span><span>L {left} · C {center} · R {right}</span>
      </div>
      <div style={{ display: 'flex', height: 4, background: T.rule3 }}>
        <div style={{ width: `${(left / tot) * 100}%`, background: T.ink }} />
        <div style={{ width: `${(center / tot) * 100}%`, background: T.ink3 }} />
        <div style={{ width: `${(right / tot) * 100}%`, background: T.ink }} />
      </div>
    </div>
  );
}
