import { useT } from '@/i18n/useT';
import type { TranslationKey } from '@/i18n';

import { AppText } from './AppText';
import { Card } from './Card';

interface Props {
  flags: ReadonlyArray<string>;
}

const FLAG_KEYS: Readonly<Record<string, TranslationKey>> = {
  'clock-offset': 'flag.clock-offset',
};

export function FlagNotice({ flags }: Props) {
  const { t } = useT();
  const keys = flags.flatMap((flag) => {
    const key = FLAG_KEYS[flag];
    return key ? [key] : [];
  });
  return (
    <>
      {keys.map((key) => (
        <Card key={key} tone="warning">
          <AppText variant="body">{t(key)}</AppText>
        </Card>
      ))}
    </>
  );
}
