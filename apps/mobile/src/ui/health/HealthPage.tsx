import type { ReactNode } from 'react';

import { Screen } from '@/ui/Screen';
import { TopBar } from '@/ui/TopBar';
import type { Tint } from '@/ui/theme';

interface Props {
  title: string;
  tint?: Tint;
  hero?: ReactNode;
  right?: ReactNode;
  back?: boolean;
  withTabBar?: boolean;
  footer?: ReactNode;
  children: ReactNode;
  testID?: string;
}

export function HealthPage({ title, tint = 'health', hero, right, back = true, withTabBar = false, footer, children, testID }: Props) {
  return (
    <Screen
      tint={tint}
      withTabBar={withTabBar}
      footer={footer}
      testID={testID}
      header={
        <>
          <TopBar title={title} back={back} right={right} />
          {hero}
        </>
      }>
      {children}
    </Screen>
  );
}
