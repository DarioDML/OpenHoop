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

export type ConsolePiece = Pick<ConsoleFragment, 't' | 'sequence' | 'text'>;

export interface ConsoleSpan<T extends ConsolePiece> extends ConsoleLine {
  startSeen: boolean;
  end: 'newline' | 'gap' | 'open';
  fragments: T[];
}

const GAP_MARK = ' …';

export function consoleSpans<T extends ConsolePiece>(ordered: readonly T[]): ConsoleSpan<T>[] {
  const spans: ConsoleSpan<T>[] = [];
  let text = '';
  let startT = 0;
  let startSeen = false;
  let afterNewline = false;
  let fragments: T[] = [];
  let previous: number | null = null;

  const contribute = (fragment: T): void => {
    if (fragments[fragments.length - 1] !== fragment) fragments.push(fragment);
  };
  const flush = (end: ConsoleSpan<T>['end']): void => {
    const trimmed = text.trim();
    if (trimmed.length > 0) spans.push({ t: startT, text: trimmed, startSeen, end, fragments });
    text = '';
    fragments = [];
  };

  for (const fragment of ordered) {
    if (previous !== null && fragment.sequence !== (previous + 1) % 256) {
      flush('gap');
      afterNewline = false;
    }
    previous = fragment.sequence;
    fragment.text.split('\n').forEach((part, index) => {
      if (index > 0) {
        if (text.length > 0) contribute(fragment);
        flush('newline');
        afterNewline = true;
      }
      if (part.trim().length === 0 && text.length === 0) return;
      if (text.length === 0) {
        startT = fragment.t;
        startSeen = afterNewline;
      }
      text += part;
      contribute(fragment);
    });
  }
  flush('open');
  return spans;
}

export function joinConsoleFragments(fragments: readonly ConsoleFragment[]): ConsoleLine[] {
  const ordered = [...fragments].sort((a, b) => a.id - b.id);
  return consoleSpans(ordered).map((span) => ({ t: span.t, text: span.end === 'gap' ? `${span.text}${GAP_MARK}` : span.text }));
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
