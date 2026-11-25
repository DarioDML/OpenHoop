import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { useT } from '@/i18n/useT';
import { runSelfTest, type CheckResult } from '@/selftest/runSelfTest';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/controls';
import { Screen } from '@/ui/Screen';
import { Section } from '@/ui/Section';
import { spacing, useTheme } from '@/ui/theme';

export default function SelfTestScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const [results, setResults] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (): Promise<void> => {
    setResults([]);
    setFinished(false);
    setRunning(true);
    try {
      await runSelfTest((result) => {
        if (mounted.current) setResults((current) => [...current, result]);
      });
    } finally {
      if (mounted.current) {
        setRunning(false);
        setFinished(true);
      }
    }
  }, []);

  const passed = results.filter((result) => result.status === 'passed').length;
  const driverResults = results.filter((result) => result.group === 'driver');
  const appResults = results.filter((result) => result.group === 'app');

  const renderGroup = (title: string, group: CheckResult[]) =>
    group.length === 0 ? null : (
      <Section title={title}>
        <View style={{ gap: spacing.sm }}>
          {group.map((result) => (
            <Card key={result.id} style={{ gap: 4, paddingVertical: spacing.md }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }}>
                <AppText variant="bodyStrong" style={{ flex: 1 }}>
                  {typeof result.label === 'string' ? result.label : t(result.label.key)}
                </AppText>
                <AppText variant="bodyStrong" color={result.status === 'passed' ? colors.positive : colors.negative}>
                  {result.status === 'passed' ? t('selftest.passed') : t('selftest.failed')}
                </AppText>
              </View>
              <AppText variant="label" muted>
                {[t('selftest.duration', { ms: result.ms }), result.detail].filter((part) => part !== null).join(' · ')}
              </AppText>
              {result.error === null ? null : (
                <AppText variant="label" color={colors.negative}>
                  {result.error}
                </AppText>
              )}
            </Card>
          ))}
        </View>
      </Section>
    );

  return (
    <Screen>
      <AppText variant="body" muted>
        {t('selftest.intro')}
      </AppText>
      <Button
        label={running ? t('selftest.running') : finished ? t('selftest.runAgain') : t('selftest.run')}
        onPress={() => void run()}
        disabled={running}
        testID="selftest-run"
      />
      {results.length > 0 ? (
        <Card tone={finished && passed === results.length ? 'accent' : 'default'}>
          <AppText variant="bodyStrong" testID="selftest-summary">
            {t('selftest.summary', { passed, total: results.length })}
          </AppText>
        </Card>
      ) : null}
      {renderGroup(t('selftest.groupDriver'), driverResults)}
      {renderGroup(t('selftest.groupApp'), appResults)}
    </Screen>
  );
}
