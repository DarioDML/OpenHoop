import { router, type Href } from 'expo-router';
import { Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import { latestHeartRateDayIndex } from '@/data/healthDerived';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { formatNumber, todayIso } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Chip } from '@/ui/Chip';
import { HealthPage } from '@/ui/health/HealthPage';
import { HUB_TILE_IDS, hubTileText, type HubInput, type HubTileId } from '@/ui/health/hubTiles';
import { Icon, type IconName } from '@/ui/Icon';
import { ListGroup, ListRow } from '@/ui/ListGroup';
import { MetricLinkTile } from '@/ui/Tiles';
import { radius, spacing, useTheme, type ColorTokens } from '@/ui/theme';
import { IconButton } from '@/ui/TopBar';

interface TileSpec {
  icon: IconName;
  label: TranslationKey;
  href: Href;
  tone: (colors: ColorTokens) => { fg: string; bg: string };
  mg?: boolean;
}

const TILES: Readonly<Record<HubTileId, TileSpec>> = {
  bodyAge: { icon: 'heart', label: 'health.hub.bodyAge', href: '/health/body-age', tone: (c) => ({ fg: c.positive, bg: c.positiveSoft }) },
  vitals: { icon: 'check', label: 'health.vitals.title', href: '/health/vitals', tone: (c) => ({ fg: c.positive, bg: c.positiveSoft }) },
  stress: { icon: 'pulse', label: 'health.hub.stress', href: '/health/stress', tone: (c) => ({ fg: c.info, bg: c.infoSoft }) },
  ecg: { icon: 'pulse', label: 'health.hub.tile.ecg', href: '/health/ecg', tone: (c) => ({ fg: c.pink, bg: c.pinkSoft }), mg: true },
  cycle: { icon: 'calendar', label: 'health.hub.cycle', href: '/health/cycle', tone: (c) => ({ fg: c.pink, bg: c.pinkSoft }) },
  labs: { icon: 'flask', label: 'health.hub.tile.labs', href: '/health/labs', tone: (c) => ({ fg: c.positive, bg: c.positiveSoft }) },
  vo2max: { icon: 'lungs', label: 'health.hub.vo2max', href: '/health/vo2max', tone: (c) => ({ fg: c.positive, bg: c.positiveSoft }) },
  body: { icon: 'scale', label: 'health.hub.tile.body', href: '/health/body-composition', tone: (c) => ({ fg: c.textSoft, bg: c.surfaceAlt }) },
};

interface Entry {
  id: string;
  icon: IconName;
  title: TranslationKey;
  subtitle: TranslationKey;
  href: Href;
}

const MORE: readonly Entry[] = [
  { id: 'breathing', icon: 'wind', title: 'health.hub.breathing', subtitle: 'health.hub.breathingHint', href: '/health/breathing' },
  { id: 'journal', icon: 'journal', title: 'health.hub.journal', subtitle: 'health.hub.journalHint', href: '/journal' },
  { id: 'pillars', icon: 'target', title: 'health.hub.pillars', subtitle: 'health.hub.pillarsHint', href: '/health/pillar' },
];

function pairs<T>(items: readonly T[]): T[][] {
  const rows: T[][] = [];
  items.forEach((item, i) => {
    if (i % 2 === 0) rows.push([item]);
    else rows[rows.length - 1]?.push(item);
  });
  return rows;
}

export default function HealthScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { days, device, profile, userData, labResults, bodyMeasurements, cycle, ecgRecordings, settings } = useAppData();
  const isMg = device.model === 'MG';
  const input: HubInput = {
    days,
    profile,
    userData,
    labResults,
    bodyMeasurements,
    cycle,
    ecgRecordings,
    model: device.model,
    units: settings.units,
    today: todayIso(new Date(Date.now())),
  };
  const text = { t, language };
  const hr = days[latestHeartRateDayIndex(days)]?.heartRate;
  const mgBadge = { label: t('health.mg.badge'), color: colors.pink, background: colors.pinkSoft };

  return (
    <HealthPage
      title={t('tabs.health')}
      back={false}
      withTabBar
      testID="health-hub"
      right={<IconButton icon="file" label={t('health.hub.report')} onPress={() => router.push('/health/report')} color={colors.text} testID="health-report-button" />}
      hero={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('health.hub.findMetric')}
          onPress={() => router.push('/health/metrics')}
          testID="health-find-metric"
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            minHeight: 52,
            paddingHorizontal: spacing.lg,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: colors.borderStrong,
            backgroundColor: colors.surface,
            opacity: pressed ? 0.85 : 1,
          })}>
          <Icon name="search" color={colors.textMuted} size={20} />
          <AppText variant="lead" muted style={{ flex: 1 }}>
            {t('health.hub.findMetric')}
          </AppText>
        </Pressable>
      }>
      <View style={{ gap: spacing.md }} testID="health-tiles">
        {pairs(HUB_TILE_IDS).map((row) => (
          <View key={row.join('-')} style={{ flexDirection: 'row', gap: spacing.md }}>
            {row.map((id) => {
              const spec = TILES[id];
              const tone = spec.tone(colors);
              const tile = hubTileText(id, input, text);
              return (
                <View key={id} style={{ flex: 1, minWidth: 0 }}>
                  <MetricLinkTile
                    testID={`health-tile-${id}`}
                    icon={spec.icon}
                    iconColor={tone.fg}
                    iconBackground={tone.bg}
                    label={t(spec.label)}
                    value={tile.value}
                    missing={tile.missing}
                    caption={tile.caption}
                    href={spec.href}
                    badge={spec.mg ? mgBadge : undefined}
                  />
                </View>
              );
            })}
          </View>
        ))}
      </View>

      <ListGroup>
        <ListRow
          testID="health-entry-heart-rate"
          title={t('health.hub.heartRate')}
          subtitle={
            hr && hr.avg !== null
              ? t('health.hr.summary', {
                  min: formatNumber(hr.min ?? hr.avg, 0, language),
                  avg: formatNumber(hr.avg, 0, language),
                  max: formatNumber(hr.max ?? hr.avg, 0, language),
                })
              : t('health.hr.noData')
          }
          icon={{ icon: 'heart', color: colors.pink, background: colors.pinkSoft }}
          href="/health/heart-rate"
        />
        <ListRow
          testID="health-entry-blood-pressure"
          title={t('health.hub.bloodPressure')}
          subtitle={t('health.hub.bloodPressureHint')}
          icon={{ icon: 'drop', color: colors.pink, background: colors.pinkSoft }}
          right={isMg ? undefined : <Chip label={t('health.mg.badge')} tone="pink" small />}
          href="/health/blood-pressure"
        />
        <ListRow
          testID="health-entry-report"
          title={t('health.hub.report')}
          subtitle={t('health.hub.reportHint')}
          icon={{ icon: 'file', color: colors.textSoft, background: colors.surfaceAlt }}
          href="/health/report"
        />
      </ListGroup>

      <ListGroup title={t('health.hub.explore')}>
        {MORE.map((entry) => (
          <ListRow
            key={entry.id}
            testID={`health-entry-${entry.id}`}
            title={t(entry.title)}
            subtitle={t(entry.subtitle)}
            icon={{ icon: entry.icon, color: colors.textSoft, background: colors.surfaceAlt }}
            href={entry.href}
          />
        ))}
      </ListGroup>
    </HealthPage>
  );
}
