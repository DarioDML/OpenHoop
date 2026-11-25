import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import type { SyncPhase } from '@/data/types';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Icon } from '@/ui/Icon';
import { OnboardingPage } from '@/ui/manage/OnboardingPage';
import { NoticeCard } from '@/ui/NoticeCard';
import { Ring } from '@/ui/Ring';
import { spacing, useTheme } from '@/ui/theme';

const PHASE_ORDER: readonly SyncPhase[] = ['connecting', 'probing', 'transfer', 'compute'];

interface StepSpec {
  key: TranslationKey;
  startsAt: SyncPhase;
}

const STEPS: readonly StepSpec[] = [
  { key: 'onboarding.setup.stepInfo', startsAt: 'connecting' },
  { key: 'onboarding.setup.stepHistory', startsAt: 'transfer' },
  { key: 'onboarding.setup.stepCompute', startsAt: 'compute' },
];

type StepStatus = 'done' | 'active' | 'pending';

export default function SetupScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { sync, syncProgress, notice } = useAppData();
  const [finished, setFinished] = useState(false);
  const started = useRef(false);

  const run = async (): Promise<void> => {
    setFinished(false);
    await sync();
    setFinished(true);
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const failed = finished && notice !== null;
  const currentIndex = syncProgress === null ? -1 : PHASE_ORDER.indexOf(syncProgress.phase);

  const statusOf = (step: StepSpec, position: number): StepStatus => {
    if (finished && !failed) return 'done';
    if (syncProgress === null) return 'pending';
    const startIndex = PHASE_ORDER.indexOf(step.startsAt);
    const nextStart = STEPS[position + 1];
    const endIndex = nextStart ? PHASE_ORDER.indexOf(nextStart.startsAt) : PHASE_ORDER.length;
    if (currentIndex >= endIndex) return 'done';
    return currentIndex >= startIndex ? 'active' : 'pending';
  };

  const percent = syncProgress?.percent ?? null;
  const fraction = finished && !failed ? 1 : percent === null ? null : percent / 100;

  const primary = failed
    ? { label: t('onboarding.setup.retry'), onPress: () => void run(), testID: 'setup-retry' }
    : { label: t('common.continue'), onPress: () => router.push('/onboarding/wear'), disabled: !finished, testID: 'setup-continue' };

  return (
    <OnboardingPage
      step={9}
      hideBack
      title={t('onboarding.setup.title')}
      subtitle={t('onboarding.setup.subtitle')}
      primary={primary}
      tertiary={finished ? undefined : { label: t('onboarding.setup.background'), onPress: () => router.push('/onboarding/wear'), testID: 'setup-background' }}>
      <NoticeCard />
      <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
        <Ring fraction={fraction} color={colors.accent} size={160} strokeWidth={10} testID="setup-ring">
          <AppText variant="display" numeric>
            {fraction === null ? '…' : `${Math.round(fraction * 100)}%`}
          </AppText>
          <AppText variant="caption" muted>
            {syncProgress ? t(`sync.phase.${syncProgress.phase}`) : finished ? (failed ? t('onboarding.setup.failed') : t('onboarding.setup.finished')) : t('sync.phase.connecting')}
          </AppText>
        </Ring>
      </View>
      <Card style={{ gap: spacing.lg }}>
        {STEPS.map((step, position) => {
          const status = statusOf(step, position);
          return (
            <View key={step.key} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }} testID={`setup-step-${position}`}>
              <Icon name={status === 'done' ? 'check' : status === 'active' ? 'sync' : 'clock'} color={status === 'done' ? colors.positive : status === 'active' ? colors.accent : colors.textFaint} size={20} />
              <AppText variant="body" color={status === 'pending' ? colors.textMuted : colors.text} style={{ flex: 1 }}>
                {t(step.key)}
              </AppText>
            </View>
          );
        })}
      </Card>
      <AppText variant="label" muted>
        {t('onboarding.setup.noFirmware')}
      </AppText>
    </OnboardingPage>
  );
}
