import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { EntryRecord } from '../types.js';
import {
  resolveActiveEntryView,
  resolveActiveFile,
  resolveEntriesDir,
  resolveViewsDir,
} from './paths.js';

interface ActiveFileSnapshot {
  readonly entryId: string;
  readonly updatedAt?: string;
}

const readActiveFile = async (): Promise<ActiveFileSnapshot | null> => {
  const activeFile = resolveActiveFile();

  try {
    const raw = await fs.readFile(activeFile, 'utf8');
    const parsed = JSON.parse(raw) as unknown;

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>).entryId === 'string'
    ) {
      const entryId = (parsed as Record<string, unknown>).entryId as string;
      const updatedAtValue =
        typeof (parsed as Record<string, unknown>).updatedAt === 'string'
          ? ((parsed as Record<string, unknown>).updatedAt as string)
          : undefined;

      return updatedAtValue === undefined
        ? { entryId }
        : { entryId, updatedAt: updatedAtValue };
    }

    return null;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }

    if (error instanceof SyntaxError) {
      return null;
    }

    throw error;
  }
};

const readEntryRecord = async (entryId: string): Promise<EntryRecord | null> => {
  const entriesDir = resolveEntriesDir();
  const targetPath = path.join(entriesDir, `${entryId}.json`);

  try {
    const raw = await fs.readFile(targetPath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>).entryId === 'string' &&
      typeof (parsed as Record<string, unknown>).title === 'string' &&
      typeof (parsed as Record<string, unknown>).note === 'string' &&
      typeof (parsed as Record<string, unknown>).status === 'string' &&
      typeof (parsed as Record<string, unknown>).createdAt === 'string' &&
      typeof (parsed as Record<string, unknown>).updatedAt === 'string'
    ) {
      return parsed as EntryRecord;
    }

    return null;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }

    if (error instanceof SyntaxError) {
      return null;
    }

    throw error;
  }
};

/**
 * active.json を参照して現在のアクティブエントリを取得する。
 */
export const getActiveEntryRecord = async (): Promise<EntryRecord | null> => {
  const snapshot = await readActiveFile();
  if (!snapshot) {
    return null;
  }

  const record = await readEntryRecord(snapshot.entryId);
  return record;
};

const writeFileAtomic = async (filePath: string, content: string): Promise<void> => {
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true });
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, content, 'utf8');
  await fs.rename(tempPath, filePath);
};

const writeJsonAtomic = async (filePath: string, data: unknown): Promise<void> => {
  const json = `${JSON.stringify(data, null, 2)}\n`;
  await writeFileAtomic(filePath, json);
};

const renderNoteSection = (note: string): string => {
  return note.trim().length > 0 ? note : '(none)';
};

const renderActiveEntryMarkdown = (
  record: EntryRecord | null,
  switchedAtISO: string,
): string => {
  if (!record) {
    return `# Active Entry: (none)\nLast Switched: ${switchedAtISO}\n\nアクティブなエントリは設定されていません。\n`;
  }

  return `# Active Entry: [${record.entryId}] ${record.title}\nStatus: ${record.status}\nLast Updated: ${record.updatedAt}\nLast Switched: ${switchedAtISO}\n\n## Note\n${renderNoteSection(record.note)}\n`;
};

const updateActiveView = async (
  record: EntryRecord | null,
  switchedAtISO: string,
): Promise<void> => {
  const viewPath = resolveActiveEntryView();
  await fs.mkdir(resolveViewsDir(), { recursive: true });
  const markdown = renderActiveEntryMarkdown(record, switchedAtISO);
  await writeFileAtomic(viewPath, markdown);
};

/**
 * アクティブエントリを切り替え、active.json とビューを更新する。
 */
export const setActiveEntryRecord = async (
  entryId: string | null,
): Promise<EntryRecord | null> => {
  const switchedAt = new Date().toISOString();
  const activeFile = resolveActiveFile();

  if (entryId === null) {
    await fs.rm(activeFile, { force: true });
    await updateActiveView(null, switchedAt);
    return null;
  }

  const record = await readEntryRecord(entryId);
  if (!record) {
    throw new Error(`entry not found: ${entryId}`);
  }

  await writeJsonAtomic(activeFile, {
    entryId: record.entryId,
    updatedAt: switchedAt,
  });

  await updateActiveView(record, switchedAt);

  return record;
};
