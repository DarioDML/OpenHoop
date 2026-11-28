import { formatLongDay } from '@/data/dailyDerived';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { useTheme } from '@/ui/theme';

export function PastDayLabel({ day }: { day: string | null }) {
  const { colors } = useTheme();
  const { language } = useT();
  if (day === null) return null;
  return (
    <AppText variant="label" color={colors.levelC} numeric style={{ textAlign: 'center' }} testID="past-day-label">
      {formatLongDay(day, language)}
    </AppText>
  );
}
