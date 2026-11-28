import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { useAppData } from '@/data/context';
import { TERMS, TERM_IDS, termLine, type TermCategory } from '@/data/terms';
import type { ParityLevel } from '@/data/types';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { useExplain } from '@/ui/explain/ExplainProvider';
import { Icon } from '@/ui/Icon';
import { CapHeader, ListGroup, ListRow } from '@/ui/ListGroup';
import { SettingsPage } from '@/ui/manage/SettingsPage';
import { ParityBadge } from '@/ui/ParityBadge';
import { fonts, radius, spacing, useTheme } from '@/ui/theme';

const CATEGORIES: ReadonlyArray<{ id: TermCategory; label: TranslationKey }> = [
  { id: 'recovery', label: 'terms.cat.recovery' },
  { id: 'sleep', label: 'terms.cat.sleep' },
  { id: 'effort', label: 'terms.cat.effort' },
];
const LEVELS: ReadonlyArray<ParityLevel> = ['A', 'B', 'C', 'D'];

export default function TermsScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { days } = useAppData();
  const explain = useExplain();
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLowerCase();
  const visible = TERM_IDS.filter(
    (id) => normalized === '' || `${t(TERMS[id].name)} ${t(termLine(id))}`.toLowerCase().includes(normalized),
  );

  return (
    <SettingsPage title={t('terms.title')} tint="neutral" testID="all-terms">
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          minHeight: 48,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: colors.borderStrong,
          backgroundColor: colors.surface,
        }}>
        <Icon name="search" color={colors.textMuted} size={20} />
        <TextInput
          testID="terms-search"
          accessibilityLabel={t('terms.search')}
          placeholder={t('terms.search')}
          placeholderTextColor={colors.textFaint}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          style={{ flex: 1, minHeight: 44, color: colors.text, fontSize: 16, fontFamily: fonts.regular }}
        />
      </View>
      {visible.length === 0 ? (
        <AppText variant="body" muted testID="terms-none">
          {t('terms.noMatch')}
        </AppText>
      ) : null}
      {CATEGORIES.map((category) => {
        const ids = visible.filter((id) => TERMS[id].category === category.id);
        if (ids.length === 0) return null;
        return (
          <ListGroup key={category.id} title={t(category.label)}>
            {ids.map((id) => (
              <ListRow
                key={id}
                testID={`term-${id}`}
                title={t(TERMS[id].name)}
                subtitle={t(termLine(id))}
                onPress={() => explain.about({ term: id, index: days.length - 1, shown: null })}
              />
            ))}
          </ListGroup>
        );
      })}
      <CapHeader title={t('terms.levels')} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        {LEVELS.map((level) => (
          <View key={level} style={{ width: '47%', gap: spacing.xs }}>
            <ParityBadge level={level} long />
            <AppText variant="label" muted>
              {t(`level.${level}`)}
            </AppText>
          </View>
        ))}
      </View>
    </SettingsPage>
  );
}
