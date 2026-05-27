import React from 'react';
import { useT } from '../../theme';
import { TweaksSection, TweaksRow, TweaksNumInput, TweaksCheckRow } from './helpers';

export function AlertsSection({ v2get, setV2Path }) {
  const T = useT();
  return (
    <>
      <div style={{ fontSize: 11, color: T.ink3, marginBottom: 6 }}>
        Browser permission required.{' '}
        <button
          onClick={() => typeof Notification !== 'undefined' && Notification.requestPermission()}
          style={{ background: 'transparent', color: T.orange, border: 'none', cursor: 'pointer', fontSize: 11, padding: 0 }}
        >Grant</button>
      </div>

      <TweaksSection T={T}>
        <TweaksCheckRow path="alerts.fee.enabled" label="Fee spike" get={v2get} setPath={setV2Path} />
        <TweaksRow label="Threshold (sat/vB)" T={T}><TweaksNumInput path="alerts.fee.threshold" min={1} max={500} get={v2get} setPath={setV2Path} T={T} /></TweaksRow>
        <TweaksRow label="Cooldown (min)" T={T}><TweaksNumInput path="alerts.fee.cooldownMin" min={5} max={1440} get={v2get} setPath={setV2Path} T={T} /></TweaksRow>
      </TweaksSection>

      <TweaksSection T={T}>
        <TweaksCheckRow path="alerts.blockTime.enabled" label="Block time drift (&gt; 15 min without a block)" get={v2get} setPath={setV2Path} />
        <TweaksRow label="Cooldown (min)" T={T}><TweaksNumInput path="alerts.blockTime.cooldownMin" min={5} max={1440} get={v2get} setPath={setV2Path} T={T} /></TweaksRow>
      </TweaksSection>

      <TweaksSection T={T}>
        <TweaksCheckRow path="alerts.minerOffline.enabled" label="Miner offline" get={v2get} setPath={setV2Path} />
        <TweaksRow label="Cooldown (min)" T={T}><TweaksNumInput path="alerts.minerOffline.cooldownMin" min={1} max={1440} get={v2get} setPath={setV2Path} T={T} /></TweaksRow>
      </TweaksSection>

      <TweaksSection T={T}>
        <TweaksCheckRow path="alerts.price.enabled" label="Price move (requires history sidecar)" get={v2get} setPath={setV2Path} />
        <TweaksRow label="% move" T={T}><TweaksNumInput path="alerts.price.pctThreshold" min={1} max={50} get={v2get} setPath={setV2Path} T={T} /></TweaksRow>
        <TweaksRow label="Window (min)" T={T}><TweaksNumInput path="alerts.price.windowMin" min={5} max={240} get={v2get} setPath={setV2Path} T={T} /></TweaksRow>
        <TweaksRow label="Cooldown (min)" T={T}><TweaksNumInput path="alerts.price.cooldownMin" min={5} max={1440} get={v2get} setPath={setV2Path} T={T} /></TweaksRow>
      </TweaksSection>
    </>
  );
}
