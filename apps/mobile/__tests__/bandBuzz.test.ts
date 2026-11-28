import { buzzIfConnected, type BuzzGate } from '@/data/bandBuzz';

function gate(state: { connected: boolean; syncing: boolean; fails?: boolean }): BuzzGate & { buzzes: number; ran: number } {
  const result = {
    buzzes: 0,
    ran: 0,
    connected: () => state.connected,
    syncing: () => state.syncing,
    exclusive: async <T>(task: () => Promise<T>): Promise<T> => {
      result.ran += 1;
      return task();
    },
    buzz: async (): Promise<void> => {
      if (state.fails === true) throw new Error('lost');
      result.buzzes += 1;
    },
  };
  return result;
}

describe('buzz only on a live connection', () => {
  it('buzzes a connected band that is not syncing', async () => {
    const connected = gate({ connected: true, syncing: false });
    expect(await buzzIfConnected(connected)).toBe(true);
    expect(connected.buzzes).toBe(1);
  });

  it('never connects, queues or buzzes when the band is not connected', async () => {
    const off = gate({ connected: false, syncing: false });
    expect(await buzzIfConnected(off)).toBe(false);
    expect(off.ran).toBe(0);
    expect(off.buzzes).toBe(0);
  });

  it('stays quiet during a sync', async () => {
    const syncing = gate({ connected: true, syncing: true });
    expect(await buzzIfConnected(syncing)).toBe(false);
    expect(syncing.ran).toBe(0);
  });

  it('checks again once its turn comes and drops a lost connection without an error', async () => {
    const state = { connected: true, syncing: false };
    const late = gate(state);
    const exclusive = late.exclusive;
    late.exclusive = async <T>(task: () => Promise<T>): Promise<T> => {
      state.syncing = true;
      return exclusive(task);
    };
    expect(await buzzIfConnected(late)).toBe(false);
    expect(late.buzzes).toBe(0);
    expect(await buzzIfConnected(gate({ connected: true, syncing: false, fails: true }))).toBe(false);
  });
});
