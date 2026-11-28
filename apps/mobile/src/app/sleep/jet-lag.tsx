import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import { formatLongDay, formatMinutes } from '@/data/dailyDerived';
import {
  anchorFromHistory,
  generateFromSaved,
  parseTripForm,
  sameSavedPlan,
  stepsNeeded,
  trackSpans,
  zoneCity,
  type FormProblem,
  type JetLagPlan,
  type LightWindow,
  type PlanDay,
  type PointInTime,
  type TripForm,
} from '@/data/jetLag';
import { MAX_PRE_ADJUST_DAYS, type SavedJetLagPlan } from '@/data/userData';
import { useT } from '@/i18n/useT';
import type { TranslationKey } from '@/i18n';
import { COMMON_TIME_ZONES, deviceTimeZone, type ZonedClock } from '@/lib/timeZones';
import { AppText } from '@/ui/AppText';
import { Card, CardHeader } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Button, Field } from '@/ui/controls';
import { Callout, Page } from '@/ui/daily/bits';
import { ZonePicker } from '@/ui/daily/ZonePicker';
import { CoachAsk } from '@/ui/CoachAsk';
import { Icon } from '@/ui/Icon';
import { ToggleRow } from '@/ui/manage/rows';
import { Num } from '@/ui/Num';
import { ParityBadge } from '@/ui/ParityBadge';
import { PARITY } from '@/ui/parity';
import { radius, spacing, useTheme } from '@/ui/theme';

function formState(saved: SavedJetLagPlan | null, history: { bedMinutes: number; wakeMinutes: number } | null, home: string | null): TripForm {
  if (saved !== null) {
    return {
      departureDate: saved.departureDate,
      departureTime: formatMinutes(saved.departureMinutes),
      homeZone: saved.homeZone,
      destZone: saved.destZone,
      preDays: saved.preDays,
      bedTime: formatMinutes(saved.bedMinutes),
      wakeTime: formatMinutes(saved.wakeMinutes),
      anchorSource: saved.anchorSource,
    };
  }
  return {
    departureDate: '',
    departureTime: '',
    homeZone: home,
    destZone: null,
    preDays: null,
    bedTime: history === null ? '' : formatMinutes(history.bedMinutes),
    wakeTime: history === null ? '' : formatMinutes(history.wakeMinutes),
    anchorSource: history === null ? 'entered' : 'sleep-data',
  };
}

function PreDaysStepper({ value, effective, auto, max, onChange }: { value: number | null; effective: number | null; auto: number | null; max: number; onChange: (next: number | null) => void }) {
  const { t } = useT();
  const { colors } = useTheme();
  const current = effective ?? value ?? 0;
  const label = value === null ? (auto === null ? t('jetlag.preDaysAutoButton') : t('jetlag.preDaysAuto', { days: auto })) : current === 1 ? t('jetlag.preDaysOne') : t('jetlag.preDaysMany', { count: current });
  const button = (testID: string, accessibilityLabel: string, glyph: string, next: number, disabled: boolean) => (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={() => onChange(next)}
      style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}>
      <AppText variant="title">{glyph}</AppText>
    </Pressable>
  );
  return (
    <View style={{ gap: 6 }}>
      <AppText variant="capSmall" muted>
        {t('jetlag.preDays')}
      </AppText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        {button('predays-less', t('jetlag.preDaysFewer'), '−', current - 1, current <= 0)}
        <AppText variant="bodyStrong" testID="predays-value" style={{ minWidth: 110, textAlign: 'center' }}>
          {label}
        </AppText>
        {button('predays-more', t('jetlag.preDaysMore'), '+', current + 1, current >= max)}
      </View>
      {value !== null ? <Button testID="predays-auto" variant="tertiary" label={t('jetlag.preDaysAutoButton')} onPress={() => onChange(null)} /> : null}
    </View>
  );
}

function weekdayShort(date: string, language: 'nl' | 'en'): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-GB', { weekday: 'short', timeZone: 'UTC' }).replace('.', '');
}

function weekdayLong(date: string, language: 'nl' | 'en'): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-GB', { weekday: 'long', timeZone: 'UTC' });
}

function decimal(value: number, language: 'nl' | 'en'): string {
  const text = String(Math.abs(value));
  return language === 'nl' ? text.replace('.', ',') : text;
}

function hoursMinutes(hours: number): string {
  const minutes = Math.round(Math.abs(hours) * 60);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

function RouteHero({ plan, homeZone, destZone, date }: { plan: JetLagPlan | null; homeZone: string | null; destZone: string | null; date: string }) {
  const { t, language } = useT();
  const { colors } = useTheme();
  if (plan === null || homeZone === null || destZone === null) {
    return (
      <AppText variant="title" testID="jetlag-route-empty">
        {t('jetlagx.trip')}
      </AppText>
    );
  }
  const shift = `${plan.zoneShiftH < 0 ? '−' : '+'}${decimal(plan.zoneShiftH, language)} h`;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }} testID="jetlag-route">
      <Num size={44} adjustsFontSizeToFit style={{ flex: 1 }} testID="jetlag-route-home">
        {zoneCity(homeZone)}
      </Num>
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Icon name="plane" color={colors.levelC} size={24} />
        <AppText variant="label" color={colors.levelC} numeric testID="jetlag-route-shift">
          {t('jetlagx.route', { shift, date: formatLongDay(date, language) })}
        </AppText>
      </View>
      <Num size={44} adjustsFontSizeToFit style={{ flex: 1, textAlign: 'right' }} testID="jetlag-route-dest">
        {zoneCity(destZone)}
      </Num>
    </View>
  );
}

function TrackBar({ from, to, color, testID }: { from: number; to: number; color: string; testID: string }) {
  return (
    <>
      {trackSpans(from, to).map(([a, b]) => (
        <View
          key={a}
          testID={testID}
          style={{ position: 'absolute', top: 0, bottom: 0, left: `${(a / 1440) * 100}%`, width: `${((b - a) / 1440) * 100}%`, borderRadius: 6, backgroundColor: color }}
        />
      ))}
    </>
  );
}

function ShiftPlanCard({ plan }: { plan: JetLagPlan }) {
  const { t, language } = useT();
  const { colors } = useTheme();
  return (
    <Card testID="jetlag-shift-plan" style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="cardTitle">{t('jetlagx.shiftPlan')}</AppText>
        <AppText variant="capSmall" muted>
          {plan.days.length === 1 ? t('jetlagx.daysOne') : t('jetlagx.daysMany', { count: plan.days.length })}
        </AppText>
      </View>
      <View style={{ gap: 10 }}>
        {plan.days.map((day) => (
          <View key={day.offset} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }} testID={`jetlag-shift-${day.offset}`}>
            <AppText variant="caption" muted style={{ width: 44 }}>
              {weekdayShort(day.date, language)}
            </AppText>
            <View style={{ flex: 1, height: 20, borderRadius: 6, backgroundColor: colors.surfaceAlt }}>
              <TrackBar from={day.bed.dest.minutes} to={day.wake.dest.minutes} color={colors.stage.rem} testID={`jetlag-shift-${day.offset}-sleep`} />
              {day.seek !== null ? <TrackBar from={day.seek.start.dest.minutes} to={day.seek.end.dest.minutes} color={colors.gold} testID={`jetlag-shift-${day.offset}-light`} /> : null}
            </View>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 16, rowGap: 8 }}>
        {[
          { color: colors.stage.rem, label: t('jetlagx.sleep') },
          { color: colors.gold, label: t('jetlagx.light') },
        ].map((item) => (
          <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: item.color }} />
            <AppText variant="caption" muted>
              {item.label}
            </AppText>
          </View>
        ))}
        <AppText variant="caption" muted>
          {t('jetlagx.destTime')}
        </AppText>
      </View>
    </Card>
  );
}

function TipCard({ plan }: { plan: JetLagPlan }) {
  const { t, language } = useT();
  const { colors } = useTheme();
  const first = plan.days[0];
  if (first === undefined || plan.direction === 'none') return null;
  const arrival = plan.days.find((day) => day.phase !== 'before' && day.seek !== null) ?? null;
  const rate = `${decimal(plan.ratePerDay, language)} h`;
  const bedTip = t(plan.direction === 'east' ? 'jetlagx.tipEast' : 'jetlagx.tipWest', { rate, day: weekdayLong(first.date, language) });
  const light = arrival?.seek ?? null;
  const lightStart = light === null ? null : formatMinutes(light.start.dest.minutes);
  const lightEnd = light === null ? null : formatMinutes(light.end.dest.minutes);
  return (
    <View testID="jetlag-tip" style={{ backgroundColor: colors.coach.surface, borderRadius: radius.md, padding: spacing.lg, gap: spacing.md }}>
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
        <Icon name="sparkle" color={colors.text} size={18} />
        <AppText variant="body" color={colors.textSoft} style={{ flex: 1 }} testID="jetlag-tip-text">
          {lightStart === null || lightEnd === null ? bedTip : `${bedTip} ${t('jetlagx.tipLight', { start: lightStart, end: lightEnd })}`}
        </AppText>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <Chip label={t('jetlagx.chipBed', { rate: `${plan.direction === 'east' ? '−' : '+'}${hoursMinutes(plan.ratePerDay)}` })} tone="purple" testID="jetlag-chip-bed" />
        {lightStart !== null && lightEnd !== null ? <Chip label={t('jetlagx.chipLight', { start: lightStart, end: lightEnd })} tone="warning" testID="jetlag-chip-light" /> : null}
      </View>
    </View>
  );
}

export default function JetLagScreen() {
  const { days, userData, updateUserData, alarm } = useAppData();
  const { t, language } = useT();
  const { colors } = useTheme();
  const saved = userData.jetLagPlan;
  const history = useMemo(() => anchorFromHistory(days), [days]);
  const [form, setForm] = useState<TripForm>(() => formState(saved, history, deviceTimeZone()));
  const [touched, setTouched] = useState(saved !== null);
  const [saveFailed, setSaveFailed] = useState(false);

  const zones = useMemo(() => {
    const extra = [form.homeZone, form.destZone, deviceTimeZone()].filter((zone): zone is string => zone !== null && !COMMON_TIME_ZONES.includes(zone));
    return [...new Set([...extra, ...COMMON_TIME_ZONES])];
  }, [form.homeZone, form.destZone]);

  const parsed = parseTripForm(form);
  const result = parsed.ok ? generateFromSaved(parsed.saved) : null;
  const plan: JetLagPlan | null = result !== null && result.ok ? result.plan : null;
  const problem: FormProblem | null = parsed.ok ? null : parsed.problem;
  const dirty = parsed.ok && !sameSavedPlan(parsed.saved, saved);

  const edit = (patch: Partial<TripForm>) => {
    setTouched(true);
    setSaveFailed(false);
    setForm((current) => ({ ...current, ...patch }));
  };

  const editSleep = (patch: Pick<Partial<TripForm>, 'bedTime' | 'wakeTime'>) => {
    const next = { ...form, ...patch };
    const matchesHistory = history !== null && next.bedTime === formatMinutes(history.bedMinutes) && next.wakeTime === formatMinutes(history.wakeMinutes);
    edit({ ...patch, anchorSource: matchesHistory ? 'sleep-data' : 'entered' });
  };

  const number = (value: number): string => (language === 'nl' ? String(value).replace('.', ',') : String(value));
  const point = (p: PointInTime, fixed: 'home' | 'dest'): string => {
    const own: ZonedClock = fixed === 'home' ? p.home : p.dest;
    const clock = formatMinutes(own.minutes);
    return fixed === 'dest' && p.dest.date !== p.home.date ? `${clock} (${formatLongDay(p.dest.date, language)})` : clock;
  };
  const both = (p: PointInTime): string => t('jetlag.bothClocks', { home: point(p, 'home'), dest: point(p, 'dest') });
  const range = (w: LightWindow, fixed: 'home' | 'dest'): string => `${point(w.start, fixed)}–${formatMinutes((fixed === 'home' ? w.end.home : w.end.dest).minutes)}`;
  const bothWindow = (w: LightWindow): string => t('jetlag.bothClocks', { home: range(w, 'home'), dest: range(w, 'dest') });

  const dayTitle = (day: PlanDay): string => {
    if (day.phase === 'travel') return t('jetlag.dayTravel');
    const count = Math.abs(day.offset);
    if (day.phase === 'before') return count === 1 ? t('jetlag.dayBeforeOne') : t('jetlag.dayBeforeMany', { count });
    return count === 1 ? t('jetlag.dayAfterOne') : t('jetlag.dayAfterMany', { count });
  };

  const save = async () => {
    if (!parsed.ok) return;
    setSaveFailed(!(await updateUserData({ jetLagPlan: parsed.saved })));
  };

  const clear = async () => {
    setSaveFailed(!(await updateUserData({ jetLagPlan: null })));
  };

  const anchorNote =
    history === null ? t('jetlag.anchorNoHistory') : form.anchorSource === 'sleep-data' ? t('jetlag.anchorHistory', { nights: history.nights }) : t('jetlag.anchorEntered');

  const row = (label: string, value: string, testID: string, tone: 'default' | 'seek' | 'avoid' = 'default') => (
    <View style={{ gap: 2 }}>
      <AppText variant="capSmall" color={tone === 'seek' ? colors.positive : tone === 'avoid' ? colors.warning : colors.textMuted}>
        {label}
      </AppText>
      <AppText variant="body" testID={testID}>
        {value}
      </AppText>
    </View>
  );

  return (
    <Page
      title={t('sleepx.jetLag')}
      tint="sleep"
      testID="sleep-jet-lag"
      hero={<RouteHero plan={plan} homeZone={parsed.ok ? parsed.saved.homeZone : null} destZone={parsed.ok ? parsed.saved.destZone : null} date={parsed.ok ? parsed.saved.departureDate : ''} />}>
      {plan !== null && plan.days.length > 0 ? (
        <>
          <ShiftPlanCard plan={plan} />
          <TipCard plan={plan} />
          <CoachAsk question={t('jetlagx.ask')} testID="jetlag-coach" />
        </>
      ) : null}
      <Card style={{ paddingVertical: spacing.xs }}>
        <ToggleRow
          title={t('jetlagx.shiftAlarm')}
          subtitle={saved === null || dirty ? t('jetlagx.shiftAlarmSave') : !alarm.plan.enabled ? t('jetlagx.shiftAlarmOff') : t('jetlagx.shiftAlarmHint')}
          value={userData.jetLagShiftAlarm}
          disabled={saved === null && !userData.jetLagShiftAlarm}
          onChange={(jetLagShiftAlarm) => void updateUserData({ jetLagShiftAlarm })}
          testID="jetlag-shift-alarm"
        />
      </Card>

      <AppText variant="body" muted>
        {t('jetlag.intro')}
      </AppText>

      <Callout tone="warning" title={t('jetlag.disclaimerTitle')} body={t('jetlag.disclaimer')} />

      <Card style={{ gap: spacing.md }}>
        <CardHeader title={t('jetlag.tripTitle')} />
        <Field
          testID="jetlag-date"
          label={t('jetlag.departureDate')}
          value={form.departureDate}
          onChangeText={(departureDate) => edit({ departureDate })}
          placeholder="2026-03-10"
          keyboardType="numbers-and-punctuation"
          maxLength={10}
        />
        <Field
          testID="jetlag-time"
          label={t('jetlag.departureTime')}
          value={form.departureTime}
          onChangeText={(departureTime) => edit({ departureTime })}
          placeholder="10:00"
          keyboardType="numbers-and-punctuation"
          maxLength={5}
          hint={t('jetlag.departureHint')}
        />
        <ZonePicker testID="zone-home" label={t('jetlag.homeZone')} value={form.homeZone} options={zones} onChange={(homeZone) => edit({ homeZone })} />
        <ZonePicker testID="zone-dest" label={t('jetlag.destZone')} value={form.destZone} options={zones} onChange={(destZone) => edit({ destZone })} />
        <PreDaysStepper value={form.preDays} effective={plan?.preDays ?? null} auto={plan !== null && form.preDays === null ? plan.preDays : null} max={plan === null ? MAX_PRE_ADJUST_DAYS : Math.min(MAX_PRE_ADJUST_DAYS, stepsNeeded(plan.zoneShiftH))} onChange={(preDays) => edit({ preDays })} />
      </Card>

      <Card style={{ gap: spacing.md }}>
        <CardHeader title={t('jetlag.sleepTitle')} />
        <Field
          testID="jetlag-bed"
          label={t('jetlag.bedTime')}
          value={form.bedTime}
          onChangeText={(bedTime) => editSleep({ bedTime })}
          placeholder="23:00"
          keyboardType="numbers-and-punctuation"
          maxLength={5}
        />
        <Field
          testID="jetlag-wake"
          label={t('jetlag.wakeTime')}
          value={form.wakeTime}
          onChangeText={(wakeTime) => editSleep({ wakeTime })}
          placeholder="07:00"
          keyboardType="numbers-and-punctuation"
          maxLength={5}
        />
        <AppText variant="caption" muted testID="jetlag-anchor-note">
          {anchorNote}
        </AppText>
      </Card>

      {touched && problem !== null ? (
        <AppText variant="label" color={colors.negative} testID="jetlag-problem" accessibilityLiveRegion="polite">
          {t(`jetlag.problem.${problem}` satisfies TranslationKey)}
        </AppText>
      ) : null}
      {result !== null && !result.ok ? (
        <AppText variant="label" color={colors.negative} testID="jetlag-plan-failed">
          {t('jetlag.planFailed')}
        </AppText>
      ) : null}

      {plan !== null ? (
        <>
          <Card testID="jetlag-summary" style={{ gap: spacing.sm }}>
            <CardHeader title={t('jetlag.summaryTitle')} />
            {plan.direction === 'none' ? (
              <AppText variant="body" testID="jetlag-none">
                {t('jetlag.noShift')}
              </AppText>
            ) : (
              <AppText variant="body" testID="jetlag-direction">
                {t(plan.direction === 'east' ? 'jetlag.summaryEast' : 'jetlag.summaryWest', {
                  shift: `${number(Math.abs(plan.zoneShiftH))} h`,
                  rate: `${number(plan.ratePerDay)} h`,
                })}
              </AppText>
            )}
            <View style={{ gap: 2 }}>
              <AppText variant="capSmall" muted>
                {t('jetlag.departs')}
              </AppText>
              <AppText variant="body" testID="jetlag-departure">
                {t('jetlag.bothClocks', { home: point(plan.departure, 'home'), dest: point(plan.departure, 'dest') })}
              </AppText>
            </View>
            <ParityBadge level={PARITY.jetLag} long />
          </Card>

          {plan.days.length > 0 ? (
            <>
              <AppText variant="capLarge" muted accessibilityRole="header">
                {t('jetlag.planTitle')}
              </AppText>
              {plan.days.map((day) => (
                <Card key={day.offset} testID={`jetlag-day-${day.offset}`} style={{ gap: spacing.md }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
                    <View style={{ flexShrink: 1 }}>
                      <AppText variant="cardTitle">{dayTitle(day)}</AppText>
                      <AppText variant="caption" muted>
                        {formatLongDay(day.date, language)}
                      </AppText>
                    </View>
                    {day.adapted ? <Chip label={t('jetlag.adaptedChip')} tone="positive" small /> : null}
                  </View>
                  {row(t('jetlag.bed'), both(day.bed), `jetlag-bed-${day.offset}`)}
                  {row(t('jetlag.wake'), both(day.wake), `jetlag-wake-${day.offset}`)}
                  {day.seek !== null ? row(t('jetlag.seek'), bothWindow(day.seek), `jetlag-seek-${day.offset}`, 'seek') : null}
                  {day.avoid !== null ? row(t('jetlag.avoid'), bothWindow(day.avoid), `jetlag-avoid-${day.offset}`, 'avoid') : null}
                  {day.adapted ? (
                    <AppText variant="caption" muted>
                      {t('jetlag.adaptedNote')}
                    </AppText>
                  ) : null}
                  {day.phase === 'travel' ? (
                    <AppText variant="caption" muted>
                      {t('jetlag.travelNote')}
                    </AppText>
                  ) : null}
                  {day.clockChange.home ? (
                    <AppText variant="caption" color={colors.warning} testID={`jetlag-dst-home-${day.offset}`}>
                      {t('jetlag.clockChangeHome')}
                    </AppText>
                  ) : null}
                  {day.clockChange.dest ? (
                    <AppText variant="caption" color={colors.warning} testID={`jetlag-dst-dest-${day.offset}`}>
                      {t('jetlag.clockChangeDest')}
                    </AppText>
                  ) : null}
                </Card>
              ))}
              <AppText variant="caption" muted>
                {t('jetlag.lightHint')}
              </AppText>
            </>
          ) : null}
        </>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        {saved !== null && !dirty ? <Chip label={t('jetlag.savedChip')} tone="positive" /> : null}
        <Button testID="jetlag-save" label={t('jetlag.save')} onPress={() => void save()} disabled={!parsed.ok || !dirty} />
        {saved !== null ? <Button testID="jetlag-clear" variant="secondary" label={t('jetlag.clear')} onPress={() => void clear()} /> : null}
        {saveFailed ? (
          <AppText variant="label" color={colors.negative} testID="jetlag-save-failed" accessibilityLiveRegion="polite">
            {t('jetlag.saveFailed')}
          </AppText>
        ) : null}
        <AppText variant="caption" muted>
          {t('jetlag.savedNote')}
        </AppText>
      </View>

      <Callout title={t('jetlag.disclaimerTitle')} body={t('jetlag.source')} />
    </Page>
  );
}
