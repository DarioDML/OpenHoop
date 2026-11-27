import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { useAppData } from '@/data/context';
import { termLine } from '@/data/terms';
import { CATALOGUE, METRIC_CATEGORIES, type CatalogueItem, type MetricCategory, type MetricReading } from '@/data/healthDerived';
import type { TranslationKey } from '@/i18n';
import { useT, type TFunction } from '@/i18n/useT';
import { formatDuration, formatNumber } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { useExplain } from '@/ui/explain/ExplainProvider';
import { HealthPage } from '@/ui/health/HealthPage';
import { Icon } from '@/ui/Icon';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { ParityBadge } from '@/ui/ParityBadge';
import { fonts, radius, spacing, useTheme } from '@/ui/theme';
import { IconButton } from '@/ui/TopBar';
import type { Language } from '@/data/types';

const CATEGORY_LABEL: Record<MetricCategory, TranslationKey> = {
  readiness: 'health.metrics.cat.readiness',
  sleep: 'health.metrics.cat.sleep',
  load: 'health.metrics.cat.load',
  health: 'health.metrics.cat.health',
  raw: 'health.metrics.cat.raw',
};

function readingText(reading: MetricReading, t: TFunction, language: Language): string {
  if (reading.kind === 'none') return t('health.metrics.noData');
  if (reading.kind === 'duration') return formatDuration(t, reading.seconds);
  const number = formatNumber(reading.value, reading.decimals, language);
  return reading.unitKey ? `${number} ${t(reading.unitKey)}` : number;
}

function matches(item: CatalogueItem, query: string, t: TFunction): boolean {
  return query === '' || t(item.labelKey).toLowerCase().includes(query);
}

export default function MetricsScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { days, userData, profile } = useAppData();
  const explain = useExplain();
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLowerCase();
  const visible = CATALOGUE.filter((item) => matches(item, normalized, t));

  return (
    <HealthPage
      title={t('health.metrics.title')}
      testID="health-metrics"
      hero={
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
            minHeight: 52,
            paddingHorizontal: 14,
            borderRadius: radius.md,
            backgroundColor: colors.surface,
          }}>
          <Icon name="search" color={colors.textMuted} size={20} />
          <TextInput
            testID="metrics-search"
            accessibilityLabel={t('health.metrics.search')}
            placeholder={t('health.metrics.search')}
            placeholderTextColor={colors.textFaint}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            style={{ flex: 1, minHeight: 48, color: colors.text, fontSize: 16, fontFamily: fonts.regular }}
          />
        </View>
      }>
      {visible.length === 0 ? (
        <AppText variant="body" muted testID="metrics-none">
          {t('health.metrics.noMatch')}
        </AppText>
      ) : null}
      {METRIC_CATEGORIES.map((category) => {
        const items = visible.filter((item) => item.category === category);
        if (items.length === 0) return null;
        return (
          <ListGroup key={category} title={t(CATEGORY_LABEL[category])}>
            {items.map((item) => {
              const reading = item.read(days, userData.weightKg, profile);
              const term = item.term;
              const text = readingText(reading, t, language);
              const right =
                term === null ? (
                  item.level ? <ParityBadge level={item.level} /> : undefined
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {item.level ? <ParityBadge level={item.level} /> : null}
                    <IconButton
                      icon="info"
                      label={t('explain.whatIs', { name: t(item.labelKey) })}
                      onPress={() => explain.about({ term, index: days.length - 1, shown: { value: reading.kind === 'none' ? null : text, unit: null, reason: null } })}
                      testID={`metric-${item.id}-about`}
                    />
                  </View>
                );
              return (
                <ListRow
                  key={item.id}
                  testID={`metric-${item.id}`}
                  title={t(item.labelKey)}
                  subtitle={term === null ? undefined : t(termLine(term))}
                  value={text}
                  right={right}
                  href={item.href}
                />
              );
            })}
          </ListGroup>
        );
      })}
    </HealthPage>
  );
}
