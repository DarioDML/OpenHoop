export type StorageProblem = { kind: 'tooNew'; found: number; supported: number } | { kind: 'unavailable' };

function isTooNew(error: unknown): error is Error & { found: number; supported: number } {
  return (
    error instanceof Error &&
    error.name === 'DatabaseTooNewError' &&
    'found' in error &&
    typeof error.found === 'number' &&
    'supported' in error &&
    typeof error.supported === 'number'
  );
}

export function storageProblemOf(error: unknown): StorageProblem {
  return isTooNew(error) ? { kind: 'tooNew', found: error.found, supported: error.supported } : { kind: 'unavailable' };
}
