export type BleFailure = 'unavailable' | 'off' | 'permission' | 'not-found' | 'connect' | 'bond-refused';

export class BleError extends Error {
  constructor(
    readonly failure: BleFailure,
    detail?: string,
  ) {
    super(detail === undefined ? failure : `${failure}: ${detail}`);
    this.name = 'BleError';
  }
}

export function describeBleRejection(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  return typeof reason === 'string' ? reason : 'unknown error';
}
