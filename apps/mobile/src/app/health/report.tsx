import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { REPORT_PERIODS, REPORT_SECTIONS, buildReport, parseReportPeriod, type ReportLab, type ReportRow, type ReportSection, type ReportSectionId } from '@/data/healthReport';
import {
  coverageText,
  labName,
  labRange,
  labStatus,
  labValue,
  missingText,
  renderReportHtml,
  rowRange,
  rowValue,
  sectionTitle,
  trendText,
  type ReportText,
} from '@/data/healthReportHtml';
import { shareReportPdf } from '@/data/reportShare';
import { useT } from '@/i18n/useT';
import { todayIso } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { Button, Segmented, Toggle } from '@/ui/controls';
import { HealthPage } from '@/ui/health/HealthPage';
import { ParityBadge } from '@/ui/ParityBadge';
import { Section } from '@/ui/Section';
import { spacing, useTheme } from '@/ui/theme';

function ToggleRow({ label, value, onChange, disabled = false, testID }: { label: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean; testID: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: spacing.md }}>
      <Toggle value={value} onChange={onChange} label={label} disabled={disabled} testID={testID} />
      <AppText variant="body" muted={disabled} style={{ flex: 1 }}>
        {label}
      </AppText>
    </View>
  );
}

function PreviewRow({ row, text }: { row: ReportRow; text: ReportText }) {
  const { t } = text;
  const missing = row.average === null || row.reason !== null;
  return (
    <View style={{ gap: 2 }} testID={`report-row-${row.id}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <AppText variant="bodyStrong" style={{ flex: 1 }}>
          {t(row.labelKey)}
        </AppText>
        <ParityBadge level={row.level} />
      </View>
      {missing ? (
        <AppText variant="label" muted testID={`report-missing-${row.id}`}>
          {missingText(row.reason ?? 'no-data', text)}
        </AppText>
      ) : (
        <>
          <AppText variant="label" numeric testID={`report-average-${row.id}`}>
            {row.average === null ? '' : rowValue(row, row.average, text)}
          </AppText>
          <AppText variant="caption" muted numeric>
            {`${rowRange(row, text) ?? ''} · ${trendText(row.trend, t)}`}
          </AppText>
        </>
      )}
      <AppText variant="caption" muted>
        {coverageText(row.coverageDays, row.totalDays, t)}
      </AppText>
    </View>
  );
}

function PreviewLab({ lab, text }: { lab: ReportLab; text: ReportText }) {
  const { t, language } = text;
  const status = labStatus(lab, t);
  return (
    <View style={{ gap: 2 }} testID={`report-lab-${lab.group}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <AppText variant="bodyStrong" style={{ flex: 1 }}>
          {labName(lab.ref, t)}
        </AppText>
        <ParityBadge level="D" />
      </View>
      <AppText variant="label" numeric>
        {t('health.report.labs.latest', { value: labValue(lab.latest.value, lab.latest.unit, language), day: lab.latest.day })}
      </AppText>
      <AppText variant="caption" muted numeric>
        {`${labValue(lab.min, lab.unit, language)} – ${labValue(lab.max, lab.unit, language)} · ${trendText(lab.trend, t)}`}
      </AppText>
      <AppText variant="caption" muted>
        {labRange(lab, text)}
      </AppText>
      {status === null ? null : (
        <AppText variant="caption" muted>
          {status}
        </AppText>
      )}
      <AppText variant="caption" muted>
        {t('health.report.labs.count', { count: lab.count })}
      </AppText>
    </View>
  );
}

function PreviewSection({ section, text }: { section: ReportSection; text: ReportText }) {
  const { t } = text;
  return (
    <Card testID={`report-section-${section.id}`}>
      <AppText variant="capLarge" muted>
        {sectionTitle(section.id, t)}
      </AppText>
      {section.id === 'labs' ? (
        section.labs.length === 0 ? (
          <AppText variant="label" muted testID="report-labs-empty">
            {t('health.report.labs.empty')}
          </AppText>
        ) : (
          <>
            {section.labs.map((lab) => (
              <PreviewLab key={lab.group} lab={lab} text={text} />
            ))}
            <AppText variant="caption" muted>
              {t('health.report.labs.enteredNote')}
            </AppText>
          </>
        )
      ) : (
        section.rows.map((row) => <PreviewRow key={row.id} row={row} text={text} />)
      )}
    </Card>
  );
}

export default function ReportScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const { days, bodyMeasurements, labResults, userData, profile } = useAppData();
  const [period, setPeriod] = useState<string>('30');
  const [selected, setSelected] = useState<readonly ReportSectionId[]>(REPORT_SECTIONS);
  const [includeName, setIncludeName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const hasName = userData.name !== null;
  const text: ReportText = useMemo(() => ({ t, language }), [t, language]);
  const model = useMemo(
    () =>
      buildReport({
        days,
        bodyMeasurements,
        labResults,
        userData,
        profile,
        period: parseReportPeriod(period),
        sections: selected,
        includeName: includeName && hasName,
        today: todayIso(new Date(Date.now())),
      }),
    [days, bodyMeasurements, labResults, userData, profile, period, selected, includeName, hasName],
  );

  const toggleSection = (id: ReportSectionId, on: boolean): void => {
    setSelected((current) => (on ? [...current, id] : current.filter((item) => item !== id)));
  };

  const share = async (): Promise<void> => {
    setBusy(true);
    setFailed(false);
    try {
      await shareReportPdf(renderReportHtml(model, text));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <HealthPage
      title={t('health.report.title')}
      testID="health-report"
      hero={
        <View style={{ gap: spacing.md }}>
          <AppText variant="h2" accessibilityRole="header">
            {t('health.report.heading')}
          </AppText>
          <AppText variant="lead" muted>
            {t('health.report.body')}
          </AppText>
        </View>
      }>
      <Section title={t('health.report.period.title')}>
        <Segmented
          testID="report-period"
          value={period}
          onChange={setPeriod}
          options={REPORT_PERIODS.map((value) => ({ value: `${value}`, label: t(`health.report.period.${value}`) }))}
        />
      </Section>

      <Section title={t('health.report.include.title')}>
        <Card>
          {REPORT_SECTIONS.map((id) => (
            <ToggleRow key={id} label={sectionTitle(id, t)} value={selected.includes(id)} onChange={(on) => toggleSection(id, on)} testID={`report-toggle-${id}`} />
          ))}
          <ToggleRow label={t('health.report.include.name')} value={includeName && hasName} onChange={setIncludeName} disabled={!hasName} testID="report-toggle-name" />
          {hasName ? null : (
            <AppText variant="caption" muted testID="report-name-missing">
              {t('health.report.include.nameMissing')}
            </AppText>
          )}
        </Card>
      </Section>

      <Section title={t('health.report.preview.title')}>
        <AppText variant="caption" muted>
          {t('health.report.preview.note')}
        </AppText>
        {model.sections.length === 0 ? (
          <AppText variant="body" muted testID="report-preview-empty">
            {t('health.report.preview.empty')}
          </AppText>
        ) : (
          model.sections.map((section) => <PreviewSection key={section.id} section={section} text={text} />)
        )}
        <AppText variant="caption" muted testID="report-footer">
          {t('health.report.footer', { date: model.generatedOn })}
        </AppText>
      </Section>

      {failed ? (
        <AppText variant="label" color={colors.negative} accessibilityRole="alert" testID="report-error">
          {t('health.report.error')}
        </AppText>
      ) : null}
      <Button
        label={busy ? t('health.report.action.preparing') : t('health.report.action.share')}
        icon="share"
        onPress={() => void share()}
        disabled={busy || model.sections.length === 0}
        testID="report-share"
      />
    </HealthPage>
  );
}
