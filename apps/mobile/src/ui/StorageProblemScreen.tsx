import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { StorageProblem } from '@/data/storageProblem';
import { useT } from '@/i18n/useT';
import { StateCard } from '@/ui/StateCard';
import { spacing, useTheme } from '@/ui/theme';

export function StorageProblemScreen({ problem }: { problem: StorageProblem }) {
  const { t } = useT();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      testID="storage-problem"
      style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background, padding: spacing.lg, paddingTop: insets.top, paddingBottom: insets.bottom }}>
      {problem.kind === 'tooNew' ? (
        <StateCard
          icon="alert"
          tone="warning"
          title={t('storage.tooNew.title')}
          body={t('storage.tooNew.body', { found: problem.found, supported: problem.supported })}
        />
      ) : (
        <StateCard icon="alert" tone="negative" title={t('storage.unavailable.title')} body={t('error.storage')} />
      )}
    </View>
  );
}
