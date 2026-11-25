import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { latestValue } from '@/data/healthDerived';
import type { MetricKey } from '@/data/derived';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { formatNumber } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { NotBuilt } from '@/ui/NotBuilt';
import { HealthPage } from '@/ui/health/HealthPage';
import { Icon } from '@/ui/Icon';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { radius, spacing, useTheme } from '@/ui/theme';

interface ChipSpec {
  key: MetricKey;
  labelKey: TranslationKey;
  unitKey: TranslationKey | null;
  decimals: number;
}

const CHIPS: readonly ChipSpec[] = [
  { key: 'readiness', labelKey: 'score.readiness', unitKey: null, decimals: 0 },
  { key: 'hrv', labelKey: 'metric.hrv', unitKey: 'unit.ms', decimals: 0 },
  { key: 'restingHr', labelKey: 'metric.restingHr', unitKey: 'unit.bpm', decimals: 0 },
];

export default function CoachScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { days } = useAppData();
  const chips = CHIPS.map((spec) => ({ spec, latest: latestValue(days, spec.key) })).filter((c) => c.latest !== null);

  return (
    <HealthPage
      title={t('coach.title')}
      tint="coach"
      testID="coach"
      hero={
        <AppText variant="lead" muted>
          {t('coach.subtitle')}
        </AppText>
      }>
      {chips.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }} testID="coach-chips">
          {chips.map(({ spec, latest }) => (
            <View key={spec.key} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: colors.surface }}>
              <AppText variant="label" soft numeric>
                {`${t(spec.labelKey)} ${latest ? formatNumber(latest.value, spec.decimals, language) : ''}${spec.unitKey ? ` ${t(spec.unitKey)}` : ''}`}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}
      <NotBuilt issue="coach" body={t('coach.notBuilt')} />
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, opacity: 0.5 }} testID="coach-composer">
        <AppText variant="body" muted style={{ flex: 1 }}>
          {t('coach.composer')}
        </AppText>
        <Icon name="send" color={colors.textMuted} size={20} />
      </Card>
      <ListGroup>
        <ListRow title={t('coach.history.title')} icon={{ icon: 'clock', color: colors.textSoft, background: colors.surfaceAlt }} href="/coach/history" testID="coach-link-history" />
        <ListRow title={t('coach.memory.title')} icon={{ icon: 'layers', color: colors.textSoft, background: colors.surfaceAlt }} href="/coach/memory" testID="coach-link-memory" />
        <ListRow title={t('coach.checkIn.title')} icon={{ icon: 'bell', color: colors.textSoft, background: colors.surfaceAlt }} href="/coach/check-in" testID="coach-link-check-in" />
        <ListRow title={t('coach.settings.title')} icon={{ icon: 'settings', color: colors.textSoft, background: colors.surfaceAlt }} href="/coach/settings" testID="coach-link-settings" />
      </ListGroup>
    </HealthPage>
  );
}
