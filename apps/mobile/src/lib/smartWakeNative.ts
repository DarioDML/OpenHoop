import { requireOptionalNativeModule } from 'expo';

interface SmartWakeModule {
  canScheduleExact(): boolean;
  schedule(atMs: number, title: string, text: string): boolean;
  cancel(): void;
}

export interface SmartWakeScheduler {
  available(): boolean;
  schedule(atS: number, title: string, text: string): boolean;
  cancel(): void;
}

const native = requireOptionalNativeModule<SmartWakeModule>('SmartWake');

export const smartWakeScheduler: SmartWakeScheduler = {
  available: () => native !== null && native.canScheduleExact(),
  schedule: (atS, title, text) => native !== null && native.schedule(atS * 1000, title, text),
  cancel: () => native?.cancel(),
};

export const SMART_WAKE_TASK = 'OpenHoopSmartWake';
