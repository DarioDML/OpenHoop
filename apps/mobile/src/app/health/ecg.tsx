import type { Wrist } from '@openhoop/protocol';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, View } from 'react-native';

import { useAppData, useEcgLive } from '@/data/context';
import { ecgContact, type EcgContact } from '@/data/ecg';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import type { ChipTone } from '@/ui/Chip';
import { Button, Segmented } from '@/ui/controls';
import { Callout } from '@/ui/health/Callout';
import { EcgPanel, EcgTrace } from '@/ui/health/EcgTrace';
import { HealthPage } from '@/ui/health/HealthPage';
import { useLayout } from '@/ui/layout';
import { LevelNote } from '@/ui/LevelNote';
import { Num } from '@/ui/Num';
import { Ring } from '@/ui/Ring';
import { GridTile, StatGrid } from '@/ui/StatGrid';
import { StateCard } from '@/ui/StateCard';
import { spacing, useTheme } from '@/ui/theme';
import { IconButton } from '@/ui/TopBar';

const DURATION_S = 30;

const CONTACT: Readonly<Record<EcgContact, { value: TranslationKey; chip: TranslationKey | null; tone: ChipTone }>> = {
  checking: { value: 'ecg.signal.checking', chip: null, tone: 'neutral' },
  none: { value: 'ecg.signal.none', chip: 'ecg.signal.chip.none', tone: 'negative' },
  weak: { value: 'ecg.signal.weak', chip: 'ecg.signal.chip.weak', tone: 'warning' },
  good: { value: 'ecg.signal.good', chip: 'ecg.signal.chip.good', tone: 'positive' },
};

export default function EcgScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const layout = useLayout();
  const { device, ecgActions, ecgRecordings, ecgWrist } = useAppData();
  const live = useEcgLive();
  const [wrist, setWrist] = useState<Wrist>(ecgWrist);
  const cancelled = useRef(false);
  const isMg = device.model === 'MG';
  const busy = device.connection === 'syncing' || device.connection === 'connecting';

  const start = async (): Promise<void> => {
    cancelled.current = false;
    const id = await ecgActions.start(wrist);
    if (id === null) return;
    if (cancelled.current) {
      await ecgActions.remove(id);
      return;
    }
    router.push({ pathname: '/health/ecg-result', params: { id: String(id) } });
  };

  const cancel = (): void => {
    cancelled.current = true;
    ecgActions.stop();
  };

  const seconds = Math.min(DURATION_S, Math.floor(live.elapsedMs / 1000));
  const contact = CONTACT[ecgContact(live.tail, live.quality)];
  const ringSize = layout.narrow ? 104 : 128;
  const showHow = (): void => Alert.alert(t('ecg.howTitle'), t('ecg.howBody'));

  const hero = (
    <View style={{ flexDirection: layout.narrow ? 'column' : 'row', alignItems: layout.narrow ? 'flex-start' : 'center', gap: spacing.xl }}>
      <Ring size={ringSize} strokeWidth={9} fraction={live.active ? seconds / DURATION_S : 0} color={colors.ecg} testID="ecg-countdown">
        <Num size={layout.narrow ? 40 : 48} testID="ecg-countdown-value">
          {live.active ? String(seconds) : String(DURATION_S)}
        </Num>
        <AppText variant="capSmall" muted>
          {live.active ? t('ecg.hero.of', { total: DURATION_S }) : t('ecg.hero.seconds')}
        </AppText>
      </Ring>
      <View style={{ flex: layout.narrow ? undefined : 1, gap: spacing.sm }}>
        <AppText variant="cardTitle" accessibilityRole="header" style={{ fontSize: 18, lineHeight: 24 }}>
          {live.active ? t('ecg.hero.activeTitle') : t('ecg.hero.idleTitle')}
        </AppText>
        <AppText variant="body" color={colors.textSoft}>
          {live.active ? t('ecg.hero.activeBody') : t('health.ecg.body')}
        </AppText>
      </View>
    </View>
  );

  return (
    <HealthPage
      title={t('health.ecg.title')}
      tint="heart"
      testID="health-ecg"
      right={<IconButton icon="info" label={t('ecg.howTitle')} onPress={showHow} testID="ecg-how-open" />}
      hero={hero}>
      {!isMg ? <StateCard icon="band" tone="pink" title={t('health.mg.needsTitle')} body={t('health.mg.needsBody')} testID="needs-mg" /> : null}

      {live.active ? (
        <View testID="ecg-live" style={{ gap: spacing.md }}>
          <AppText variant="caption" muted testID="ecg-elapsed">
            {t('ecg.recording', { seconds, total: DURATION_S })}
          </AppText>
          <EcgPanel>
            {live.samples === 0 ? (
              <View style={{ height: 160, justifyContent: 'center', paddingHorizontal: spacing.md }}>
                <AppText variant="label" muted style={{ textAlign: 'center' }}>
                  {t('ecg.waiting')}
                </AppText>
              </View>
            ) : (
              <EcgTrace samples={live.tail} height={160} grid testID="ecg-live-trace" />
            )}
          </EcgPanel>
          <StatGrid>
            <GridTile label={t('ecg.tile.samples')} value={String(live.samples)} caption={t('ecg.tile.samplesCaption')} testID="ecg-samples" />
            <GridTile
              label={t('ecg.tile.signal')}
              value={t(contact.value)}
              chip={contact.chip === null ? null : { label: t(contact.chip), tone: contact.tone }}
              testID="ecg-signal"
            />
          </StatGrid>
          <AppText variant="caption" muted testID="ecg-signal-note">
            {t('ecg.signal.note')}
          </AppText>
          {isMg ? <Callout icon="band" title={t('ecg.mgReady.title')} body={t('ecg.mgReady.body')} testID="ecg-mg-ready" /> : null}
          <Button label={t('ecg.cancel')} variant="secondary" onPress={cancel} testID="ecg-cancel" />
          <Button label={t('ecg.stopKeep')} variant="tertiary" onPress={() => ecgActions.stop()} testID="ecg-stop" />
        </View>
      ) : (
        <>
          <Card style={{ gap: spacing.sm }} testID="ecg-how">
            <AppText variant="bodyStrong">{t('ecg.howTitle')}</AppText>
            <AppText variant="body" muted>
              {t('ecg.howBody')}
            </AppText>
          </Card>

          <View style={{ gap: spacing.sm }}>
            <AppText variant="capSmall" muted>
              {t('ecg.wrist')}
            </AppText>
            <Segmented<Wrist>
              value={wrist}
              onChange={setWrist}
              options={[
                { value: 'left', label: t('ecg.wristLeft') },
                { value: 'right', label: t('ecg.wristRight') },
              ]}
              testID="ecg-wrist"
            />
          </View>

          {isMg ? <Callout icon="band" title={t('ecg.mgReady.title')} body={t('ecg.mgReady.body')} testID="ecg-mg-ready" /> : null}

          <Button label={t('ecg.start')} onPress={() => void start()} disabled={!isMg || busy} testID="ecg-start" />

          {ecgRecordings.length > 0 ? (
            <Button label={t('ecg.history', { count: ecgRecordings.length })} variant="tertiary" onPress={() => router.push('/health/ecg-result')} testID="ecg-history" />
          ) : null}
        </>
      )}

      <LevelNote level="D" text={t('ecg.levelD')} />
      <AppText variant="caption" muted testID="mg-disclaimer">
        {t('health.mg.disclaimer')}
      </AppText>
    </HealthPage>
  );
}
