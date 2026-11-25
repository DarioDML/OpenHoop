import { strFromU8, unzipSync, type UnzipFileInfo } from 'fflate';

import { parseVendorTexts, type FileProblem, type FileReport, type ParsedExport, type TextFile } from './parse';

export interface SourceLimits {
  maxPickedBytes: number;
  maxEntryBytes: number;
  maxTotalBytes: number;
  maxEntries: number;
}

export const SOURCE_LIMITS: SourceLimits = {
  maxPickedBytes: 25 * 1024 * 1024,
  maxEntryBytes: 50 * 1024 * 1024,
  maxTotalBytes: 120 * 1024 * 1024,
  maxEntries: 200,
};

export interface SourceFile {
  name: string;
  bytes: Uint8Array;
}

function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? path;
}

function isZip(file: SourceFile): boolean {
  const b = file.bytes;
  return b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05 || b[2] === 0x07) && (b[3] === 0x04 || b[3] === 0x06 || b[3] === 0x08);
}

function isIgnorable(path: string): boolean {
  const name = baseName(path);
  return path.startsWith('__MACOSX/') || name.startsWith('.') || name === '' || path.endsWith('/');
}

function problemReport(name: string, problem: FileProblem): FileReport {
  return { name, kind: null, rows: 0, invalid: 0, problem };
}

interface Expanded {
  texts: TextFile[];
  problems: FileReport[];
  inflated: number;
}

function expandZip(file: SourceFile, limits: SourceLimits, inflatedSoFar: number): Expanded {
  const listed: UnzipFileInfo[] = [];
  try {
    unzipSync(file.bytes, {
      filter: (info) => {
        listed.push({ ...info });
        return false;
      },
    });
  } catch {
    return { texts: [], problems: [problemReport(file.name, 'unreadable')], inflated: 0 };
  }
  const candidates = listed.filter((info) => !isIgnorable(info.name) && /\.csv$/i.test(info.name));
  const declared = candidates.reduce((sum, info) => sum + info.originalSize, 0);
  if (
    listed.length > limits.maxEntries ||
    inflatedSoFar + declared > limits.maxTotalBytes ||
    candidates.some((info) => info.originalSize > limits.maxEntryBytes)
  ) {
    return { texts: [], problems: [problemReport(file.name, 'zip-limits')], inflated: 0 };
  }
  const wanted = new Set(candidates.map((info) => info.name));
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(file.bytes, { filter: (info) => wanted.has(info.name) });
  } catch {
    return { texts: [], problems: [problemReport(file.name, 'unreadable')], inflated: 0 };
  }
  const texts: TextFile[] = [];
  for (const info of candidates) {
    const bytes = entries[info.name];
    if (bytes !== undefined) texts.push({ name: baseName(info.name), text: strFromU8(bytes) });
  }
  if (texts.length === 0) return { texts, problems: [problemReport(file.name, 'unsupported')], inflated: 0 };
  return { texts, problems: [], inflated: declared };
}

export function expandSources(files: readonly SourceFile[], limits: SourceLimits = SOURCE_LIMITS): Expanded {
  const texts: TextFile[] = [];
  const problems: FileReport[] = [];
  let total = 0;
  let inflated = 0;
  for (const file of files) {
    total += file.bytes.length;
    if (file.bytes.length > limits.maxPickedBytes || total > limits.maxTotalBytes) {
      problems.push(problemReport(file.name, 'too-large'));
    } else if (isZip(file)) {
      const expanded = expandZip(file, limits, inflated);
      inflated += expanded.inflated;
      texts.push(...expanded.texts);
      problems.push(...expanded.problems);
    } else if (/\.csv$/i.test(file.name)) {
      texts.push({ name: baseName(file.name), text: strFromU8(file.bytes) });
    } else {
      problems.push(problemReport(file.name, 'unsupported'));
    }
  }
  return { texts, problems, inflated };
}

export function parseVendorSources(files: readonly SourceFile[], limits: SourceLimits = SOURCE_LIMITS): ParsedExport {
  const { texts, problems } = expandSources(files, limits);
  const parsed = parseVendorTexts(texts);
  return { ...parsed, files: [...problems, ...parsed.files] };
}
