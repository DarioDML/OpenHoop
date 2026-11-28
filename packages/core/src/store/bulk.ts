import type { SqlDriver, SqlValue } from './types';

const MAX_PARAMS_PER_STATEMENT = 8000;

export async function bulkInsert(
  driver: SqlDriver,
  head: string,
  columnCount: number,
  rows: SqlValue[][],
  tail = '',
): Promise<number> {
  const rowsPerStatement = Math.max(1, Math.floor(MAX_PARAMS_PER_STATEMENT / columnCount));
  const placeholder = `(${new Array<string>(columnCount).fill('?').join(', ')})`;
  let changes = 0;
  for (let start = 0; start < rows.length; start += rowsPerStatement) {
    const batch = rows.slice(start, start + rowsPerStatement);
    const params: SqlValue[] = [];
    for (const row of batch) for (const value of row) params.push(value);
    const sql = `${head} VALUES ${new Array<string>(batch.length).fill(placeholder).join(', ')}${tail}`;
    changes += (await driver.run(sql, params)).changes;
  }
  return changes;
}
