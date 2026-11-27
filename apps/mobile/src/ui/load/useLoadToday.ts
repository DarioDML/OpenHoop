import type { LoadReference } from '@openhoop/analytics';
import type { DayRecord } from '@openhoop/core';

import { useAppData, useLive } from '@/data/context';
import { shownLoad, visibleReadiness } from '@/data/derived';
import { setLoadBuzz, type LoadBuzzPrefs, type LoadBuzzThreshold } from '@/data/loadBuzz';
import { aimAt, loadTargetView, referenceFor, typicalTrainingHr, type LoadTargetView } from '@/data/loadDerived';
import type { AimRange } from '@/data/readinessDerived';
import { useT } from '@/i18n/useT';
import { deviceTzOffsetS, unixToIsoDate } from '@/lib/dates';
import { formatClock } from '@/lib/format';
import { useExplain } from '@/ui/explain/ExplainProvider';

export interface LoadToday {
  day: DayRecord;
  index: number;
  value: number | null;
  reason: string | null;
  soFar: boolean;
  live: boolean;
  isToday: boolean;
  readiness: number | null;
  aim: AimRange | null;
  view: LoadTargetView | null;
  ref: LoadReference;
  trainingHr: number;
  nowS: number;
}

export function useLoadToday(): LoadToday | null {
  const { days, profile } = useAppData();
  const live = useLive();
  const nowS = useExplain().nowS();
  const index = days.length - 1;
  const day = days[index];
  if (day === undefined) return null;
  const isToday = day.day === unixToIsoDate(nowS, deviceTzOffsetS(new Date(nowS * 1000)));
  const shown = shownLoad(days, index);
  const liveValue = isToday && live.active && live.dayLoad !== undefined && live.dayLoad !== null ? live.dayLoad : null;
  const value = liveValue ?? shown.value;
  const aim = aimAt(days, index);
  const ref = referenceFor(days, profile, nowS);
  return {
    day,
    index,
    value,
    reason: shown.reason,
    soFar: liveValue === null && shown.soFar,
    live: liveValue !== null,
    isToday,
    readiness: visibleReadiness(day).value,
    aim,
    view: loadTargetView(value, aim),
    ref,
    trainingHr: typicalTrainingHr(days, ref, nowS),
    nowS,
  };
}

export interface LoadBuzzControl {
  prefs: LoadBuzzPrefs;
  set: (threshold: LoadBuzzThreshold, on: boolean) => void;
  doneToday: Readonly<Record<LoadBuzzThreshold, boolean>>;
  availability: string;
}

export function useLoadBuzz(today: LoadToday): LoadBuzzControl {
  const { userData, updateUserData, device, settings } = useAppData();
  const { t } = useT();
  const prefs = userData.loadBuzz;
  const todayKey = unixToIsoDate(today.nowS, deviceTzOffsetS(new Date(today.nowS * 1000)));
  const load = today.isToday ? today.value : null;
  const set = (threshold: LoadBuzzThreshold, on: boolean): void => {
    void updateUserData({ loadBuzz: setLoadBuzz(prefs, threshold, on, load, today.aim, todayKey) });
  };
  const synced =
    device.lastSyncAt === null ? t('loadBuzz.notSynced') : t('loadBuzz.lastSync', { time: formatClock(device.lastSyncAt, deviceTzOffsetS(new Date(device.lastSyncAt * 1000))) });
  const availability =
    today.aim === null
      ? t('loadBuzz.calibrating')
      : settings.dataSource === 'demo'
        ? `${t('loadBuzz.when')} ${t('loadBuzz.demo')}`
        : device.name === null
          ? t('loadBuzz.noBand')
          : `${t('loadBuzz.when')} ${synced}`;
  return { prefs, set, doneToday: { target: prefs.lastTarget === todayKey, top: prefs.lastTop === todayKey }, availability };
}
