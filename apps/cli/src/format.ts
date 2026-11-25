export function pad(text: string, width: number, align: 'left' | 'right' = 'left'): string {
  return align === 'left' ? text.padEnd(width) : text.padStart(width);
}

export function table(header: readonly string[], rows: readonly (readonly string[])[], alignRight: readonly number[] = []): string[] {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)));
  const render = (cells: readonly string[]): string =>
    cells
      .map((cell, i) => pad(cell, widths[i] ?? cell.length, alignRight.includes(i) ? 'right' : 'left'))
      .join('  ')
      .trimEnd();
  return [render(header), widths.map((w) => '-'.repeat(w)).join('  '), ...rows.map(render)];
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
}

export function formatIso(unixS: number): string {
  return new Date(unixS * 1000).toISOString().replace('.000Z', 'Z');
}

export function timestampForFile(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').replace('T', '-');
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
