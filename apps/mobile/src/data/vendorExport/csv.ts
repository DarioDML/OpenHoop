export const CSV_LIMITS = { maxRows: 200_000, maxColumns: 200, maxCellChars: 4_000 } as const;

export type CsvResult = { ok: true; rows: string[][] } | { ok: false; reason: 'too-many-rows' | 'too-many-columns' | 'cell-too-long' };

function detectDelimiter(text: string): ',' | ';' {
  let commas = 0;
  let semicolons = 0;
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === '\n' || ch === '\r')) break;
    else if (!quoted && ch === ',') commas++;
    else if (!quoted && ch === ';') semicolons++;
  }
  return semicolons > commas ? ';' : ',';
}

export function parseCsv(input: string): CsvResult {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let cellStarted = false;

  const endCell = (): boolean => {
    row.push(cell);
    cell = '';
    cellStarted = false;
    return row.length <= CSV_LIMITS.maxColumns;
  };

  const endRow = (): CsvResult | null => {
    const blank = row.length === 0 && !cellStarted && cell === '';
    if (!blank) {
      if (cell.length > CSV_LIMITS.maxCellChars) return { ok: false, reason: 'cell-too-long' };
      row.push(cell);
      if (row.length > CSV_LIMITS.maxColumns) return { ok: false, reason: 'too-many-columns' };
      if (!(row.length === 1 && row[0]?.trim() === '')) {
        rows.push(row);
        if (rows.length > CSV_LIMITS.maxRows) return { ok: false, reason: 'too-many-rows' };
      }
    }
    row = [];
    cell = '';
    cellStarted = false;
    return null;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else {
        cell += ch;
        if (cell.length > CSV_LIMITS.maxCellChars) return { ok: false, reason: 'cell-too-long' };
      }
      continue;
    }
    if (ch === '"' && cell === '') {
      quoted = true;
      cellStarted = true;
    } else if (ch === delimiter) {
      cellStarted = true;
      if (!endCell()) return { ok: false, reason: 'too-many-columns' };
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      const failed = endRow();
      if (failed !== null) return failed;
    } else {
      cell += ch;
      cellStarted = true;
      if (cell.length > CSV_LIMITS.maxCellChars) return { ok: false, reason: 'cell-too-long' };
    }
  }
  const failed = endRow();
  if (failed !== null) return failed;
  return { ok: true, rows };
}
