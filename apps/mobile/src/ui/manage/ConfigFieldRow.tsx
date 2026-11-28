import { View } from 'react-native';

import { isConfigKey, isFlagKey, type FieldRow, type WritableValue } from '@/data/bandConfig';
import { useT, type TFunction } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { Chip } from '@/ui/Chip';
import { Button } from '@/ui/controls';
import { spacing } from '@/ui/theme';

const FLUSH_LINK = { paddingHorizontal: 0 } as const;

function labelFor(t: TFunction, row: FieldRow): string | null {
  const { key } = row.entry;
  if (row.kind === 'flag' && isFlagKey(key)) return t(`bandConfig.flag.${key}`);
  if (row.kind === 'config' && isConfigKey(key)) return t(`bandConfig.config.${key}`);
  return null;
}

export function writableText(t: TFunction, row: FieldRow, value: WritableValue): string {
  if (row.kind === 'flag') return t(value === '1' ? 'bandConfig.on' : 'bandConfig.off');
  return value;
}

function valueText(t: TFunction, row: FieldRow): string {
  const { value } = row;
  switch (value.kind) {
    case 'on':
      return t('bandConfig.on');
    case 'off':
      return t('bandConfig.off');
    case 'text':
      return value.text;
    case 'hex':
      return t('bandConfig.hex', { hex: value.hex });
    case 'unreadable':
      return t('bandConfig.unreadable');
  }
}

interface Props {
  row: FieldRow;
  original?: WritableValue | null;
  onChange?: () => void;
  onRestore?: () => void;
  disabled?: boolean;
  unchangedMarker?: boolean;
}

export function ConfigFieldRow({ row, original = null, onChange, onRestore, disabled = false, unchangedMarker = false }: Props) {
  const { t } = useT();
  const label = labelFor(t, row);
  const { key } = row.entry;
  return (
    <View testID={`config-field-${key}`} style={{ gap: 4, paddingVertical: spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="body">{label ?? key}</AppText>
          {label !== null ? (
            <AppText variant="label" muted>
              {key}
            </AppText>
          ) : null}
        </View>
        <AppText variant="bodyStrong" numeric style={{ flexShrink: 1, maxWidth: '45%', textAlign: 'right' }}>
          {valueText(t, row)}
        </AppText>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm }}>
        {row.verified ? null : <Chip label={t('bandConfig.unverified')} small testID={`config-unverified-${key}`} />}
        {unchangedMarker && original === null ? <Chip label={t('bandConfig.unchanged')} tone="positive" small testID={`config-unchanged-${key}`} /> : null}
        {original !== null ? (
          <Chip label={t('bandConfig.changedHere', { value: writableText(t, row, original) })} tone="warning" small testID={`config-changed-${key}`} />
        ) : null}
      </View>
      {row.writable && (onChange !== undefined || (original !== null && onRestore !== undefined)) ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {original !== null && onRestore !== undefined ? (
            <Button
              label={t('bandConfig.restore', { value: writableText(t, row, original) })}
              variant="secondary"
              onPress={onRestore}
              disabled={disabled}
              testID={`config-restore-${key}`}
            />
          ) : null}
          {onChange !== undefined && original === null ? (
            <Button label={t('bandConfig.change')} variant="tertiary" compact onPress={onChange} disabled={disabled} style={FLUSH_LINK} testID={`config-change-${key}`} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
