import { Directory, File, Paths } from 'expo-file-system';
import { shareAsync } from 'expo-sharing';

import {
  ANDROID_DOWNLOADS_URI,
  COPY_CHUNK_BYTES,
  createDonationWorkspace,
  filePartSink,
  removeLeftoverDonations,
  saveDonationParts,
  sharePartFile,
} from '@/data/donation/files';

const mockFs = {
  files: new Map<string, Uint8Array>(),
  dirs: new Set<string>(),
  deleted: [] as string[],
  failCreateIn: new Set<string>(),
  failCreateAfter: null as number | null,
  created: 0,
  reads: [] as number[],
};
const mockPickDirectory = jest.fn();

jest.mock('expo-file-system', () => {
  const join = (parts: Array<string | { uri: string }>): string => parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
  const parentOf = (uri: string): string => uri.slice(0, uri.lastIndexOf('/'));
  class MockFile {
    uri: string;
    name: string;
    constructor(...parts: Array<string | { uri: string }>) {
      this.uri = join(parts);
      this.name = this.uri.slice(this.uri.lastIndexOf('/') + 1);
    }
    get exists(): boolean {
      return mockFs.files.has(this.uri);
    }
    get size(): number {
      return mockFs.files.get(this.uri)?.length ?? 0;
    }
    create(): void {
      mockFs.files.set(this.uri, new Uint8Array(0));
    }
    delete(): void {
      mockFs.files.delete(this.uri);
      mockFs.deleted.push(this.uri);
    }
    open() {
      let offset = 0;
      const uri = this.uri;
      return {
        async readBytes(length: number): Promise<Uint8Array> {
          mockFs.reads.push(length);
          const all = mockFs.files.get(uri) ?? new Uint8Array(0);
          const out = all.slice(offset, offset + length);
          offset += out.length;
          return out;
        },
        async writeBytes(bytes: Uint8Array): Promise<void> {
          const all = mockFs.files.get(uri) ?? new Uint8Array(0);
          const next = new Uint8Array(all.length + bytes.length);
          next.set(all);
          next.set(bytes, all.length);
          mockFs.files.set(uri, next);
        },
        close(): void {},
      };
    }
  }
  class MockDirectory {
    uri: string;
    name: string;
    constructor(...parts: Array<string | { uri: string }>) {
      this.uri = join(parts);
      this.name = this.uri.slice(this.uri.lastIndexOf('/') + 1);
    }
    static pickDirectoryAsync = (initial?: string) => mockPickDirectory(initial);
    get exists(): boolean {
      return mockFs.dirs.has(this.uri);
    }
    create(): void {
      mockFs.dirs.add(this.uri);
    }
    delete(): void {
      mockFs.dirs.delete(this.uri);
      mockFs.deleted.push(this.uri);
    }
    list(): Array<MockFile | MockDirectory> {
      const dirs = [...mockFs.dirs].filter((d) => parentOf(d) === this.uri).map((d) => new MockDirectory(d));
      const files = [...mockFs.files.keys()].filter((f) => parentOf(f) === this.uri).map((f) => new MockFile(f));
      return [...dirs, ...files];
    }
    createFile(name: string): MockFile {
      mockFs.created += 1;
      if (mockFs.failCreateIn.has(this.uri)) throw new Error('permission revoked');
      if (mockFs.failCreateAfter !== null && mockFs.created > mockFs.failCreateAfter) throw new Error('no space');
      const file = new MockFile(this.uri, name);
      file.create();
      return file;
    }
  }
  return { File: MockFile, Directory: MockDirectory, Paths: { cache: { uri: 'file:///cache' } }, FileMode: { ReadOnly: 'r', WriteOnly: 'w' } };
});
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn(async () => undefined) }));

const NAMES = ['openhoop-donation-k3f9x2ab-5.0-part-1-of-2.zip', 'openhoop-donation-k3f9x2ab-5.0-part-2-of-2.zip'];
const WORKSPACE = 'file:///cache/donation-1';

function bytes(length: number, seed: number): Uint8Array {
  return Uint8Array.from({ length }, (_, i) => (i * 7 + seed) % 251);
}

function workspaceWithParts(): Directory {
  mockFs.dirs.add(WORKSPACE);
  NAMES.forEach((name, i) => mockFs.files.set(`${WORKSPACE}/${name}`, bytes(10 + i, i)));
  return new Directory(WORKSPACE);
}

beforeEach(() => {
  mockFs.files.clear();
  mockFs.dirs.clear();
  mockFs.deleted = [];
  mockFs.failCreateIn.clear();
  mockFs.failCreateAfter = null;
  mockFs.created = 0;
  mockFs.reads = [];
  mockPickDirectory.mockReset();
  jest.mocked(shareAsync).mockClear();
});

describe('donation files', () => {
  it('writes a part through a file handle, reports its size and can discard it', async () => {
    const workspace = createDonationWorkspace(new Date(5_000));
    expect(workspace.uri).toBe('file:///cache/donation-5000');
    const sink = filePartSink(workspace, 'a.zip');
    await sink.write(Uint8Array.of(1, 2, 3));
    await sink.write(Uint8Array.of(4));
    expect(await sink.finish()).toBe(4);
    expect(mockFs.files.get('file:///cache/donation-5000/a.zip')).toEqual(Uint8Array.of(1, 2, 3, 4));
    await sink.discard();
    expect(mockFs.files.has('file:///cache/donation-5000/a.zip')).toBe(false);
  });

  it('writes into the remembered folder without asking', async () => {
    const outcome = await saveDonationParts(workspaceWithParts(), NAMES, 'content://remembered', 'android');
    expect(outcome).toEqual({ kind: 'saved', folderUri: 'content://remembered' });
    expect(mockPickDirectory).not.toHaveBeenCalled();
    expect(mockFs.files.get(`content://remembered/${NAMES[1]}`)).toEqual(bytes(11, 1));
  });

  it('asks again at Downloads when the remembered folder fails', async () => {
    mockFs.failCreateIn.add('content://remembered');
    mockPickDirectory.mockResolvedValueOnce(new Directory('content://picked'));
    const outcome = await saveDonationParts(workspaceWithParts(), NAMES, 'content://remembered', 'android');
    expect(mockPickDirectory).toHaveBeenCalledWith(ANDROID_DOWNLOADS_URI);
    expect(outcome).toEqual({ kind: 'saved', folderUri: 'content://picked' });
    expect(mockFs.files.get(`content://picked/${NAMES[0]}`)).toEqual(bytes(10, 0));
  });

  it('asks for a folder every time on iOS', async () => {
    mockPickDirectory.mockResolvedValueOnce(new Directory('file:///picked'));
    await saveDonationParts(workspaceWithParts(), NAMES, 'file:///remembered', 'ios');
    expect(mockPickDirectory).toHaveBeenCalledWith(undefined);
  });

  it('returns cancelled when the donor closes the picker', async () => {
    for (const code of ['ERR_FILE_PICKING_CANCELLED', 'ERR_PICKER_CANCELLED']) {
      mockPickDirectory.mockRejectedValueOnce(Object.assign(new Error('cancelled'), { code }));
      expect(await saveDonationParts(workspaceWithParts(), NAMES, null, 'android')).toEqual({ kind: 'cancelled' });
    }
  });

  it('falls back to share sheets when the picker fails for another reason', async () => {
    mockPickDirectory.mockRejectedValueOnce(Object.assign(new Error('not available'), { code: 'ERR_NOT_IMPLEMENTED' }));
    expect(await saveDonationParts(workspaceWithParts(), NAMES, null, 'ios')).toEqual({ kind: 'shareEach' });
  });

  it('falls back to share sheets when the folder cannot be written and removes partial files', async () => {
    mockPickDirectory.mockResolvedValueOnce(new Directory('content://picked'));
    mockFs.failCreateAfter = 1;
    expect(await saveDonationParts(workspaceWithParts(), NAMES, null, 'android')).toEqual({ kind: 'shareEach' });
    expect(mockFs.deleted).toContain(`content://picked/${NAMES[0]}`);
    expect(mockFs.files.has(`content://picked/${NAMES[0]}`)).toBe(false);
  });

  it('copies large parts in chunks', async () => {
    mockFs.dirs.add(WORKSPACE);
    const big = bytes(COPY_CHUNK_BYTES * 2 + 5, 3);
    mockFs.files.set(`${WORKSPACE}/big.zip`, big);
    mockPickDirectory.mockResolvedValueOnce(new Directory('content://picked'));
    await saveDonationParts(new Directory(WORKSPACE), ['big.zip'], null, 'android');
    expect(mockFs.files.get('content://picked/big.zip')).toEqual(big);
    expect(new Set(mockFs.reads)).toEqual(new Set([COPY_CHUNK_BYTES]));
  });

  it('shares one part with the share sheet', async () => {
    await sharePartFile(workspaceWithParts(), NAMES[0] as string);
    expect(shareAsync).toHaveBeenCalledWith(`${WORKSPACE}/${NAMES[0]}`, expect.objectContaining({ mimeType: 'application/zip' }));
  });

  it('removes leftover donation folders at start and nothing else', () => {
    mockFs.dirs.add('file:///cache/donation-1');
    mockFs.dirs.add('file:///cache/openhoop-export-2');
    mockFs.files.set('file:///cache/donation-notes.txt', new Uint8Array(0));
    removeLeftoverDonations();
    expect(mockFs.deleted).toEqual(['file:///cache/donation-1']);
    expect(new File(Paths.cache, 'donation-notes.txt').exists).toBe(true);
  });
});
