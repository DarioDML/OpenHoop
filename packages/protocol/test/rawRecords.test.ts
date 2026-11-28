import { describe, expect, it } from 'vitest';
import { GYRO_INVALID, decodeFrame, encodeImu, encodeOptical, type OpticalBlockInput, type Packet } from '../src';

function series(n: number, f: (i: number) => number): number[] {
  return Array.from({ length: n }, (_, i) => f(i));
}

function recordOf(packet: Packet): Extract<Packet, { kind: 'record' }> {
  if (packet.kind !== 'record') throw new Error(`expected a record, got ${packet.kind}`);
  return packet;
}

function block(count: number, sourceA: number, driveA: number): OpticalBlockInput {
  return {
    sourceA,
    driveA,
    sourceB: 4,
    driveB: driveA === 0 ? 0 : driveA * 2,
    detectorA: 3,
    rangeA: 32,
    offsetA: 1600,
    detectorB: 4,
    rangeB: 32,
    offsetB: 800,
    slotA: series(count, (i) => 200_000 + i),
    slotB: series(count, (i) => -524_288 + i),
  };
}

describe('live motion record', () => {
  it('encodeImu → decodeFrame round-trips', () => {
    const gyroX = series(100, (i) => (i === 5 ? GYRO_INVALID : i));
    const frame = encodeImu({
      recordIndex: 44_370_175,
      unixS: 1_795_878_769,
      subsec: 21_954,
      packetType: 43,
      rateHz: 100,
      accel: [series(100, () => -263), series(100, () => -679), series(100, () => 4096)],
      gyro: [gyroX, series(100, () => 12), series(100, () => -7)],
    });
    const packet = recordOf(decodeFrame(frame));
    expect(packet.packetType).toBe(43);
    expect(packet.layout).toBe(21);
    expect(packet.subsec).toBe(21_954);
    const record = packet.record;
    if (record.type !== 'imu') throw new Error(record.type);
    expect(record.rateHz).toBe(100);
    expect(record.accel[0]).toHaveLength(100);
    expect(record.gyro[0]).toHaveLength(100);
    expect(record.accel[2][0]).toBe(4096);
    expect(record.gyro[0][5]).toBe(GYRO_INVALID);
  });

  it('imu rateHz falls back to the count when byte 22 is 0', () => {
    const frame = encodeImu({ recordIndex: 1, unixS: 1_795_878_769, rateHz: 0, accel: [[1, 2, 3], [1, 2, 3], [1, 2, 3]], gyro: [[], [], []] });
    const record = recordOf(decodeFrame(frame)).record;
    if (record.type !== 'imu') throw new Error(record.type);
    expect(record.rateHz).toBe(3);
    expect(record.gyro[1]).toEqual([]);
  });
});

describe('live optical record', () => {
  it('encodeOptical → decodeFrame round-trips', () => {
    const frame = encodeOptical({
      recordIndex: 44_370_243,
      unixS: 1_795_878_837,
      subsec: 22_282,
      packetType: 43,
      blocks: [block(25, 1, 2750), block(0, 3, 12_750), block(0, 2, 5300), block(25, 2, 0), block(25, 2, 200)],
    });
    const packet = recordOf(decodeFrame(frame));
    expect(packet.packetType).toBe(43);
    expect(packet.layout).toBe(20);
    const record = packet.record;
    if (record.type !== 'optical') throw new Error(record.type);
    expect(record.rateHz).toBe(25);
    expect(record.blocks).toHaveLength(5);
    expect(record.blocks[3]?.driveA).toBe(0);
    expect(record.blocks[0]?.driveA).toBe(2750);
    expect(record.blocks[0]?.slotA).toHaveLength(25);
    expect(record.blocks[0]?.slotA[24]).toBe(200_024);
    expect(record.blocks[0]?.slotB[0]).toBe(-524_288);
    expect(record.blocks[1]?.count).toBe(0);
  });

  it('rejects a block with more than 50 samples', () => {
    expect(() => encodeOptical({ recordIndex: 1, unixS: 1, blocks: [block(51, 1, 2750)] })).toThrow(RangeError);
  });
});
