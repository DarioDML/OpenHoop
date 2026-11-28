import type { ReactNode } from 'react';
import { View } from 'react-native';

import { STAGE_VALIDATION } from '@openhoop/analytics';
import type { SleepStagesSummary, StageEpochRow } from '@openhoop/core';

import { formatNumber } from '@/lib/format';
import { useT } from '@/i18n/useT';

import { AppText } from './AppText';
import { Card } from './Card';
import { Hypnogram } from './Hypnogram';
import { ParityBadge } from './ParityBadge';
import { PARITY } from './parity';
import { StageSplit } from './StageSplit';
import { spacing } from './theme';

interface Props {
  stages: SleepStagesSummary | undefined;
  hypnogram?: { epochs: ReadonlyArray<StageEpochRow>; from: number; to: number; tzOffsetS: number };
  edited?: boolean;
  split?: boolean;
  legend?: ReactNode;
  laneLabels?: boolean;
  testID?: string;
}

export function StageCard({ stages, hypnogram, edited = false, split = true, legend, laneLabels = true, testID = 'card-stages' }: Props) {
  const { t, language, reason } = useT();
  const totals = stages?.totals ?? null;

  return (
    <Card style={{ gap: spacing.md }} testID={testID}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="cardTitle">{t('stage.title')}</AppText>
        <ParityBadge level={PARITY.stages} />
      </View>
      {totals !== null ? (
        <>
          {legend}
          {hypnogram && hypnogram.epochs.length > 0 ? (
            <Hypnogram testID="hypnogram" epochs={hypnogram.epochs} from={hypnogram.from} to={hypnogram.to} tzOffsetS={hypnogram.tzOffsetS} labels={laneLabels} />
          ) : null}
          {split ? <StageSplit testID="stage-split" totals={totals} /> : null}
          {stages?.coverage !== null && stages?.coverage !== undefined ? (
            <AppText variant="label" muted>
              {t('stage.coverage', { pct: Math.round(stages.coverage * 100) })}
            </AppText>
          ) : null}
          {edited ? (
            <AppText variant="label" muted>
              {t('stage.edited')}
            </AppText>
          ) : null}
        </>
      ) : (
        <AppText variant="body" muted testID="stages-reason">
          {stages === undefined ? t('stage.notComputed') : reason(stages.reason)}
        </AppText>
      )}
      <AppText variant="label" muted>
        {t('stage.note', {
          accuracy: Math.round(STAGE_VALIDATION.accuracy * 100),
          kappa: formatNumber(STAGE_VALIDATION.kappa, 2, language),
          subjects: STAGE_VALIDATION.subjects,
        })}
      </AppText>
    </Card>
  );
}
