import { useState } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { DASHBOARD_TILES, DEFAULT_DASHBOARD, HOME_SECTIONS, type DashboardTile, type HomeHero, type HomeSection } from '@/data/userData';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Button, Segmented } from '@/ui/controls';
import { Page } from '@/ui/daily/bits';
import { TILE_LABEL } from '@/ui/daily/metrics';
import { CapHeader } from '@/ui/ListGroup';
import { ReorderList } from '@/ui/ReorderList';
import { spacing, useTheme } from '@/ui/theme';

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

export default function CustomizeScreen() {
  const { userData, updateUserData } = useAppData();
  const { t } = useT();
  const { colors } = useTheme();
  const [openedTiles] = useState<DashboardTile[]>(() => [...userData.dashboardTiles]);
  const [openedSections] = useState<HomeSection[]>(() => [...userData.homeSections]);
  const [dragging, setDragging] = useState(false);
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
    <Page title={t('home.customize')} testID="customize" scrollEnabled={!dragging}>
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
      <ReorderList all={HOME_SECTIONS} shown={sections} label={(s) => t(SECTION_LABEL[s])} minimum={0} onChange={saveSections} onDragChange={setDragging} testPrefix="section-" />
      <AppText variant="caption" muted>
        {t('home.sectionsHint')}
      </AppText>
      <CapHeader title={t('home.dashboardMetrics')} />
      <ReorderList all={DASHBOARD_TILES} shown={tiles} label={(tile) => t(TILE_LABEL[tile])} minimum={1} onChange={saveTiles} onDragChange={setDragging} testPrefix="" />
      <AppText variant="caption" muted>
        {t('home.customizeHint')}
      </AppText>
      <View style={{ gap: spacing.sm }}>
        {canRestore ? <Button testID="restore-layout" variant="secondary" label={t('home.restoreLayout')} onPress={restore} /> : null}
        <Button testID="reset-layout" variant="secondary" label={t('home.resetLayout')} onPress={reset} style={{ backgroundColor: colors.surfaceAlt, borderWidth: 0 }} />
      </View>
    </Page>
  );
}
