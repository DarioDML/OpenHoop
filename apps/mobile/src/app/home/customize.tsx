import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import { DASHBOARD_TILES, DEFAULT_DASHBOARD, HOME_SECTIONS, type DashboardTile, type HomeHero, type HomeSection } from '@/data/userData';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button, Segmented, Toggle } from '@/ui/controls';
import { Divider, Page } from '@/ui/daily/bits';
import { TILE_LABEL } from '@/ui/daily/metrics';
import { CapHeader } from '@/ui/ListGroup';
import { spacing } from '@/ui/theme';

const SECTION_LABEL: Readonly<Record<HomeSection, TranslationKey>> = {
  summary: 'home.section.summary',
  brief: 'home.section.brief',
  coach: 'home.section.coach',
  live: 'home.section.live',
  myDay: 'home.section.myDay',
  week: 'home.section.week',
  tonight: 'home.section.tonight',
  dashboard: 'home.section.dashboard',
};

function sameList<T extends string>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}

function moved<T extends string>(list: readonly T[], item: T, delta: -1 | 1): T[] | null {
  const from = list.indexOf(item);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= list.length) return null;
  const next = [...list];
  next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

interface OrderListProps<T extends string> {
  all: readonly T[];
  shown: readonly T[];
  label: (item: T) => string;
  minimum: number;
  onChange: (next: T[]) => void;
  testPrefix: string;
}

function OrderList<T extends string>({ all, shown, label, minimum, onChange, testPrefix }: OrderListProps<T>) {
  const { t } = useT();
  const hidden = all.filter((item) => !shown.includes(item));
  const arrow = (text: string, glyph: string, enabled: boolean, onPress: () => void, testID: string) => (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={text}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: enabled ? 1 : 0.3 }}>
      <AppText variant="title">{glyph}</AppText>
    </Pressable>
  );
  const move = (item: T, delta: -1 | 1): void => {
    const next = moved(shown, item, delta);
    if (next) onChange(next);
  };
  return (
    <Card style={{ gap: 0, paddingVertical: spacing.sm }}>
      {shown.map((item, i) => (
        <View key={item}>
          {i > 0 ? <Divider /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: spacing.sm }}>
            <Toggle
              value
              onChange={() => onChange(shown.filter((x) => x !== item))}
              label={label(item)}
              disabled={shown.length <= minimum}
              testID={`${testPrefix}toggle-${item}`}
            />
            <AppText variant="body" style={{ flex: 1 }}>
              {label(item)}
            </AppText>
            {arrow(t('home.moveUp'), '↑', i > 0, () => move(item, -1), `${testPrefix}up-${item}`)}
            {arrow(t('home.moveDown'), '↓', i < shown.length - 1, () => move(item, 1), `${testPrefix}down-${item}`)}
          </View>
        </View>
      ))}
      {hidden.map((item, i) => (
        <View key={item}>
          {shown.length > 0 || i > 0 ? <Divider /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: spacing.sm }}>
            <Toggle value={false} onChange={() => onChange([...shown, item])} label={label(item)} testID={`${testPrefix}toggle-${item}`} />
            <AppText variant="body" muted style={{ flex: 1 }}>
              {label(item)}
            </AppText>
          </View>
        </View>
      ))}
    </Card>
  );
}

export default function CustomizeScreen() {
  const { userData, updateUserData } = useAppData();
  const { t } = useT();
  const [openedTiles] = useState<DashboardTile[]>(() => [...userData.dashboardTiles]);
  const [openedSections] = useState<HomeSection[]>(() => [...userData.homeSections]);
  const tiles = userData.dashboardTiles;
  const sections = userData.homeSections;

  const saveTiles = (next: DashboardTile[]): void => {
    if (next.length === 0 || sameList(next, tiles)) return;
    void updateUserData({ dashboardTiles: next, previousDashboardTiles: sameList(openedTiles, next) ? userData.previousDashboardTiles : openedTiles });
  };
  const saveSections = (next: HomeSection[]): void => {
    if (sameList(next, sections)) return;
    void updateUserData({ homeSections: next, previousHomeSections: sameList(openedSections, next) ? userData.previousHomeSections : openedSections });
  };
  const restoreTiles = userData.previousDashboardTiles;
  const restoreSections = userData.previousHomeSections;
  const canRestore = restoreTiles !== null || restoreSections !== null;
  const restore = (): void => {
    void updateUserData({
      ...(restoreTiles ? { dashboardTiles: restoreTiles, previousDashboardTiles: tiles } : null),
      ...(restoreSections ? { homeSections: restoreSections, previousHomeSections: sections } : null),
    });
  };
  const reset = (): void => {
    void updateUserData({
      dashboardTiles: [...DEFAULT_DASHBOARD],
      previousDashboardTiles: sameList(tiles, DEFAULT_DASHBOARD) ? userData.previousDashboardTiles : [...tiles],
      homeSections: [...HOME_SECTIONS],
      previousHomeSections: sameList(sections, HOME_SECTIONS) ? userData.previousHomeSections : [...sections],
    });
  };

  return (
    <Page title={t('home.customize')} testID="customize">
      <CapHeader title={t('home.heroStyle')} />
      <Segmented<HomeHero>
        testID="hero-style"
        value={userData.homeHero}
        onChange={(homeHero) => void updateUserData({ homeHero })}
        options={[
          { value: 'classic', label: t('home.heroClassic') },
          { value: 'compact', label: t('home.heroCompact') },
        ]}
      />
      <CapHeader title={t('home.sections')} />
      <OrderList all={HOME_SECTIONS} shown={sections} label={(s) => t(SECTION_LABEL[s])} minimum={0} onChange={saveSections} testPrefix="section-" />
      <AppText variant="caption" muted>
        {t('home.sectionsHint')}
      </AppText>
      <CapHeader title={t('home.dashboardMetrics')} />
      <OrderList all={DASHBOARD_TILES} shown={tiles} label={(tile) => t(TILE_LABEL[tile])} minimum={1} onChange={saveTiles} testPrefix="" />
      <AppText variant="caption" muted>
        {t('home.customizeHint')}
      </AppText>
      <View style={{ gap: spacing.sm }}>
        {canRestore ? <Button testID="restore-layout" variant="secondary" label={t('home.restoreLayout')} onPress={restore} /> : null}
        <Button testID="reset-layout" variant="tertiary" label={t('home.resetLayout')} onPress={reset} />
      </View>
    </Page>
  );
}
