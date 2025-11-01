import { promises as fs } from 'node:fs';
import path from 'node:path';
import { resolveEntriesDir } from './paths.js';
import type { EntryRecord, EntryStatus } from '../types.js';

const ENTRY_PREFIX = 'entry_';
const ENTRY_EXTENSION = '.json';

/**
 * エントリ作成時に受け取るペイロード。
 */
export interface CreateEntryInput {
  readonly title: string;
  readonly note?: string | undefined;
}

const formatEntryId = (sequence: number): string => {
  return `${ENTRY_PREFIX}${sequence.toString().padStart(5, '0')}`;
};

const parseEntrySequence = (fileName: string): number | null => {
  if (!fileName.startsWith(ENTRY_PREFIX) || !fileName.endsWith(ENTRY_EXTENSION)) {
    return null;
  }

  const numeric = fileName.slice(
    ENTRY_PREFIX.length,
    -ENTRY_EXTENSION.length,
  );
  const value = Number.parseInt(numeric, 10);

  return Number.isNaN(value) ? null : value;
};

const determineNextSequence = async (entriesDir: string): Promise<number> => {
  try {
    const files = await fs.readdir(entriesDir);
    const sequences = files
      .map(parseEntrySequence)
      .filter((value): value is number => value !== null);

    const max = sequences.length > 0 ? Math.max(...sequences) : 0;
    return max + 1;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return 1;
    }

    throw error;
  }
};

const writeEntryRecord = async (
  filePath: string,
  record: EntryRecord,
): Promise<void> => {
  const tempPath = `${filePath}.tmp`;
  const data = JSON.stringify(record, null, 2);
  await fs.writeFile(tempPath, `${data}\n`, 'utf8');
  await fs.rename(tempPath, filePath);
};

/**
 * 渡されたエントリ群を JSON ファイルとして保存し、採番済みレコードを返す。
 * ID は保存ディレクトリ内で単調増加する連番。
 */
export const createEntryRecords = async (
  inputs: CreateEntryInput[],
): Promise<EntryRecord[]> => {
  if (inputs.length === 0) {
    throw new Error('entries must contain at least one item');
  }

  const entriesDir = resolveEntriesDir();
  await fs.mkdir(entriesDir, { recursive: true });

  let sequence = await determineNextSequence(entriesDir);
  const records: EntryRecord[] = [];

  for (const input of inputs) {
    const entryId = formatEntryId(sequence);
    sequence += 1;
    const timestamp = new Date().toISOString();
    const record: EntryRecord = {
      entryId,
      title: input.title,
      note: input.note ?? '',
      status: 'todo',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const filePath = path.join(entriesDir, `${entryId}${ENTRY_EXTENSION}`);
    await writeEntryRecord(filePath, record);
    records.push(record);
  }

  return records;
};

export type EntrySummary = Pick<
  EntryRecord,
  'entryId' | 'title' | 'status' | 'updatedAt'
>;

/**
 * 保存済みエントリを読み込み、ツール一覧向けの軽量サマリーを返す。
 */
export interface ListEntrySummariesOptions {
  readonly includeDone?: boolean;
}

const DEFAULT_STATUS_WHEN_EXCLUDED = new Set<EntryStatus>(['todo', 'doing']);

export const listEntrySummaries = async (
  options: ListEntrySummariesOptions = {},
): Promise<EntrySummary[]> => {
  const entriesDir = resolveEntriesDir();

  let files: string[];
  try {
    files = await fs.readdir(entriesDir);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const jsonFiles = files.filter((fileName) =>
    fileName.endsWith(ENTRY_EXTENSION),
  );

  const summaries = await Promise.all(
    jsonFiles.map(async (fileName) => {
      const filePath = path.join(entriesDir, fileName);
      const raw = await fs.readFile(filePath, 'utf8');
      const record = JSON.parse(raw) as EntryRecord;

      return {
        entryId: record.entryId,
        title: record.title,
        status: record.status,
        updatedAt: record.updatedAt,
      } satisfies EntrySummary;
    }),
  );

  const shouldIncludeDone = options.includeDone === true;
  const filtered = shouldIncludeDone
    ? summaries
    : summaries.filter(({ status }) => DEFAULT_STATUS_WHEN_EXCLUDED.has(status));

  return filtered.sort((a, b) => a.entryId.localeCompare(b.entryId));
};
