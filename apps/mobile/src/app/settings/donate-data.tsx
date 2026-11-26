import type { DonationDay, DonationProgress } from '@openhoop/core';
import { estimateDonation, modelLabel } from '@openhoop/core/donation-info';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { formatLongDay } from '@/data/dailyDerived';
import { donationIssueUrl } from '@/data/donation/issue';
import type { BuiltDonation } from '@/data/types';
import type { TranslationKey } from '@/i18n';
import { useT, type TFunction } from '@/i18n/useT';
import { formatDuration, formatNumber } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button, CheckRow } from '@/ui/controls';
import { CapHeader, ListGroup, ListRow } from '@/ui/ListGroup';
import { openInAppBrowser } from '@/ui/manage/inAppBrowser';
import { SettingsPage } from '@/ui/manage/SettingsPage';
import { tile } from '@/ui/manage/tiles';
import { spacing, useTheme } from '@/ui/theme';

type Phase =
  | { kind: 'choose' }
  | { kind: 'building'; progress: DonationProgress | null }
  | { kind: 'saved'; built: BuiltDonation; githubFailed: boolean }
  | { kind: 'shareEach'; built: BuiltDonation }
  | { kind: 'pickCancelled'; built: BuiltDonation }
  | { kind: 'error'; message: TranslationKey };

const MANY_FILES = 10;
const MEGABYTE = 1_000_000;

function sizeText(bytes: number, language: 'nl' | 'en'): string {
  const mb = bytes / MEGABYTE;
  return formatNumber(mb, mb < 10 ? 1 : 0, language);
}

function summaryText(t: TFunction, language: 'nl' | 'en', chosen: readonly DonationDay[]): string {
  const models = [...new Set(chosen.flatMap((d) => d.bands.map((b) => modelLabel(b.model))))].join(' + ');
  const estimate = estimateDonation(chosen);
  return [
    t('aboutx.donateData.band', { model: models }),
    chosen.length === 1 ? t('aboutx.donateData.oneDay') : t('aboutx.donateData.manyDays', { n: chosen.length }),
    t('aboutx.donateData.size', { mb: sizeText(estimate.bytes, language) }),
    estimate.files === 1 ? t('aboutx.donateData.oneFile') : t('aboutx.donateData.manyFiles', { n: estimate.files }),
  ].join(' · ');
}

function errorKey(error: unknown): TranslationKey {
  return error instanceof Error && error.name === 'DonationEmptyError' ? 'aboutx.donateData.errorEmpty' : 'aboutx.donateData.errorBuild';
}

export default function DonateDataScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { settings, listDonationDays, buildDonation, saveDonation, shareDonationPart, discardDonation } = useAppData();
  const isBand = settings.dataSource === 'band';
  const version = Constants.expoConfig?.version ?? '0';

  const [days, setDays] = useState<DonationDay[] | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'choose' });
  const running = useRef<AbortController | null>(null);
  const prepared = useRef<BuiltDonation | null>(null);
  const mounted = useRef(true);
  const cleanup = useRef({ discardDonation });
  cleanup.current = { discardDonation };

  useEffect(() => {
    if (!isBand) return;
    let live = true;
    void listDonationDays().then((found) => {
      if (live) setDays(found);
    });
    return () => {
      live = false;
    };
  }, [isBand, listDonationDays]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      running.current?.abort();
      if (prepared.current !== null) cleanup.current.discardDonation(prepared.current);
    };
  }, []);

  const chosen = (days ?? []).filter((d) => selected.has(d.day)).sort((a, b) => (a.day < b.day ? -1 : 1));
  const busy = phase.kind === 'building';

  const openGithub = async (built: BuiltDonation): Promise<boolean> => openInAppBrowser(donationIssueUrl(built, version), colors);

  const save = async (built: BuiltDonation): Promise<void> => {
    const outcome = await saveDonation(built);
    if (!mounted.current) return;
    if (outcome.kind === 'saved') {
      setPhase({ kind: 'saved', built, githubFailed: false });
      const opened = await openGithub(built);
      if (!opened && mounted.current) setPhase({ kind: 'saved', built, githubFailed: true });
    } else if (outcome.kind === 'shareEach') {
      setPhase({ kind: 'shareEach', built });
    } else {
      setPhase({ kind: 'pickCancelled', built });
    }
  };

  const donate = async (): Promise<void> => {
    if (running.current !== null || chosen.length === 0 || !consent) return;
    const controller = new AbortController();
    running.current = controller;
    setPhase({ kind: 'building', progress: null });
    try {
      const built = await buildDonation(
        chosen.map((d) => d.day),
        (progress) => {
          if (mounted.current) setPhase({ kind: 'building', progress });
        },
        controller.signal,
      );
      prepared.current = built;
      if (!mounted.current) return;
      await save(built);
    } catch (error) {
      if (!mounted.current) return;
      setPhase(controller.signal.aborted ? { kind: 'choose' } : { kind: 'error', message: errorKey(error) });
    } finally {
      running.current = null;
    }
  };

  const toggle = (day: string, next: boolean): void => {
    setSelected((current) => {
      const out = new Set(current);
      if (next) out.add(day);
      else out.delete(day);
      return out;
    });
  };

  const progressText = (progress: DonationProgress | null): string => {
    if (progress === null) return t('aboutx.donateData.preparing');
    const key = progress.phase === 'measure' ? 'aboutx.donateData.checking' : 'aboutx.donateData.packing';
    return t(key, { done: progress.done, total: progress.total });
  };

  const intro = (
    <Card style={{ gap: spacing.sm }}>
      <AppText variant="body">{t('aboutx.donateData.intro')}</AppText>
      <AppText variant="label" muted>
        {t('aboutx.donateData.goesIn')}
      </AppText>
      <AppText variant="label" muted>
        {t('aboutx.donateData.staysOut')}
      </AppText>
      <AppText variant="label" muted>
        {t('aboutx.donateData.realDates')}
      </AppText>
    </Card>
  );

  if (!isBand) {
    return (
      <SettingsPage title={t('aboutx.donateData.title')} tint="neutral" testID="donate-data">
        {intro}
        <Card testID="donate-data-demo">
          <AppText variant="body">{t('aboutx.donateData.demo')}</AppText>
        </Card>
      </SettingsPage>
    );
  }

  const finished = phase.kind === 'saved' || phase.kind === 'shareEach' || phase.kind === 'pickCancelled';
  if (finished) {
    const { built } = phase;
    const count = built.parts.length;
    return (
      <SettingsPage title={t('aboutx.donateData.title')} tint="neutral" testID="donate-data">
        <Card style={{ gap: spacing.sm }}>
          {phase.kind === 'saved' ? (
            <>
              <AppText variant="body">{count === 1 ? t('aboutx.donateData.savedOne') : t('aboutx.donateData.savedMany', { n: count })}</AppText>
              {count > MANY_FILES ? (
                <AppText variant="label" muted>
                  {t('aboutx.donateData.savedMore')}
                </AppText>
              ) : null}
            </>
          ) : null}
          {phase.kind === 'shareEach' ? <AppText variant="body">{t('aboutx.donateData.shareEachBody')}</AppText> : null}
          {phase.kind === 'pickCancelled' ? <AppText variant="body">{t('aboutx.donateData.pickCancelled')}</AppText> : null}
          {built.skippedDays.length > 0 ? (
            <AppText variant="label" muted>
              {t('aboutx.donateData.skipped', { days: built.skippedDays.map((d) => formatLongDay(d, language)).join(', ') })}
            </AppText>
          ) : null}
          {phase.kind === 'saved' && phase.githubFailed ? (
            <AppText variant="caption" color={colors.negative} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {t('aboutx.donateData.githubFailed')}
            </AppText>
          ) : null}
        </Card>
        {phase.kind === 'shareEach'
          ? built.parts.map((part) => (
              <Button
                key={part.fileName}
                label={t('aboutx.donateData.sharePart', { i: part.part, n: part.parts })}
                variant="secondary"
                icon="share"
                onPress={() => void shareDonationPart(built, part.fileName)}
                testID={`donate-data-share-${part.part}`}
              />
            ))
          : null}
        {phase.kind === 'pickCancelled' ? (
          <Button label={t('aboutx.donateData.saveFiles')} icon="export" onPress={() => void save(built)} testID="donate-data-save-again" />
        ) : (
          <Button
            label={t(phase.kind === 'saved' ? 'aboutx.donateData.openGithub' : 'aboutx.donateData.openGithubFirst')}
            icon="link"
            variant={phase.kind === 'saved' ? 'secondary' : 'primary'}
            onPress={() => void openGithub(built)}
            testID="donate-data-github"
          />
        )}
        <Button label={t('aboutx.donateData.done')} variant="tertiary" onPress={() => router.back()} testID="donate-data-done" />
      </SettingsPage>
    );
  }

  const anyOfficial = (days ?? []).some((d) => d.official);
  const allChosen = days !== null && days.length > 0 && selected.size === days.length;
  const first = chosen[0];
  const last = chosen[chosen.length - 1];
  const consentText =
    chosen.length > 1 && first !== undefined && last !== undefined
      ? t('aboutx.donateData.consentRange', { n: chosen.length, from: formatLongDay(first.day, language), to: formatLongDay(last.day, language) })
      : t('aboutx.donateData.consent');

  return (
    <SettingsPage title={t('aboutx.donateData.title')} tint="neutral" testID="donate-data">
      {intro}
      {days === null ? (
        <AppText variant="label" muted>
          {t('aboutx.donateData.loading')}
        </AppText>
      ) : days.length === 0 ? (
        <Card testID="donate-data-empty">
          <AppText variant="body">{t('aboutx.donateData.empty')}</AppText>
        </Card>
      ) : (
        <>
          <CapHeader title={t('aboutx.donateData.chooseDays')} />
          {!anyOfficial ? (
            <ListGroup>
              <ListRow
                icon={tile(colors, 'import', 'info')}
                title={t('aboutx.donateData.import')}
                subtitle={t('aboutx.donateData.importBody')}
                href="/settings/import"
                testID="donate-data-import"
              />
            </ListGroup>
          ) : null}
          <Card style={{ gap: 0 }}>
            <CheckRow
              label={t('aboutx.donateData.selectAll')}
              checked={allChosen}
              onChange={(next) => setSelected(next ? new Set(days.map((d) => d.day)) : new Set())}
              testID="donate-data-all"
            />
            {days.map((d) => {
              const slept = d.asleepS === null ? t('aboutx.donateData.noSleep') : t('aboutx.donateData.slept', { duration: formatDuration(t, d.asleepS) });
              return (
                <CheckRow
                  key={d.day}
                  label={formatLongDay(d.day, language)}
                  subtitle={d.official ? slept : `${slept} · ${t('aboutx.donateData.bandOnly')}`}
                  badge={d.official ? t('aboutx.donateData.officialBadge') : undefined}
                  checked={selected.has(d.day)}
                  onChange={(next) => toggle(d.day, next)}
                  testID={`donate-data-day-${d.day}`}
                />
              );
            })}
          </Card>
          <AppText variant="label" muted testID="donate-data-summary">
            {chosen.length === 0 ? t('aboutx.donateData.noneChosen') : summaryText(t, language, chosen)}
          </AppText>
          <CheckRow label={consentText} checked={consent} onChange={setConsent} testID="donate-data-consent" />
          {phase.kind === 'error' ? (
            <AppText variant="caption" color={colors.negative} accessibilityRole="alert" accessibilityLiveRegion="polite" testID="donate-data-error">
              {t(phase.message)}
            </AppText>
          ) : null}
          <Button
            label={t('aboutx.donateData.donate')}
            icon="export"
            disabled={busy || chosen.length === 0 || !consent}
            onPress={() => void donate()}
            testID="donate-data-go"
          />
          {busy ? (
            <View style={{ gap: spacing.sm }}>
              <AppText variant="body" accessibilityLiveRegion="polite" testID="donate-data-progress">
                {progressText(phase.progress)}
              </AppText>
              <Button label={t('aboutx.donateData.cancel')} variant="secondary" onPress={() => running.current?.abort()} testID="donate-data-cancel" />
            </View>
          ) : null}
        </>
      )}
    </SettingsPage>
  );
}
