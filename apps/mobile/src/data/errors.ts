import { CommandFailedError, CommandTimeoutError, DisconnectedError, OwnerSinceRequiredError } from '@stoop/core';

import { BleError } from '@/ble/errors';
import type { TranslationKey, TranslationParams } from '@/i18n';

export class AppError extends Error {
  constructor(
    readonly key: TranslationKey,
    readonly params?: TranslationParams,
    options?: { cause?: unknown },
  ) {
    super(key, options);
    this.name = 'AppError';
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof BleError) {
    switch (error.failure) {
      case 'unavailable':
        return new AppError('error.bluetoothUnavailable');
      case 'off':
        return new AppError('error.bluetoothOff');
      case 'permission':
        return new AppError('error.bluetoothPermission');
      case 'not-found':
        return new AppError('error.bandNotFound');
      case 'bond-refused':
        return new AppError('error.bondRefused');
      case 'connect':
        return new AppError('error.connectFailed');
    }
  }
  if (error instanceof OwnerSinceRequiredError) return new AppError('error.ownerSinceMissing');
  if (error instanceof DisconnectedError) return new AppError('error.disconnected');
  if (error instanceof CommandTimeoutError) return new AppError('error.timeout');
  if (error instanceof CommandFailedError) return new AppError('error.commandFailed');
  return new AppError('error.unknown', undefined, { cause: error });
}
