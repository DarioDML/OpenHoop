import { BIOMARKER_IDS, type BiomarkerId } from '@/data/labs';

export const BIOMARKER_ALIASES: Readonly<Partial<Record<BiomarkerId, readonly string[]>>> = {
  glucose: ['glucose', 'glucose nuchter', 'nuchtere glucose', 'nuchter glucose', 'fasting glucose', 'glucose fasting', 'fasting plasma glucose', 'glycemie', 'bloedglucose', 'bloedsuiker', 'blood glucose', 'glu'],
  hba1c: ['hba1c', 'hb a1c', 'hbalc', 'hb alc', 'hemoglobine a1c', 'haemoglobine a1c', 'hemoglobin a1c', 'haemoglobin a1c', 'geglyceerd hemoglobine', 'geglycosyleerd hemoglobine', 'glycated haemoglobin', 'glycated hemoglobin', 'glycosylated haemoglobin', 'glycosylated hemoglobin', 'a1c'],
  totalCholesterol: ['cholesterol', 'totaal cholesterol', 'cholesterol totaal', 'totale cholesterol', 'total cholesterol', 'cholesterol total', 'cholesterol tot'],
  ldl: ['ldl', 'ldl c', 'ldl cholesterol', 'cholesterol ldl', 'ldl cholesterol berekend', 'berekend ldl', 'calculated ldl', 'ldl calculated'],
  hdl: ['hdl', 'hdl c', 'hdl cholesterol', 'cholesterol hdl'],
  triglycerides: ['triglyceriden', 'triglyceride', 'triglycerides', 'triglyceride s', 'tg'],
  ferritin: ['ferritine', 'ferritin', 'serum ferritine', 'serum ferritin'],
  vitaminD: ['vitamine d', 'vitamin d', '25 oh vitamine d', '25 oh vitamin d', '25 hydroxyvitamine d', '25 hydroxy vitamine d', '25 hydroxyvitamin d', '25 hydroxy vitamin d', 'vitamine d 25 oh', 'vitamin d 25 oh', '25 oh d', '25 oh d3', 'vitamine d3', 'vitamin d3', 'calcidiol'],
  tsh: ['tsh', 'thyreotropine', 'thyrotropine', 'thyrotropin', 'thyroid stimulating hormone', 'schildklierstimulerend hormoon', 'schildklier stimulerend hormoon'],
  crp: ['crp', 'hs crp', 'hscrp', 'c reactief proteine', 'c reactief eiwit', 'c reactive protein', 'high sensitivity crp'],
  haemoglobin: ['hemoglobine', 'haemoglobine', 'hemoglobin', 'haemoglobin', 'hb', 'hgb'],
  albumin: ['albumine', 'albumin', 'alb'],
  creatinine: ['creatinine', 'kreatinine', 'creat', 'crea', 'kreat'],
  lymphocytePct: ['lymfocyten', 'lymphocyten', 'lymphocytes', 'lymfocyten percentage', 'lymphocytes percentage', 'lymfo', 'lymph', 'lym'],
  mcv: ['mcv', 'gemiddeld celvolume', 'gemiddeld corpusculair volume', 'mean corpuscular volume', 'mean cell volume'],
  rdw: ['rdw', 'rdw cv', 'red cell distribution width', 'erytrocytenverdelingsbreedte', 'erythrocyte distribution width'],
  alp: ['alkalische fosfatase', 'alkalisch fosfatase', 'alkaline phosphatase', 'alk fosf', 'alk phos', 'alp'],
  wbc: ['leukocyten', 'leucocyten', 'witte bloedcellen', 'wbc', 'white blood cells', 'white blood cell count', 'leukocytes', 'leucocytes', 'leuco', 'leuko'],
};

const QUALIFIERS = new Set([
  'nuchter',
  'fasting',
  'berekend',
  'calculated',
  'calc',
  'direct',
  'gemeten',
  'measured',
  'friedewald',
  'martin',
  'serum',
  'plasma',
  'veneus',
  'venous',
  'bloed',
  'blood',
  'volbloed',
  'totaal',
  'total',
  'hoog',
  'gevoelig',
  'hooggevoelig',
  'high',
  'sensitive',
  'sensitivity',
  'hs',
  'ultra',
  'us',
  'ifcc',
  'dcct',
  'ngsp',
  'hplc',
  'immunoassay',
  '3e',
  '3de',
  '3rd',
  'generatie',
  'generation',
  'oh',
  'hydroxy',
  '25',
  'd2',
  'd3',
]);

const SPECIMEN_PREFIX = new Set(['s', 'p', 'b', 'se', 'pl', 'bl', 'fp', 'fs']);
const EXCLUDED_PREFIX = new Set(['u', 'urine', 'ur', 'csf', 'liquor']);

export function nameKey(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

interface AliasEntry {
  id: BiomarkerId;
  tokens: string[];
}

function buildIndex(): AliasEntry[] {
  const entries: AliasEntry[] = [];
  for (const id of BIOMARKER_IDS) {
    for (const alias of BIOMARKER_ALIASES[id] ?? []) {
      const key = nameKey(alias);
      if (key !== '') entries.push({ id, tokens: key.split(' ') });
    }
  }
  return entries.sort((a, b) => b.tokens.length - a.tokens.length);
}

const INDEX = buildIndex();

function startsWith(tokens: readonly string[], prefix: readonly string[]): boolean {
  return prefix.length <= tokens.length && prefix.every((token, i) => tokens[i] === token);
}

function matchTokens(tokens: readonly string[]): BiomarkerId | null {
  for (const entry of INDEX) {
    if (!startsWith(tokens, entry.tokens)) continue;
    const rest = tokens.slice(entry.tokens.length);
    if (rest.every((token) => QUALIFIERS.has(token))) return entry.id;
  }
  return null;
}

export function matchBiomarker(printed: string): BiomarkerId | null {
  let tokens = nameKey(printed).split(' ').filter((token) => token !== '');
  if (tokens.length === 0) return null;
  const first = tokens[0] ?? '';
  if (EXCLUDED_PREFIX.has(first)) return null;
  const direct = matchTokens(tokens);
  if (direct !== null) return direct;
  if (SPECIMEN_PREFIX.has(first)) {
    tokens = tokens.slice(1);
    return matchTokens(tokens);
  }
  if (/^\d+$/.test(first)) return matchTokens(tokens.slice(1));
  return null;
}
