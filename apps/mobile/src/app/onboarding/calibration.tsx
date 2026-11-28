import { router } from 'expo-router';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { MIN_BASELINE_NIGHTS } from '@/data/derived';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Chip } from '@/ui/Chip';
import { Icon, type IconName } from '@/ui/Icon';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { OnboardingPage } from '@/ui/manage/OnboardingPage';
import { tile, type TileTone } from '@/ui/manage/tiles';
import { radius, spacing, useTheme } from '@/ui/theme';

const MILESTONES: ReadonlyArray<{ night: number; key: TranslationKey; icon: IconName; tone: TileTone }> = [
  { night: 1, key: 'onboarding.calibration.night1', icon: 'moon', tone: 'purple' },
  { night: 3, key: 'onboarding.calibration.night3', icon: 'heart', tone: 'gold' },
  { night: 4, key: 'onboarding.calibration.night4', icon: 'check', tone: 'positive' },
];

export default function CalibrationScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { days, updateUserData } = useAppData();

  const nights = days.filter((day) => day.sleep.asleepS !== null).length;
  const done = Math.min(MIN_BASELINE_NIGHTS, nights);
  const left = MIN_BASELINE_NIGHTS - done;

  const finish = async (): Promise<void> => {
    if (!(await updateUserData({ onboardingDone: true }))) return;
    router.replace('/');
  };

  return (
    <OnboardingPage
      screen="calibration"
      title={t('onboarding.calibration.title', { count: MIN_BASELINE_NIGHTS })}
      subtitle={t('onboarding.calibration.subtitle')}
      primary={{ label: t('onboarding.calibration.home'), onPress: () => void finish(), testID: 'calibration-finish' }}>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {Array.from({ length: MIN_BASELINE_NIGHTS }, (_, index) => {
          const n = index + 1;
          const recorded = n <= done;
          return (
            <View
              key={n}
              accessible
              accessibilityLabel={t(recorded ? 'onboarding.calibration.nightDone' : 'onboarding.calibration.nightTodo', { n })}
              testID={`night-${n}`}
              style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md, paddingBottom: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface }}>
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: recorded ? colors.pink : 'transparent',
                  borderWidth: recorded ? 0 : 2,
                  borderColor: colors.pinkSoft,
                }}>
                {recorded ? (
                  <Icon name="check" color={colors.primaryOn} size={16} strokeWidth={2.5} />
                ) : (
                  <AppText variant="label" muted numeric>
                    {n}
                  </AppText>
                )}
              </View>
              <View style={{ alignSelf: 'stretch', marginHorizontal: spacing.sm, height: 6, borderRadius: radius.pill, backgroundColor: recorded ? colors.pink : colors.pinkSoft }} />
              <AppText variant="caption" muted numberOfLines={1}>
                {t('onboarding.calibration.night', { n })}
              </AppText>
            </View>
          );
        })}
      </View>
      <AppText variant="bodyStrong" testID="calibration-status">
        {left === 0 ? t('onboarding.calibration.ready') : left === 1 ? t('onboarding.calibration.leftOne') : t('onboarding.calibration.left', { count: left })}
      </AppText>
      <ListGroup>
        {MILESTONES.map((milestone) => (
          <ListRow
            key={milestone.night}
            icon={tile(colors, milestone.icon, milestone.tone)}
            title={t('onboarding.calibration.night', { n: milestone.night })}
            subtitle={t(milestone.key)}
            chip={done >= milestone.night ? <Chip label={t('onboarding.calibration.reached')} tone="positive" small /> : null}
            chevron={false}
            testID={`milestone-${milestone.night}`}
          />
        ))}
      </ListGroup>
    </OnboardingPage>
  );
}
