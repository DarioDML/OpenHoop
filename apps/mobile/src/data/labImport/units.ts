import { BIOMARKER_UNITS, LAB_LIMITS, type BiomarkerId } from '@/data/labs';

const MICRO = 'µ';

const UNIT_LABELS: Readonly<Record<string, string>> = {
  'mmol/l': 'mmol/L',
  'mg/dl': 'mg/dL',
  '%': '%',
  'mmol/mol': 'mmol/mol',
  'ng/ml': 'ng/mL',
  'µg/l': 'µg/L',
  'mcg/l': 'µg/L',
  'pmol/l': 'pmol/L',
  'nmol/l': 'nmol/L',
  'miu/l': 'mIU/L',
  'mu/l': 'mIU/L',
  'me/l': 'mIU/L',
  'mie/l': 'mIU/L',
  'µiu/ml': 'µIU/mL',
  'µu/ml': 'µIU/mL',
  'µie/ml': 'µIU/mL',
  'mg/l': 'mg/L',
  'g/dl': 'g/dL',
  'g/l': 'g/L',
};

function unitKey(raw: string): string {
  return raw
    .replace(/\s+/g, '')
    .replace(/μ/g, MICRO)
    .replace(/^u(?=[a-z]+\/)/i, MICRO)
    .toLowerCase()
    .replace(/\/([dm]?)[i1|]$/, '/$1l');
}

export function normalizeUnit(raw: string): string | null {
  const key = unitKey(raw);
  if (key === '') return null;
  return UNIT_LABELS[key] ?? null;
}

export function unitFits(id: BiomarkerId, label: string): boolean {
  return BIOMARKER_UNITS[id].some((unit) => unit.label === label);
}

const PRINTED_UNIT = /^[A-Za-z0-9µμ%^*./]+$/;

export function printedUnit(raw: string): string | null {
  const known = normalizeUnit(raw);
  if (known !== null) return known;
  const compact = raw.replace(/\s+/g, '');
  if (compact.length === 0 || compact.length > LAB_LIMITS.unitLength || !PRINTED_UNIT.test(compact)) return null;
  if (!/[A-Za-zµμ]/.test(compact) || !compact.includes('/')) return null;
  return compact.replace(/μ/g, MICRO);
}
