import type { ReactNode } from 'react';

import { NoticeCard } from '@/ui/NoticeCard';
import { Screen } from '@/ui/Screen';
import type { Tint } from '@/ui/theme';
import { TopBar } from '@/ui/TopBar';

interface Props {
  title: string;
  children: ReactNode;
  tint?: Tint;
  right?: ReactNode;
  footer?: ReactNode;
  notice?: boolean;
  testID?: string;
}

export function SettingsPage({ title, children, tint = 'neutral', right, footer, notice = false, testID }: Props) {
  return (
    <Screen header={<TopBar title={title} right={right} />} tint={tint} footer={footer} testID={testID}>
      {notice ? <NoticeCard /> : null}
      {children}
    </Screen>
  );
}
