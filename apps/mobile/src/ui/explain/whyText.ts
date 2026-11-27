import { LOAD_MIN_VALID_MINUTES } from '@openhoop/analytics';

import { formatWeekday } from '@/data/activityDerived';
import type { MissingExplanation } from '@/data/explainMissing';
import { remaining, type BuildingTerm, type Progress } from '@/data/progress';
import { TERMS } from '@/data/terms';
import type { Language } from '@/data/types';
import { reasonText } from '@/i18n';
import type { TFunction } from '@/i18n/useT';
import { formatAgo, formatClock, formatDuration } from '@/lib/format';
import type { IconName } from '@/ui/Icon';

export type WhyTone = 'positive' | 'pink' | 'info' | 'warning' | 'neutral';

export interface WhyRow {
  id: 'band' | 'cause' | 'source' | 'next' | 'expected';
  icon: IconName;
  tone: WhyTone;
  title: string;
  body: string | null;
  dots: Progress | null;
  bar: number | null;
}

export interface WhyText {
  title: string;
  subtitle: string;
  rows: WhyRow[];
  footer: string;
  aboutLink: string;
  profileLink: boolean;
}

const LOAD_MIN_VALID_HOURS = LOAD_MIN_VALID_MINUTES / 60;

function row(
  id: WhyRow['id'],
  icon: IconName,
  tone: WhyTone,
  title: string,
  body: string | null,
  extra: Partial<Pick<WhyRow, 'dots' | 'bar'>> = {},
): WhyRow {
  return { id, icon, tone, title, body, dots: extra.dots ?? null, bar: extra.bar ?? null };
}

function bandRow(t: TFunction, expl: MissingExplanation): WhyRow | null {
  const { state, lastSyncAt, tzOffsetS, nowS } = expl.band;
  if (state === 'read' && lastSyncAt !== null) {
    const time = formatClock(lastSyncAt, tzOffsetS);
    return row('band', 'check', 'positive', t('why.band.readTitle'), t(expl.window === 'night' ? 'why.band.night' : 'why.band.day', { time }));
  }
  if (state === 'stale') {
    const title = lastSyncAt === null ? t('why.band.neverTitle') : t('why.band.staleTitle', { ago: formatAgo(t, nowS, lastSyncAt) });
    return row('band', 'sync', 'warning', title, t('why.band.staleBody'));
  }
  return null;
}

function expectedBody(t: TFunction, progress: Progress): string {
  if (progress.unit === 'days') return t('why.expected.calmDays');
  const left = remaining(progress);
  if (left === 1) return t('why.expected.tonight');
  if (left === 2) return t('why.expected.tonightTomorrow');
  return t('why.expected.next', { count: left });
}

function needsNightsRows(t: TFunction, language: Language, expl: MissingExplanation): WhyRow[] {
  const { progress, term } = expl;
  if (progress === null) return [row('cause', 'target', 'pink', t('why.nights.title'), t('why.need.generic'))];
  const cause = row(
    'cause',
    'target',
    'pink',
    t(progress.unit === 'nights' ? 'why.nights.title' : 'why.days.title'),
    t(`why.need.${term as BuildingTerm}`, { need: progress.need, have: progress.have }),
    { dots: progress },
  );
  if (expl.expectedDay === null) return [cause];
  const weekday = formatWeekday(expl.expectedDay, language, 'long');
  const title = progress.unit === 'nights' ? t('why.expected.morning', { weekday }) : t('why.expected.from', { weekday });
  return [cause, row('expected', 'calendar', 'neutral', title, expectedBody(t, progress))];
}

function notRecordedRows(t: TFunction, expl: MissingExplanation): WhyRow[] {
  const night = expl.window === 'night';
  return [
    row('cause', 'band', 'warning', t(night ? 'why.noData.nightTitle' : 'why.noData.dayTitle'), t(night ? 'why.noData.nightBody' : 'why.noData.dayBody')),
    row('source', 'pulse', 'neutral', t('why.source.title'), t(night ? 'why.source.night' : 'why.source.day')),
    night
      ? row('next', 'moon', 'neutral', t('why.next.tonight'), t('why.next.tonightBody'))
      : row('next', 'clock', 'neutral', t('why.next.today'), t('why.next.todayBody')),
  ];
}

function dayRunningRows(t: TFunction, expl: MissingExplanation): WhyRow[] {
  const hours = LOAD_MIN_VALID_HOURS;
  const worn = expl.wornMinutes;
  const cause =
    worn === null
      ? row('cause', 'clock', 'info', t('why.load.title'), t('why.load.bodyUnknown', { hours }))
      : row('cause', 'clock', 'info', t('why.load.title'), t('why.load.body', { hours, worn: formatDuration(t, worn * 60) }), {
          bar: Math.min(1, worn / LOAD_MIN_VALID_MINUTES),
        });
  return [cause, row('next', 'calendar', 'neutral', t('why.next.today'), t('why.next.todayBody'))];
}

function profileBody(t: TFunction, expl: MissingExplanation): string {
  if (expl.profileGaps.length === 0) return t('calories.needsProfile');
  const names = expl.profileGaps.map((field) => t(`why.field.${field}`));
  const last = names.pop() ?? '';
  const fields = names.length === 0 ? last : t('why.fieldsAnd', { rest: names.join(', '), last });
  return t('why.profile.body', { fields });
}

function subtitleFor(t: TFunction, language: Language, expl: MissingExplanation): string {
  switch (expl.kind) {
    case 'needs-nights':
      return t('why.noNumber');
    case 'day-running':
      return t('why.subtitle.dayRunning');
    case 'not-recorded':
      if (expl.window === 'day') return t('why.subtitle.notRecordedDay');
      return t(expl.current ? 'why.subtitle.notRecordedLastNight' : 'why.subtitle.notRecordedNight');
    case 'thin-signal':
      return t('why.subtitle.thin');
    case 'needs-profile':
      return t('why.subtitle.profile');
    case 'signal-missing':
      return t('reason.missing-signal');
    case 'other':
      return reasonText(language, expl.reason);
  }
}

function causeRows(t: TFunction, language: Language, expl: MissingExplanation): WhyRow[] {
  switch (expl.kind) {
    case 'needs-nights':
      return needsNightsRows(t, language, expl);
    case 'day-running':
      return dayRunningRows(t, expl);
    case 'not-recorded':
      return notRecordedRows(t, expl);
    case 'thin-signal':
      return [
        row('cause', 'pulse', 'warning', t('why.thin.title'), t('why.thin.body')),
        row('next', 'moon', 'neutral', t('why.next.tonight'), t('why.thin.fit')),
      ];
    case 'needs-profile':
      return [row('cause', 'user', 'warning', t('why.profile.title'), profileBody(t, expl))];
    case 'signal-missing':
      return [row('cause', 'alert', 'warning', t('why.signal.title'), t('why.signal.body'))];
    case 'other':
      return [row('cause', 'info', 'neutral', reasonText(language, expl.reason), null)];
  }
}

function footerFor(t: TFunction, expl: MissingExplanation): string {
  if (expl.kind !== 'not-recorded') return t(TERMS[expl.term].body);
  return t(expl.window === 'night' ? 'why.footer.noGuessNight' : 'why.footer.noGuessDay');
}

export function whyText(t: TFunction, language: Language, expl: MissingExplanation): WhyText {
  const name = t(TERMS[expl.term].name);
  const band = bandRow(t, expl);
  const rows = causeRows(t, language, expl);
  return {
    title: name,
    subtitle: subtitleFor(t, language, expl),
    rows: band === null ? rows : [band, ...rows],
    footer: footerFor(t, expl),
    aboutLink: t('explain.aboutLink', { name }),
    profileLink: expl.kind === 'needs-profile',
  };
}

function nightsStatus(t: TFunction, progress: Progress): string {
  const left = remaining(progress);
  if (progress.unit === 'nights') return left === 1 ? t('why.status.nightsOne') : t('why.status.nights', { count: left });
  return left === 1 ? t('why.status.calmDaysOne') : t('why.status.calmDays', { count: left });
}

export function missingStatus(t: TFunction, language: Language, expl: MissingExplanation, style: 'row' | 'sheet'): string {
  switch (expl.kind) {
    case 'needs-nights': {
      if (!expl.current || expl.progress === null) return t('why.noNumber');
      if (style === 'sheet' && expl.expectedDay !== null) {
        return t('why.status.until', { weekday: formatWeekday(expl.expectedDay, language, 'long') });
      }
      return nightsStatus(t, expl.progress);
    }
    case 'day-running':
      if (expl.wornMinutes === null) return reasonText(language, expl.reason);
      return t('why.status.worn', { worn: formatDuration(t, expl.wornMinutes * 60), hours: LOAD_MIN_VALID_HOURS });
    case 'not-recorded':
      return t('why.status.notRecorded');
    case 'thin-signal':
      return t('why.status.thin');
    case 'needs-profile':
      return t('reason.no-profile');
    case 'signal-missing':
      return t('reason.missing-signal');
    case 'other':
      return reasonText(language, expl.reason);
  }
}
