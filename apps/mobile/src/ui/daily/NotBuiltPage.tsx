import { View } from 'react-native';

import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { NotBuilt, type IssueKey } from '@/ui/NotBuilt';
import type { Tint } from '@/ui/theme';
import { spacing } from '@/ui/theme';

import { Page } from './bits';

interface Props {
  title: string;
  issue: IssueKey;
  intro: string;
  points?: readonly string[];
  tint?: Tint;
  testID: string;
}

export function NotBuiltPage({ title, issue, intro, points = [], tint = 'sleep', testID }: Props) {
  return (
    <Page title={title} tint={tint} testID={testID}>
      <AppText variant="body" muted>
        {intro}
      </AppText>
      {points.length > 0 ? (
        <Card style={{ gap: spacing.md }}>
          {points.map((point) => (
            <View key={point} style={{ flexDirection: 'row', gap: spacing.sm }}>
              <AppText variant="body" muted>
                •
              </AppText>
              <AppText variant="body" soft style={{ flex: 1 }}>
                {point}
              </AppText>
            </View>
          ))}
        </Card>
      ) : null}
      <NotBuilt issue={issue} />
    </Page>
  );
}
