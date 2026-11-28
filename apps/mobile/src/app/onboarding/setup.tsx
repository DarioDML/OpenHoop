import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { parseBandConfig } from '@/data/bandConfig';
import { useAppData, useSyncProgress } from '@/data/context';
import { backedUpSince, isOnBand, SETUP_STEPS, setupStepStatuses, type SetupStage, type SetupStepId, type SetupStepStatus } from '@/data/onboarding';
import type { SyncProgressView } from '@/data/types';
import type { TranslationKey } from '@/i18n';
import { useT, type TFunction } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Icon } from '@/ui/Icon';
import { ListGroup } from '@/ui/ListGroup';
import { DoneBadge } from '@/ui/manage/DoneBadge';
import { OnboardingPage } from '@/ui/manage/OnboardingPage';
import { NoticeCard } from '@/ui/NoticeCard';
import { Num } from '@/ui/Num';
import { Ring } from '@/ui/Ring';
import { radius, spacing, useTheme } from '@/ui/theme';

const STEP_KEYS: Readonly<Record<SetupStepId, TranslationKey>> = {
  info: 'onboarding.setup.stepInfo',
  backup: 'onboarding.setup.stepBackup',
  history: 'onboarding.setup.stepHistory',
  compute: 'onboarding.setup.stepCompute',
};

type Run = 'backup' | 'sync' | 'ended';

function pagesText(t: TFunction, progress: SyncProgressView | null, fmt: (value: number) => string): string | null {
  const done = progress?.pagesRead ?? null;
  const total = progress?.pagesTotal ?? null;
  if (done === null || total === null) return null;
  const days = progress?.historyDays ?? null;
  const params = { done: fmt(done), total: fmt(total) };
  if (days === null) return t('onboarding.setup.pages', params);
  return days === 1 ? t('onboarding.setup.pagesDay', params) : t('onboarding.setup.pagesDays', { ...params, days: fmt(days) });
}

function StepIcon({ status, step }: { status: SetupStepStatus; step: SetupStepId }) {
  const { colors } = useTheme();
  if (status === 'done') return <DoneBadge size={24} />;
  if (status === 'failed') return <Icon name="alert" color={colors.warning} size={24} />;
  if (status === 'active') {
    return (
      <View style={{ width: 24, height: 24, borderRadius: radius.pill, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={step === 'history' ? 'download' : 'sync'} color={colors.accent} size={14} />
      </View>
    );
  }
  return <View style={{ width: 24, height: 24, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.textFaint }} />;
}

export default function SetupScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { sync, readBandConfig, notice, device } = useAppData();
  const syncProgress = useSyncProgress();
  const [run, setRun] = useState<Run>('backup');
  const [startedS, setStartedS] = useState<number | null>(null);
  const [reachedBand, setReachedBand] = useState(false);
  const started = useRef(false);

  const start = async (): Promise<void> => {
    setReachedBand(false);
    setStartedS(Math.floor(Date.now() / 1000));
    setRun('backup');
    await readBandConfig();
    setRun('sync');
    await sync();
    setRun('ended');
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const phase = syncProgress?.phase ?? null;
  const onBand = isOnBand(device.connection, phase);
  useEffect(() => {
    if (run !== 'ended' && onBand) setReachedBand(true);
  }, [run, onBand]);

  const config = parseBandConfig(device.configSnapshot);
  const backupDone = backedUpSince(config.status === 'ok' ? config.snapshot.readAt : null, startedS);
  const stage: SetupStage = run === 'ended' ? (notice === null ? 'finished' : 'failed') : run;
  const statuses = setupStepStatuses({ stage, backupDone, reachedBand: reachedBand || backupDone, connection: device.connection, phase });
  const fmt = (value: number): string => formatNumber(value, 0, language);
  const pages = pagesText(t, syncProgress, fmt);

  const percent = syncProgress?.percent ?? null;
  const fraction = stage === 'finished' ? 1 : phase === 'transfer' && percent !== null ? percent / 100 : null;
  const ringKey: TranslationKey =
    stage === 'finished'
      ? 'onboarding.setup.finished'
      : stage === 'failed'
        ? 'onboarding.setup.failed'
        : stage === 'backup'
          ? onBand
            ? 'onboarding.setup.ring.backup'
            : phase === 'probing'
              ? 'onboarding.setup.ring.probing'
              : 'onboarding.setup.ring.connecting'
          : `onboarding.setup.ring.${phase ?? 'connecting'}`;

  const primary =
    stage === 'failed'
      ? { label: t('onboarding.setup.retry'), onPress: () => void start(), testID: 'setup-retry' }
      : stage === 'finished'
        ? { label: t('common.continue'), onPress: () => router.push('/onboarding/wear'), testID: 'setup-continue' }
        : { label: t('onboarding.setup.background'), onPress: () => router.push('/onboarding/wear'), testID: 'setup-background' };

  return (
    <OnboardingPage screen="setup" hideBack title={t('onboarding.setup.title')} subtitle={t('onboarding.setup.subtitle')} primary={primary}>
      <NoticeCard />
      <View style={{ alignItems: 'center' }}>
        <Ring fraction={fraction} color={colors.accent} size={180} strokeWidth={10} testID="setup-ring">
          <Num size={64} unit={fraction === null ? undefined : '%'} unitSize={28} testID="setup-percent">
            {fraction === null ? '…' : String(Math.round(fraction * 100))}
          </Num>
          <AppText variant="cap" muted style={{ textAlign: 'center' }} testID="setup-phase">
            {t(ringKey)}
          </AppText>
        </Ring>
      </View>
      <ListGroup>
        {SETUP_STEPS.map((step) => {
          const status = statuses[step];
          const subtitle =
            step === 'history' && status === 'active' && pages !== null
              ? pages
              : step === 'backup' && status === 'failed'
                ? t('onboarding.setup.backupFailed')
                : null;
          return (
            <View
              key={step}
              testID={`setup-step-${step}`}
              accessible
              accessibilityLabel={subtitle === null ? t(STEP_KEYS[step]) : `${t(STEP_KEYS[step])}, ${subtitle}`}
              accessibilityState={{ busy: status === 'active', checked: status === 'done' }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: subtitle === null ? 56 : 68, paddingVertical: spacing.sm }}>
              <StepIcon status={status} step={step} />
              <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
                <AppText variant="body" color={status === 'pending' ? colors.textMuted : colors.text} style={{ fontWeight: '500' }}>
                  {t(STEP_KEYS[step])}
                </AppText>
                {subtitle === null ? null : (
                  <AppText variant="label" muted testID={`setup-step-${step}-detail`}>
                    {subtitle}
                  </AppText>
                )}
              </View>
            </View>
          );
        })}
      </ListGroup>
      {stage === 'finished' && device.lastSyncCounts !== null ? (
        <Card style={{ gap: spacing.sm }} testID="setup-counts">
          <AppText variant="body">
            {device.lastSyncCounts.saved > 0 ? t('onboarding.setup.saved', { count: device.lastSyncCounts.saved }) : t('onboarding.setup.savedNone')}
          </AppText>
          {device.lastSyncCounts.discarded > 0 ? (
            <AppText variant="label" color={colors.warning} testID="setup-discarded">
              {t('onboarding.setup.discarded', { count: device.lastSyncCounts.discarded })}
            </AppText>
          ) : null}
        </Card>
      ) : null}
      <AppText variant="label" muted testID="setup-firmware">
        {device.firmware === null ? t('onboarding.setup.firmwareUnknown') : t('onboarding.setup.firmware', { version: device.firmware })}
      </AppText>
    </OnboardingPage>
  );
}
