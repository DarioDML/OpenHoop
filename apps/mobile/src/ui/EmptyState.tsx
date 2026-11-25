import { router } from 'expo-router';

import { useT } from '@/i18n/useT';

import { StateCard } from './StateCard';

export function EmptyState() {
  const { t } = useT();
  return (
    <StateCard
      testID="empty-state"
      icon="band"
      tone="neutral"
      title={t('empty.title')}
      body={t('empty.body')}
      actionLabel={t('band.pair')}
      onAction={() => router.push('/onboarding/pair')}
    />
  );
}
