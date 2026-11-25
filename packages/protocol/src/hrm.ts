const FLAG_HR_16BIT = 0x01;
const FLAG_ENERGY = 0x08;
const FLAG_RR = 0x10;

export function parseHeartRateMeasurement(data: Uint8Array): { heartRate: number; rrMs: number[] } {
  const flags = data[0];
  if (flags === undefined) return { heartRate: 0, rrMs: [] };
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const wide = (flags & FLAG_HR_16BIT) !== 0;
  const hrSize = wide ? 2 : 1;
  if (data.length < 1 + hrSize) return { heartRate: 0, rrMs: [] };
  const heartRate = wide ? view.getUint16(1, true) : view.getUint8(1);
  const rrMs: number[] = [];
  if ((flags & FLAG_RR) !== 0) {
    let o = 1 + hrSize + ((flags & FLAG_ENERGY) !== 0 ? 2 : 0);
    while (o + 2 <= data.length) {
      rrMs.push(view.getUint16(o, true));
      o += 2;
    }
  }
  return { heartRate, rrMs };
}
