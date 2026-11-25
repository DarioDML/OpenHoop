import type { Packet } from '@stoop/protocol';
import type { SampleRow } from './store/types';

export function sampleFromPacket(deviceId: number, packet: Packet, chunkId: number | null = null): SampleRow | null {
  if (packet.kind !== 'record' || packet.record.type !== 'biometric') return null;
  const record = packet.record;
  return {
    deviceId,
    t: packet.unixS,
    source: packet.packetType === 47 ? 'history' : 'live',
    hr: record.heartRate > 0 ? record.heartRate : null,
    rr: record.rrMs,
    steps: record.stepCounter,
    skinTempC: record.skinTempC,
    spo2Raw: record.spo2Byte82,
    state: record.bandState,
    motionG: record.dynamicAccelG,
    chunkId,
  };
}
