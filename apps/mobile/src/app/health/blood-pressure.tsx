import type { CuffReading } from '@openhoop/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { useAppData } from '@/data/context';
import { shareCuffCsv } from '@/data/cuffShare';
import { useT } from '@/i18n/useT';
import { deviceTzOffsetS, todayIsoDate, unixToIsoDate } from '@/lib/dates';
import { formatClock, formatShortDay } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/controls';
import { Callout } from '@/ui/health/Callout';
import { CenteredIntro } from '@/ui/health/CenteredIntro';
import { CheckList } from '@/ui/health/CheckList';
import { HealthPage } from '@/ui/health/HealthPage';
import { Icon } from '@/ui/Icon';
import { LevelNote } from '@/ui/LevelNote';
import { CapHeader, ListGroup, ListRow } from '@/ui/ListGroup';
import { ToggleRow } from '@/ui/manage/rows';
import { spacing, useTheme } from '@/ui/theme';

const SHOWN = 20;

function tzOf(unixS: number): number {
  return deviceTzOffsetS(new Date(unixS * 1000));
}

export default function BloodPressureScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { userData, updateUserData, cuffReadings, removeCuffReading } = useAppData();
  const [showAll, setShowAll] = useState(false);
  const [exporting, setExporting] = useState(false);
  const on = userData.cuffLog;
  const shown = showAll ? cuffReadings : cuffReadings.slice(0, SHOWN);

  const when = (reading: CuffReading): string => {
    const day = unixToIsoDate(reading.t, tzOf(reading.t));
    return `${day === todayIsoDate() ? t('ecg.today') : formatShortDay(day, language)} ${formatClock(reading.t, tzOf(reading.t))}`;
  };

  const detail = (reading: CuffReading): string => {
    const cuff = t('health.bloodPressure.cuffValue', { systolic: reading.systolic, diastolic: reading.diastolic });
    return reading.pulse === null ? cuff : `${cuff} · ${t('health.bloodPressure.pulseValue', { bpm: reading.pulse })}`;
  };

  const askRemove = (reading: CuffReading): void => {
    Alert.alert(t('health.bloodPressure.deleteTitle'), `${when(reading)} · ${detail(reading)}`, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('health.bloodPressure.delete'), style: 'destructive', onPress: () => void removeCuffReading(reading.id) },
    ]);
  };

  const exportCsv = async (): Promise<void> => {
    setExporting(true);
    try {
      await shareCuffCsv(cuffReadings, tzOf, Math.floor(Date.now() / 1000));
    } catch {
      Alert.alert(t('ecg.shareFailed'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <HealthPage title={t('health.bloodPressure.title')} tint="heart" testID="health-blood-pressure">
      <CenteredIntro
        icon="lock"
        iconColor={colors.pink}
        iconBackground={colors.pinkSoft}
        heading={t('health.notOffered.title')}
        body={t('health.bloodPressure.notOffered')}
        testID="not-offered"
      />
      <Card testID="cuff-log-card">
        <ToggleRow
          title={t('health.bloodPressure.logTitle')}
          subtitle={t('health.bloodPressure.logBody')}
          value={on}
          onChange={(cuffLog) => void updateUserData({ cuffLog })}
          testID="cuff-log-toggle"
        />
      </Card>

      <Callout icon="info" title={t('health.bloodPressure.noEstimateTitle')} body={t('health.bloodPressure.noEstimateBody')} testID="cuff-no-estimate" />

      {on ? (
        <View style={{ gap: spacing.sm }} testID="cuff-readings">
          <CapHeader title={t('health.bloodPressure.readingsTitle')} />
          {cuffReadings.length === 0 ? (
            <Card>
              <AppText variant="body" muted testID="cuff-empty">
                {t('health.bloodPressure.empty')}
              </AppText>
            </Card>
          ) : (
            <ListGroup>
              {shown.map((reading) => (
                <ListRow
                  key={reading.id}
                  testID={`cuff-reading-${reading.id}`}
                  icon={{ icon: 'drop', color: colors.pink, background: colors.pinkSoft }}
                  title={when(reading)}
                  subtitle={`${detail(reading)} · ${t('health.bloodPressure.ownEntry')}`}
                  onPress={() => askRemove(reading)}
                  right={<Icon name="trash" color={colors.textMuted} size={18} />}
                  chevron={false}
                />
              ))}
            </ListGroup>
          )}
          {!showAll && cuffReadings.length > SHOWN ? (
            <Button label={t('health.bloodPressure.showAll', { count: cuffReadings.length })} variant="tertiary" onPress={() => setShowAll(true)} testID="cuff-show-all" />
          ) : null}
          <Button label={t('health.bloodPressure.add')} icon="plus" onPress={() => router.push('/health/bp-calibration')} testID="cuff-add" />
          <LevelNote level="D" text={t('health.bloodPressure.levelNote')} />
          <Button
            label={exporting ? t('ecg.sharing') : t('health.bloodPressure.export')}
            icon="download"
            variant="soft"
            disabled={exporting || cuffReadings.length === 0}
            onPress={() => void exportCsv()}
            testID="cuff-export"
          />
        </View>
      ) : cuffReadings.length > 0 ? (
        <AppText variant="caption" muted testID="cuff-hidden">
          {t('health.bloodPressure.hidden', { count: cuffReadings.length })}
        </AppText>
      ) : null}

      <Card>
        <AppText variant="capLarge" muted>
          {t('health.feature.pointsTitleKnow')}
        </AppText>
        <CheckList tone="muted" items={[t('health.bloodPressure.p1'), t('health.bloodPressure.p2'), t('health.bloodPressure.p3')]} />
      </Card>
      <AppText variant="caption" muted testID="mg-disclaimer">
        {t('health.mg.disclaimer')}
      </AppText>
    </HealthPage>
  );
}
