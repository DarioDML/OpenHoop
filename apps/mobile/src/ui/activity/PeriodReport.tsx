import { MonthlyReport } from '@/ui/plan/MonthlyReport';
import { WeeklyReport } from '@/ui/plan/WeeklyReport';

interface Props {
  length: 7 | 30;
  testID: string;
}

export function PeriodReport({ length, testID }: Props) {
  return length === 7 ? <WeeklyReport testID={testID} /> : <MonthlyReport testID={testID} />;
}
