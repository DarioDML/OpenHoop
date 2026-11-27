import type { ReactElement } from 'react';
import { View } from 'react-native';

import type { ContributorStatus } from '@/data/sleepDerived';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { WhyValue } from '@/ui/daily/bits';
import type { ExplainTarget } from '@/ui/explain/ExplainProvider';
import { MetricName } from '@/ui/explain/MetricName';
import { Icon, type IconName } from '@/ui/Icon';
import { Num } from '@/ui/Num';
import { useTheme, type ColorTokens } from '@/ui/theme';

const SEGMENTS: readonly ContributorStatus[] = ['poor', 'sufficient', 'optimal'];

export function statusColor(colors: ColorTokens, status: ContributorStatus): string {
  return status === 'optimal' ? colors.positive : status === 'poor' ? colors.warning : colors.textMuted;
}

export function StatusSegments({ status, testID }: { status: ContributorStatus | null; testID?: string }): ReactElement {
  const { colors } = useTheme();
  const { t } = useT();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }} testID={testID}>
      {SEGMENTS.map((segment) => (
        <View key={segment} style={{ width: 28, height: 4, borderRadius: 2, backgroundColor: segment === status ? statusColor(colors, segment) : colors.surface3 }} />
      ))}
      {status === null ? null : (
        <AppText variant="caption" color={statusColor(colors, status)} style={{ marginLeft: 6, fontSize: 11, lineHeight: 14 }} testID={testID === undefined ? undefined : `${testID}-word`}>
          {t(`sleepHome.status.${status}`)}
        </AppText>
      )}
    </View>
  );
}

interface Props {
  icon: IconName;
  label: string;
  target: ExplainTarget;
  value: number | null;
  status: ContributorStatus | null;
  pending?: boolean;
  last?: boolean;
  testID: string;
}

export function ContributorRow({ icon, label, target, value, status, pending = false, last = false, testID }: Props): ReactElement {
  const { colors } = useTheme();
  const { t } = useT();
  return (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }}>
      <Icon name={icon} color={colors.purple} size={22} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <MetricName target={target} label={label} variant="cap" muted={false} testID={`${testID}-name`} />
        <View style={{ marginTop: -8, paddingBottom: 10 }}>
          <StatusSegments status={status} testID={`${testID}-status`} />
        </View>
      </View>
      {value !== null ? (
        <Num size={30} unit="%" unitSize={15} testID={`${testID}-value`}>
          {String(value)}
        </Num>
      ) : pending ? (
        <AppText variant="label" muted testID={`${testID}-pending`}>
          {t('sleepHome.loading')}
        </AppText>
      ) : (
        <WhyValue target={target} testID={testID} />
      )}
    </View>
  );
}
