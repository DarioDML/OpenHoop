import { useRef, useState, type ReactElement } from 'react';
import { View } from 'react-native';

import { ShareUnavailableError, shareSnapshotImage, type CardHandle } from '@/data/shareImage';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';

import { AppText } from '../AppText';
import { Button } from '../controls';
import { Num } from '../Num';
import { Sheet } from '../Sheet';
import { radius, spacing, useTheme } from '../theme';

export interface ShareStat {
  label: string;
  value: string;
  unit?: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  title: string;
  range: string;
  headline: string;
  stats: readonly ShareStat[];
  fileName: string;
  testID: string;
  sheetTitle?: string;
  sheetSubtitle?: string;
}

export function ReportShareSheet({ visible, onClose, title, range, headline, stats, fileName, testID, sheetTitle, sheetSubtitle }: Props): ReactElement {
  const { t } = useT();
  const { colors } = useTheme();
  const card = useRef<CardHandle>(null);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<TranslationKey | null>(null);

  const share = async (): Promise<void> => {
    setSharing(true);
    setError(null);
    try {
      await shareSnapshotImage(card, fileName);
    } catch (failure) {
      setError(failure instanceof ShareUnavailableError ? 'error.shareUnavailable' : 'plan.share.error');
    } finally {
      setSharing(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={sheetTitle ?? t('plan.share.title')}
      subtitle={sheetSubtitle ?? t('plan.share.subtitle')}
      testID={testID}
      footer={<Button label={sharing ? t('plan.share.sharing') : t('plan.share.action')} icon="share" onPress={() => void share()} disabled={sharing} testID={`${testID}-send`} />}>
      <View ref={card} collapsable={false} style={{ backgroundColor: colors.sheet, borderRadius: radius.md, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: colors.border }}>
        <AppText variant="capSmall" muted>
          {`OpenHoop · ${title} · ${range}`}
        </AppText>
        <AppText variant="title">{headline}</AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {stats.map((stat) => (
            <View key={stat.label} style={{ flexBasis: '47%', flexGrow: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: 4 }}>
              <AppText variant="capSmall" muted>
                {stat.label}
              </AppText>
              <Num size={30} unit={stat.unit} unitSize={13} unitColor={colors.textMuted}>
                {stat.value}
              </Num>
            </View>
          ))}
        </View>
      </View>
      <AppText variant="caption" muted>
        {t('plan.share.privacy')}
      </AppText>
      {error !== null ? (
        <AppText variant="body" color={colors.negative} testID={`${testID}-error`} accessibilityLiveRegion="polite">
          {t(error)}
        </AppText>
      ) : null}
    </Sheet>
  );
}
