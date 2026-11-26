import type { SqlValue, Store } from './store/types';

export interface ConsoleFragment {
  id: number;
  t: number;
  sequence: number;
  text: string;
}

export interface ConsoleLine {
  t: number;
  text: string;
}

const GAP_MARK = ' …';

export function joinConsoleFragments(fragments: readonly ConsoleFragment[]): ConsoleLine[] {
  const ordered = [...fragments].sort((a, b) => a.id - b.id);
  const lines: ConsoleLine[] = [];
  let text = '';
  let startT = 0;
  let previous: number | null = null;

  const flush = (suffix: string): void => {
    const trimmed = text.trim();
    if (trimmed.length > 0) lines.push({ t: startT, text: `${trimmed}${suffix}` });
    text = '';
  };

  for (const fragment of ordered) {
    if (previous !== null && fragment.sequence !== (previous + 1) % 256) flush(GAP_MARK);
    previous = fragment.sequence;
    fragment.text.split('\n').forEach((part, index) => {
      if (index > 0) flush('');
      if (part.trim().length === 0 && text.length === 0) return;
      if (text.length === 0) startT = fragment.t;
      text += part;
    });
  }
  flush('');
  return lines;
}

function isFragment(row: Record<string, SqlValue>): row is Record<string, SqlValue> & ConsoleFragment {
  return (
    typeof row['id'] === 'number' &&
    typeof row['t'] === 'number' &&
    typeof row['sequence'] === 'number' &&
    typeof row['text'] === 'string'
  );
}

export async function consoleLines(store: Store, deviceId: number): Promise<ConsoleLine[]> {
  const rows = await store.driver.all<Record<string, SqlValue>>(
    'SELECT id, t, sequence, text FROM console_log WHERE device_id = ? ORDER BY id',
    [deviceId],
  );
  return joinConsoleFragments(rows.filter(isFragment));
}
