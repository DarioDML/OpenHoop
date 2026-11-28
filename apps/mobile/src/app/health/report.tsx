import { useMemo, useState, type ReactElement } from 'react';
import { View } from 'react-native';

import { useAppData } from '@/data/context';
import { addDays } from '@/data/derived';
import {
  CHIP_ORDER,
  CUSTOM_MAX_DAYS,
  DEFAULT_REPORT_SECTIONS,
  buildReport,
  checkCustomRange,
  parseReportPeriod,
  localDay,
  reportStats,
  type ReportLab,
  type ReportRow,
  type ReportSection,
  type ReportSectionId,
  type ReportStat,
} from '@/data/healthReport';
import {
  coverageText,
  cycleLines,
  ecgLine,
  labName,
  labRange,
  labStatus,
  labValue,
  missingText,
  renderReportHtml,
  labSpan,
  rowRange,
  rowValue,
  sectionTitle,
  trendText,
  type ReportText,
} from '@/data/healthReportHtml';
import { exportReportPdf, reportFileName, shareReportPdf } from '@/data/reportShare';
import type { TranslationKey } from '@/i18n';
import { useT } from '@/i18n/useT';
import { todayIso } from '@/lib/format';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { CheckChip } from '@/ui/Chip';
import { Button, Field, Segmented } from '@/ui/controls';
import { buttonPairFits } from '@/ui/health/buttonPair';
import { HealthPage } from '@/ui/health/HealthPage';
import { ToggleRow } from '@/ui/manage/rows';
import { useLayout } from '@/ui/layout';
import { ParityBadge } from '@/ui/ParityBadge';
import { Section } from '@/ui/Section';
import { Sparkline } from '@/ui/Sparkline';
import { radius, spacing, useTheme } from '@/ui/theme';

type PeriodChoice = '30' | '90' | 'custom';
type Busy = 'export' | 'share' | null;

const PERIOD_OPTIONS: readonly PeriodChoice[] = ['30', '90', 'custom'];
const PERIOD_LABEL: Readonly<Record<PeriodChoice, TranslationKey>> = { '30': 'health.report.period.30', '90': 'health.report.period.90', custom: 'health.report.period.custom' };

const STAT_LABEL: Readonly<Record<ReportStat['id'], TranslationKey>> = {
  rhr: 'health.report.stat.rhr',
  hrv: 'health.report.stat.hrv',
  resp: 'health.report.stat.resp',
  spo2: 'health.report.stat.spo2',
  asleep: 'health.report.stat.asleep',
  ecg: 'health.report.stat.ecg',
};

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
            {[rowRange(row, text), trendText(row.trend, t)].filter((part): part is string => part !== null && part !== '').join(' · ')}
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
        {`${labSpan(lab, language)} · ${trendText(lab.trend, t)}`}
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
      {lab.excluded === 0 ? null : (
        <AppText variant="caption" muted testID={`report-lab-excluded-${lab.group}`}>
          {t('health.report.labs.excluded', { count: lab.excluded })}
        </AppText>
      )}
    </View>
  );
}

interface Line {
  key: string;
  text: string;
}

function PreviewLines({ lines, empty, note, testID }: { lines: readonly Line[]; empty: string; note: string; testID: string }) {
  return (
    <>
      {lines.length === 0 ? (
        <AppText variant="label" muted testID={`${testID}-empty`}>
          {empty}
        </AppText>
      ) : (
        lines.map((line) => (
          <AppText key={line.key} variant="label" numeric>
            {line.text}
          </AppText>
        ))
      )}
      <AppText variant="caption" muted>
        {note}
      </AppText>
    </>
  );
}

function PreviewSection({ section, text }: { section: ReportSection; text: ReportText }) {
  const { t } = text;
  let body: ReactElement | ReactElement[];
  if (section.id === 'labs') {
    body =
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
      );
  } else if (section.id === 'ecg') {
    body = <PreviewLines lines={section.ecg.map((entry) => ({ key: `ecg-${entry.id}`, text: ecgLine(entry, text) }))} empty={t('health.report.ecg.empty')} note={t('health.report.ecg.note')} testID="report-ecg" />;
  } else if (section.id === 'cycle') {
    body = <PreviewLines lines={section.cycle === null ? [] : cycleLines(section.cycle, text).map((line, i) => ({ key: `cycle-${i}`, text: line }))} empty={t('health.report.cycle.empty')} note={t('health.report.cycle.note')} testID="report-cycle" />;
  } else {
    body = section.rows.map((row) => <PreviewRow key={row.id} row={row} text={text} />);
  }
  return (
    <Card testID={`report-section-${section.id}`}>
      <AppText variant="capLarge" muted>
        {sectionTitle(section.id, t)}
      </AppText>
      {body}
    </Card>
  );
}

function StatRow({ stat, text, last }: { stat: ReportStat; text: ReportText; last: boolean }) {
  const { t } = text;
  const { colors } = useTheme();
  const { paper } = colors;
  const { row } = stat;
  const missing = row !== null && row.average === null;
  const value = row === null ? `${stat.count ?? 0}` : row.average === null ? missingText(row.reason ?? 'no-data', text) : rowValue(row, row.average, text);
  return (
    <View
      testID={`report-stat-${stat.id}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 36, paddingVertical: 5, borderBottomWidth: last ? 0 : 1, borderBottomColor: paper.rule }}>
      <AppText variant="label" color={paper.ink} style={{ flex: 1, minWidth: 0 }}>
        {t(STAT_LABEL[stat.id])}
      </AppText>
      {row !== null && row.average !== null ? <Sparkline data={row.series} width={48} height={18} color={paper.line} accessibilityLabel={trendText(row.trend, t)} /> : null}
      <AppText variant="label" numeric color={missing ? paper.inkMuted : paper.ink} style={{ flexShrink: 1, textAlign: 'right', fontWeight: '600' }} testID={`report-stat-${stat.id}-value`}>
        {value}
      </AppText>
    </View>
  );
}

export default function ReportScreen() {
  const { t, language } = useT();
  const { colors } = useTheme();
  const layout = useLayout();
  const { narrow } = layout;
  const { days, bodyMeasurements, labResults, userData, profile, ecgRecordings, cycle } = useAppData();
  const today = todayIso(new Date(Date.now()));
  const [period, setPeriod] = useState<PeriodChoice>('30');
  const [customFrom, setCustomFrom] = useState(() => addDays(today, -29));
  const [customTo, setCustomTo] = useState(today);
  const [selected, setSelected] = useState<readonly ReportSectionId[]>(DEFAULT_REPORT_SECTIONS);
  const [includeName, setIncludeName] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [failed, setFailed] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const hasName = userData.name !== null;
  const text: ReportText = useMemo(() => ({ t, language }), [t, language]);
  const range = useMemo(() => (period === 'custom' ? checkCustomRange(customFrom.trim(), customTo.trim(), today) : null), [period, customFrom, customTo, today]);
  const custom = range !== null && range.ok ? range.range : null;
  const model = useMemo(
    () =>
      buildReport({
        days,
        bodyMeasurements,
        labResults,
        userData,
        profile,
        period: parseReportPeriod(period),
        custom,
        sections: selected,
        includeName: includeName && hasName,
        today,
        ecgRecordings,
        periods: cycle.periods,
      }, localDay),
    [days, bodyMeasurements, labResults, userData, profile, period, custom, selected, includeName, hasName, today, ecgRecordings, cycle.periods],
  );
  const stats = reportStats(model);
  const rangeInvalid = range !== null && !range.ok;
  const blocked = busy !== null || model.sections.length === 0 || rangeInvalid;
  const preparing = t('health.report.action.preparing');
  const longer = (a: string, b: string): string => ([...a].length >= [...b].length ? a : b);
  const actionsStacked = narrow || !buttonPairFits([longer(t('health.report.action.export'), preparing), longer(t('health.report.action.shareShort'), preparing)], layout);

  const toggleSection = (id: ReportSectionId, on: boolean): void => {
    setSelected((current) => (on ? [...current, id] : current.filter((item) => item !== id)));
  };

  const run = async (kind: Exclude<Busy, null>): Promise<void> => {
    setBusy(kind);
    setFailed(false);
    setSaved(null);
    try {
      const html = renderReportHtml(model, text);
      if (kind === 'share') {
        await shareReportPdf(html);
      } else {
        const name = reportFileName(model.from, model.to, new Date(Date.now()));
        const outcome = await exportReportPdf(html, name);
        setSaved(outcome === 'saved' ? name : null);
      }
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  };

  const fromInvalid = range !== null && !range.ok && range.invalid.includes('from');
  const toInvalid = range !== null && !range.ok && range.invalid.includes('to');

  return (
    <HealthPage
      title={t('health.report.title')}
      testID="health-report"
      hero={
        <Segmented
          testID="report-period"
          value={period}
          onChange={setPeriod}
          options={PERIOD_OPTIONS.map((value) => ({ value, label: t(PERIOD_LABEL[value]), testID: `report-period-${value}` }))}
        />
      }>
      {period === 'custom' ? (
        <Card testID="report-custom">
          <View style={{ flexDirection: narrow ? 'column' : 'row', gap: spacing.md }}>
            <View style={{ flex: narrow ? undefined : 1 }}>
              <Field label={t('health.report.custom.from')} value={customFrom} onChangeText={setCustomFrom} placeholder="2026-01-31" error={fromInvalid} autoCorrect={false} testID="report-custom-from" />
            </View>
            <View style={{ flex: narrow ? undefined : 1 }}>
              <Field label={t('health.report.custom.to')} value={customTo} onChangeText={setCustomTo} placeholder="2026-01-31" error={toInvalid} autoCorrect={false} testID="report-custom-to" />
            </View>
          </View>
          <AppText variant="caption" color={rangeInvalid ? colors.negative : colors.textMuted} testID="report-custom-hint">
            {rangeInvalid ? t('health.report.custom.invalid', { max: CUSTOM_MAX_DAYS }) : t('health.report.custom.hint', { max: CUSTOM_MAX_DAYS })}
          </AppText>
        </Card>
      ) : null}

      <View
        testID="report-summary"
        style={{ backgroundColor: colors.paper.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.paper.rule, paddingVertical: spacing.lg, paddingHorizontal: spacing.lg, gap: spacing.sm }}>
        <AppText variant="bodyStrong" color={colors.paper.ink} accessibilityRole="header">
          {t('health.report.summary.title', { from: model.from, to: model.to })}
        </AppText>
        <AppText variant="caption" color={colors.paper.inkMuted} style={{ paddingBottom: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.paper.rule }}>
          {[model.name, t('health.report.summary.byline')].filter((part): part is string => part !== null).join(' · ')}
        </AppText>
        {stats.length === 0 ? (
          <AppText variant="label" color={colors.paper.inkMuted} testID="report-summary-empty">
            {t('health.report.summary.empty')}
          </AppText>
        ) : (
          <View>
            {stats.map((stat, i) => (
              <StatRow key={stat.id} stat={stat} text={text} last={i === stats.length - 1} />
            ))}
          </View>
        )}
      </View>

      <View style={{ gap: spacing.sm }}>
        <AppText variant="capLarge" muted>
          {t('health.report.include.title')}
        </AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }} testID="report-chips">
          {CHIP_ORDER.map((id) => (
            <CheckChip key={id} label={sectionTitle(id, t)} checked={selected.includes(id)} onToggle={(on) => toggleSection(id, on)} testID={`report-toggle-${id}`} />
          ))}
        </View>
        <ToggleRow title={t('health.report.include.name')} value={includeName && hasName} onChange={setIncludeName} disabled={!hasName} testID="report-toggle-name" />
        {hasName ? null : (
          <AppText variant="caption" muted testID="report-name-missing">
            {t('health.report.include.nameMissing')}
          </AppText>
        )}
      </View>

      {failed ? (
        <AppText variant="label" color={colors.negative} accessibilityRole="alert" testID="report-error">
          {t('health.report.error')}
        </AppText>
      ) : null}
      {saved !== null ? (
        <AppText variant="label" color={colors.positive} accessibilityRole="alert" testID="report-saved">
          {t('health.report.saved', { name: saved })}
        </AppText>
      ) : null}
      <View style={{ flexDirection: actionsStacked ? 'column' : 'row', gap: spacing.md }} testID="report-actions">
        <Button
          label={busy === 'export' ? t('health.report.action.preparing') : t('health.report.action.export')}
          icon="download"
          variant="soft"
          onPress={() => void run('export')}
          disabled={blocked}
          style={{ flex: actionsStacked ? undefined : 1 }}
          testID="report-export"
        />
        <Button
          label={busy === 'share' ? t('health.report.action.preparing') : t('health.report.action.shareShort')}
          icon="share"
          onPress={() => void run('share')}
          disabled={blocked}
          style={{ flex: actionsStacked ? undefined : 1 }}
          testID="report-share"
        />
      </View>
      <AppText variant="caption" muted>
        {t('health.report.body')}
      </AppText>

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
    </HealthPage>
  );
}
