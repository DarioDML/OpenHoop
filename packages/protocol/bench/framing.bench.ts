import { test } from 'vitest';
import golden from '../test/golden.json';
import { crc16Modbus, crc32, decodeFrame, fromHex, wrapFrame } from '../src/index';

function frame(name: string): Uint8Array {
  const v = golden.find((g) => g.name === name);
  if (v === undefined) throw new Error(`missing golden vector ${name}`);
  return fromHex(v.hex);
}

const biometric = frame('synthetic_r18');
const ecg = frame('synthetic_ecg_r16');
const optical = wrapFrame(Uint8Array.from({ length: 2_132 }, (_, i) => (i * 31 + 7) & 0xff));

const RUN = { time: 1_500, warmupTime: 300 };

test('crc', async ({ bench }) => {
  await bench.compare(
    bench('crc32, 124 B', () => {
      crc32(biometric);
    }),
    bench('crc32, 2,140 B', () => {
      crc32(optical);
    }),
    bench('crc16Modbus, 2,140 B', () => {
      crc16Modbus(optical);
    }),
    RUN,
  );
});

test('decodeFrame', async ({ bench }) => {
  await bench.compare(
    bench('decodeFrame, 124 B biometric', () => {
      decodeFrame(biometric);
    }),
    bench('decodeFrame, 1,584 B ecg', () => {
      decodeFrame(ecg);
    }),
    bench('decodeFrame, 2,140 B optical', () => {
      decodeFrame(optical);
    }),
    RUN,
  );
});
