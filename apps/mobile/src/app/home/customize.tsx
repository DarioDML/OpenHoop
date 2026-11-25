import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useAppData } from '@/data/context';
import { DASHBOARD_TILES, DEFAULT_DASHBOARD, type DashboardTile, type HomeHero } from '@/data/userData';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button, Segmented, Toggle } from '@/ui/controls';
import { Divider, Page } from '@/ui/daily/bits';
import { TILE_LABEL } from '@/ui/daily/metrics';
import { CapHeader } from '@/ui/ListGroup';
import { spacing } from '@/ui/theme';

function sameList(a: readonly DashboardTile[], b: readonly DashboardTile[]): boolean {
  return a.length === b.length && a.every((tile, i) => tile === b[i]);
}

export default function CustomizeScreen() {
  const { userData, updateUserData } = useAppData();
  const { t } = useT();
  const [opened] = useState<DashboardTile[]>(() => [...userData.dashboardTiles]);
  const tiles = userData.dashboardTiles;
  const hidden = DASHBOARD_TILES.filter((tile) => !tiles.includes(tile));

  const save = (next: DashboardTile[]): void => {
    if (next.length === 0 || sameList(next, tiles)) return;
    void updateUserData({ dashboardTiles: next, previousDashboardTiles: sameList(opened, next) ? userData.previousDashboardTiles : opened });
  };
  const move = (tile: DashboardTile, delta: -1 | 1): void => {
    const from = tiles.indexOf(tile);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= tiles.length) return;
    const next = [...tiles];
    next.splice(from, 1);
    next.splice(to, 0, tile);
    save(next);
  };
  const toggle = (tile: DashboardTile, on: boolean): void => {
    if (on) save([...tiles, tile]);
    else save(tiles.filter((x) => x !== tile));
  };
  const restore = userData.previousDashboardTiles;

  const arrow = (label: string, glyph: string, enabled: boolean, onPress: () => void, testID: string) => (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: enabled ? 1 : 0.3 }}>
      <AppText variant="title">{glyph}</AppText>
    </Pressable>
  );

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
      <CapHeader title={t('home.dashboardMetrics')} />
      <Card style={{ gap: 0, paddingVertical: spacing.sm }}>
        {tiles.map((tile, i) => (
          <View key={tile}>
            {i > 0 ? <Divider /> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: spacing.sm }}>
              <Toggle value onChange={(on) => toggle(tile, on)} label={t(TILE_LABEL[tile])} disabled={tiles.length === 1} testID={`toggle-${tile}`} />
              <AppText variant="body" style={{ flex: 1 }}>
                {t(TILE_LABEL[tile])}
              </AppText>
              {arrow(t('home.moveUp'), '↑', i > 0, () => move(tile, -1), `up-${tile}`)}
              {arrow(t('home.moveDown'), '↓', i < tiles.length - 1, () => move(tile, 1), `down-${tile}`)}
            </View>
          </View>
        ))}
        {hidden.map((tile) => (
          <View key={tile}>
            <Divider />
            <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56, gap: spacing.sm }}>
              <Toggle value={false} onChange={(on) => toggle(tile, on)} label={t(TILE_LABEL[tile])} testID={`toggle-${tile}`} />
              <AppText variant="body" muted style={{ flex: 1 }}>
                {t(TILE_LABEL[tile])}
              </AppText>
            </View>
          </View>
        ))}
      </Card>
      <AppText variant="caption" muted>
        {t('home.customizeHint')}
      </AppText>
      <View style={{ gap: spacing.sm }}>
        {restore ? (
          <Button
            testID="restore-layout"
            variant="secondary"
            label={t('home.restoreLayout')}
            onPress={() => void updateUserData({ dashboardTiles: restore, previousDashboardTiles: tiles })}
          />
        ) : null}
        <Button
          testID="reset-layout"
          variant="tertiary"
          label={t('home.resetLayout')}
          onPress={() => void updateUserData({ dashboardTiles: [...DEFAULT_DASHBOARD], previousDashboardTiles: sameList(tiles, DEFAULT_DASHBOARD) ? userData.previousDashboardTiles : [...tiles] })}
        />
      </View>
    </Page>
  );
}
