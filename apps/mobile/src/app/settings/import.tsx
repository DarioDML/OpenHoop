import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import type { FileReport } from '@/data/vendorExport/parse';
import { pickVendorFiles } from '@/data/vendorExport/pickFiles';
import { previewCounts, totalBytes, vendorFrom } from '@/data/vendorExport/preview';
import { parseVendorSources, type SourceFile } from '@/data/vendorExport/sources';
import type { VendorImportResult } from '@/data/vendorExport/summary';
import { useT } from '@/i18n/useT';
import { AppText } from '@/ui/AppText';
import { BigStatRow, BigStatTile } from '@/ui/BigStat';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/controls';
import { Icon } from '@/ui/Icon';
import { CapHeader, ListGroup } from '@/ui/ListGroup';
import { ExportCard } from '@/ui/manage/ExportCard';
import { ToggleRow } from '@/ui/manage/rows';
import { SettingsPage } from '@/ui/manage/SettingsPage';
import { sizeParts } from '@/ui/manage/storageFormat';
import { ImportResultCard, VendorHistory } from '@/ui/manage/VendorImport';
import { radius, spacing, useTheme } from '@/ui/theme';

interface Picked {
  files: SourceFile[];
  rejected: FileReport[];
}

function PickedFileCard({ picked, usable }: { picked: Picked; usable: boolean }) {
  const { t, language } = useT();
  const { colors } = useTheme();
  const size = sizeParts(totalBytes(picked.files), language);
  const first = picked.files[0];
  const name = picked.files.length === 1 && first !== undefined ? first.name : t('import.pickedMany', { count: picked.files.length });
  return (
    <Card testID="import-file" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <View style={{ width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="journal" color={colors.text} size={20} />
      </View>
      <View style={{ flex: 1, gap: 3, minWidth: 0 }}>
        <AppText variant="bodyStrong" numberOfLines={1} style={{ fontSize: 17 }}>
          {name}
        </AppText>
        <AppText variant="label" muted>
          {t('import.picked', { size: size.value, unit: size.unit })}
        </AppText>
      </View>
      <Icon name={usable ? 'check' : 'alert'} color={usable ? colors.positive : colors.warning} size={24} strokeWidth={2.25} />
    </Card>
  );
}

export default function ImportExportScreen() {
  const { t } = useT();
  const { colors } = useTheme();
  const { importVendorFiles, userData, updateUserData, settings } = useAppData();
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [result, setResult] = useState<VendorImportResult | null>(null);
  const use = userData.vendorUse;
  const fromDay = use.history ? null : settings.ownerSince;
  const parsed = useMemo(() => (picked === null ? null : parseVendorSources(picked.files)), [picked]);
  const preview = parsed === null ? null : previewCounts(vendorFrom(parsed.data, fromDay));
  const found = parsed === null ? null : previewCounts(parsed.data);
  const problems = parsed === null || picked === null ? [] : [...picked.rejected, ...parsed.files.filter((file) => file.problem !== null)];

  const choose = async (): Promise<void> => {
    setBusy(true);
    try {
      const next = await pickVendorFiles();
      if (!next.picked) return;
      setResult(null);
      setPicked({ files: next.files, rejected: next.rejected });
    } catch {
      setPicked(null);
    } finally {
      setBusy(false);
    }
  };

  const runImport = async (): Promise<void> => {
    if (picked === null) return;
    setBusy(true);
    try {
      const done = await importVendorFiles(picked.files, picked.rejected, { fromDay });
      setResult(done);
      if (done !== null) setPicked(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsPage title={t('import.title')} tint="neutral" notice testID="import-export">
      {picked === null || found === null || preview === null ? (
        <>
          <Card style={{ gap: spacing.sm }} testID="import-how">
            <AppText variant="bodyStrong">{t('import.how.title')}</AppText>
            <AppText variant="label" muted>
              {t('import.how.body')}
            </AppText>
            <AppText variant="label" muted>
              {t('import.formats')}
            </AppText>
            <Button label={busy ? t('import.choosing') : t('import.choose')} onPress={() => void choose()} disabled={busy} testID="import-choose" />
          </Card>
          <Card style={{ gap: 6 }}>
            <AppText variant="bodyStrong">{t('privacy.import.useTitle')}</AppText>
            <AppText variant="label" muted>
              {t('privacy.import.useBody')}
            </AppText>
          </Card>
        </>
      ) : (
        <>
          <PickedFileCard picked={picked} usable={found.days > 0} />
          <CapHeader title={t('import.found')} />
          <BigStatRow>
            <BigStatTile label={t('score.readiness')} value={String(found.cycles)} testID="found-cycles" />
            <BigStatTile label={t('import.found.sleeps')} value={String(found.sleeps)} testID="found-sleeps" />
          </BigStatRow>
          <BigStatRow>
            <BigStatTile label={t('import.found.workouts')} value={String(found.workouts)} testID="found-workouts" />
            <BigStatTile label={t('import.found.journal')} value={String(found.journalDays)} testID="found-journal" />
          </BigStatRow>
          {problems.length > 0 ? (
            <View style={{ gap: 2 }} testID="import-problems">
              <AppText variant="capSmall" muted>
                {t('import.problems')}
              </AppText>
              {problems.map((file, index) => (
                <AppText key={`${file.name}-${index}`} variant="caption" muted>
                  {t('import.file.problem', { name: file.name, problem: t(`import.problem.${file.problem ?? 'unreadable'}`) })}
                </AppText>
              ))}
            </View>
          ) : null}
          {found.days === 0 ? (
            <AppText variant="label" color={colors.warning} testID="import-nothing">
              {t('import.nothingFound')}
            </AppText>
          ) : null}

        </>
      )}

      <CapHeader title={t('import.useFor')} />
      <ListGroup>
        <ToggleRow
          title={t('import.use.accuracy')}
          subtitle={t('import.use.accuracyBody')}
          value={use.accuracy}
          onChange={(accuracy) => void updateUserData({ vendorUse: { ...use, accuracy } })}
          testID="use-accuracy"
        />
        <ToggleRow
          title={t('import.use.history')}
          subtitle={t('import.use.historyBody')}
          value={use.history}
          onChange={(history) => void updateUserData({ vendorUse: { ...use, history } })}
          testID="use-history"
        />
      </ListGroup>
      {use.history ? null : (
        <AppText variant="caption" muted testID="import-from-day">
          {settings.ownerSince === null ? t('import.use.historyNoStart') : t('import.use.historyOff', { day: settings.ownerSince })}
        </AppText>
      )}

      <Card style={{ flexDirection: 'row', gap: spacing.md, backgroundColor: colors.positiveSoft }}>
        <Icon name="lock" color={colors.positive} size={20} />
        <View style={{ flex: 1, gap: 4 }}>
          <AppText variant="bodyStrong" color={colors.positive}>
            {t('privacy.import.localTitle')}
          </AppText>
          <AppText variant="body" soft>
            {t('privacy.import.localBody')}
          </AppText>
        </View>
      </Card>

      {picked !== null && preview !== null ? (
        <View style={{ gap: spacing.sm }}>
          <Button
            label={busy ? t('import.importing') : t('import.importDays', { count: preview.days })}
            icon="import"
            onPress={() => void runImport()}
            disabled={busy || preview.days === 0}
            testID="import-run"
          />
          <Button label={t('import.chooseOther')} variant="tertiary" onPress={() => void choose()} disabled={busy} testID="import-choose-other" />
        </View>
      ) : null}

      {result === null ? null : <ImportResultCard result={result} />}
      <VendorHistory onRemoved={() => setResult(null)} />

      <CapHeader title={t('settings.export')} />
      <ExportCard />
    </SettingsPage>
  );
}
