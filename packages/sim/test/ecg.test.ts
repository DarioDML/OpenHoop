import { describe, expect, it } from 'vitest';
import { EcgError, Session, recordEcg } from '@openhoop/core';
import { SimBand } from '../src/index';
import type { SimOptions } from '../src/index';

const NOW_S = Date.UTC(2027, 0, 15, 12, 0, 0) / 1000;

async function openBand(extra: Partial<SimOptions> = {}): Promise<{ band: SimBand; session: Session }> {
  const band = new SimBand({ seed: 7, now: () => NOW_S, historyDays: 1 / 24, model: 'MG', ecgIntervalMs: 100, ...extra });
  const [found] = await band.scan(1000);
  if (found === undefined) throw new Error('simulated band not found');
  await band.connect(found.id);
  await band.bond();
  const session = new Session(band);
  await session.open();
  return { band, session };
}

describe('ECG reading on the simulated band', () => {
  it('records the filtered trace and switches every part off again', async () => {
    const { band, session } = await openBand();
    const progress: number[] = [];
    const capture = await recordEcg(session, { wrist: 'left', durationMs: 650, signal: new AbortController().signal, onProgress: (p) => progress.push(p.samples) });
    expect(capture.wrist).toBe('left');
    expect(band.ecgWrist).toBe(2);
    expect(capture.samples.length).toBeGreaterThanOrEqual(400);
    expect(capture.samples.length % 100).toBe(0);
    expect(Math.max(...capture.samples)).toBeGreaterThan(1000);
    expect(progress.length).toBeGreaterThan(3);
    expect(capture.rateHz).toBeCloseTo(1000, -2);
    expect(band.ecgFiltered).toBe(false);
    expect(band.ecgRawSave).toBe(false);
    const sent = band.ecgFramesSent;
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(band.ecgFramesSent).toBe(sent);
    await session.close();
  });

  it('stops early when asked', async () => {
    const { session } = await openBand();
    const abort = new AbortController();
    setTimeout(() => abort.abort(), 350);
    const started = Date.now();
    const capture = await recordEcg(session, { wrist: 'right', durationMs: 10_000, signal: abort.signal });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(capture.samples.length).toBeGreaterThan(0);
    await session.close();
  });

  it('reports a band that refuses the reading and leaves nothing switched on', async () => {
    const { band, session } = await openBand({ ecgUnsupported: true });
    const error = await recordEcg(session, { wrist: 'left', durationMs: 300, signal: new AbortController().signal }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EcgError);
    expect(error).toMatchObject({ reason: 'unsupported' });
    expect(band.ecgFramesSent).toBe(0);
    expect(band.ecgFiltered).toBe(false);
    await session.close();
  });
});
