import { formatFirmware } from '@openhoop/protocol';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { CHARGE_WINDOW_DAYS, weeklyCharges } from '@/data/charges';
import { useAppData } from '@/data/context';
import { useT } from '@/i18n/useT';
import { deviceTzOffsetS } from '@/lib/dates';
import { formatAgo, formatNumber } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { BigStatRow, BigStatTile } from '@/ui/BigStat';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Icon } from '@/ui/Icon';
import { LevelNote } from '@/ui/LevelNote';
import { KeyValueRow } from '@/ui/manage/rows';
import { CHARGING_REPORT_FRESH_S } from '@/ui/manage/deviceState';
import { Num } from '@/ui/Num';
import { ParityBadge } from '@/ui/ParityBadge';
import { PARITY } from '@/ui/parity';
import { Ring } from '@/ui/Ring';
import { Screen } from '@/ui/Screen';
import { StateCard } from '@/ui/StateCard';
import { spacing, useTheme } from '@/ui/theme';
import { TopBar } from '@/ui/TopBar';
import { ValueBars } from '@/ui/ValueBars';

const DAY_S = 86_400;

export default function BatteryPackScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { device, chargeHistory } = useAppData();
  const [starts, setStarts] = useState<number[] | null>(null);
  const pack = device.batteryPack;
  const unknown = t('band.unknown');
  const nowS = Math.floor(Date.now() / 1000);
  const reportedAt = pack === null ? null : (pack.socAt ?? pack.infoAt);
  const soc = pack?.socPercent ?? null;
  const charging = device.band?.charging ?? null;
  const chargingFresh = charging !== null && nowS - charging.at < CHARGING_REPORT_FRESH_S;

  useEffect(() => {
    let alive = true;
    void chargeHistory(Math.floor(Date.now() / 1000) - CHARGE_WINDOW_DAYS * DAY_S).then((next) => {
      if (alive) setStarts(next);
    });
    return () => {
      alive = false;
    };
  }, [chargeHistory]);

  const weeks = starts === null ? null : weeklyCharges(starts, nowS, deviceTzOffsetS(new Date(nowS * 1000)));
  const total = weeks === null ? 0 : weeks.reduce((sum, week) => sum + week.count, 0);
  const status = charging === null ? t('device.pack.chargingUnknown') : chargingFresh && charging.charging ? t('device.pack.chargingBand') : t('device.pack.notCharging');

  const header = (
    <>
      <TopBar title={t('device.batteryPack')} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }} testID="pack-hero">
        <Ring fraction={soc === null ? null : soc / 100} color={colors.positive} size={128} strokeWidth={10}>
          {soc === null ? (
            <AppText variant="caption" muted style={{ textAlign: 'center', maxWidth: 96 }} testID="pack-hero-missing">
              {t('device.pack.chargeMissing')}
            </AppText>
          ) : (
            <Num size={44} unit="%" unitSize={18} unitColor={colors.textMuted} testID="pack-hero-value">
              {formatNumber(soc, 0, language)}
            </Num>
          )}
        </Ring>
        <View style={{ flex: 1, gap: 6 }}>
          <AppText variant="title" accessibilityRole="header" testID="pack-hero-status">
            {status}
          </AppText>
          <AppText variant="body" soft>
            {pack === null
              ? t('device.pack.heroNoReport')
              : device.batteryPercent === null
                ? unknown
                : t('device.pack.heroBand', { percent: device.batteryPercent })}
          </AppText>
          <Chip label={t('device.pack.experimental')} tone="pink" />
        </View>
      </View>
    </>
  );

  return (
    <Screen header={header} tint="neutral" testID="battery-pack">
      <Card style={{ gap: spacing.md }} testID="pack-charges">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText variant="capSmall" muted>
            {t('device.pack.chargesTitle')}
          </AppText>
          <AppText variant="label" muted>
            {t('device.pack.chargesUnit')}
          </AppText>
        </View>
        {weeks === null ? null : (
          <ValueBars
            testID="pack-charges-bars"
            height={96}
            barWidth={28}
            bars={weeks.map((week) => ({ key: week.week, value: week.count, label: t('device.pack.week', { week: week.isoWeek }), color: colors.positive }))}
          />
        )}
        <AppText variant="caption" muted>
          {total === 0 && weeks !== null ? t('device.pack.chargesEmpty') : t('device.pack.chargesNote')}
        </AppText>
      </Card>

      <BigStatRow>
        <BigStatTile
          testID="pack-charge-tile"
          label={t('device.pack.chargeTile')}
          value={soc === null ? null : formatNumber(soc, 0, language)}
          unit="%"
          missing={t('device.pack.chargeMissing')}
        />
        <BigStatTile testID="pack-cycles-tile" label={t('device.pack.cyclesTile')} value={null} missing={t('device.pack.notReported')} caption={t('device.pack.cyclesCaption')} />
      </BigStatRow>

      <Card style={{ flexDirection: 'row', gap: spacing.md, backgroundColor: colors.pinkSoft }}>
        <Icon name="plug" color={colors.pink} size={16} />
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="bodyStrong" color={colors.pink}>
            {t('device.pack.title')}
          </AppText>
          <AppText variant="body" soft>
            {t('device.pack.body')}
          </AppText>
        </View>
      </Card>

      <Card style={{ gap: 0 }}>
        <KeyValueRow label={t('device.pack.bandBattery')} value={device.batteryPercent === null ? unknown : `${device.batteryPercent}${t('unit.percent')}`} />
      </Card>
      {pack === null ? (
        <StateCard icon="battery" tone="neutral" title={t('device.pack.empty.title')} body={t('device.pack.empty.body')} testID="pack-empty" />
      ) : (
        <Card style={{ gap: 0 }} testID="pack-status">
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.xs }}>
            <AppText variant="cardTitle" style={{ flexShrink: 1 }}>
              {t('device.pack.reportTitle')}
            </AppText>
            <ParityBadge level={PARITY.batteryPack} long />
          </View>
          {pack.socPercent !== null && <KeyValueRow label={t('device.pack.charge')} value={`${formatNumber(pack.socPercent, 1, language)} %`} />}
          {reportedAt !== null && <KeyValueRow label={t('device.pack.reported')} value={formatAgo(t, nowS, reportedAt)} />}
          <KeyValueRow label={t('device.pack.serial')} value={pack.info?.serial ?? unknown} />
          <KeyValueRow label={t('device.pack.firmware')} value={pack.info === null ? unknown : formatFirmware(pack.info.firmware)} />
        </Card>
      )}
      <LevelNote level={PARITY.batteryPack} text={t('device.pack.levelNote')} />
    </Screen>
  );
}
