import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createEntryRecords,
  deleteEntryRecords,
} from '../../../src/mcp/storage/entryRepository.js';
import {
  resolveActiveEntryView,
  resolveActiveFile,
  resolveEntriesDir,
  SIDE_CONTEXT_HOME_ENV,
} from '../../../src/mcp/storage/paths.js';
import { setActiveEntryRecord } from '../../../src/mcp/storage/activeEntryRepository.js';

const readFileOrNull = async (filePath: string): Promise<string | null> => {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }

    throw error;
  }
};

describe('deleteEntryRecords', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'delete-entry-test-'));
    process.env[SIDE_CONTEXT_HOME_ENV] = tempDir;
  });

  afterEach(async () => {
    delete process.env[SIDE_CONTEXT_HOME_ENV];
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('指定エントリをまとめて削除しアクティブ状態を解除する', async () => {
    const [first, second, third] = await createEntryRecords([
      { title: '残すエントリ' },
      { title: '削除対象1', note: 'ノート付き' },
      { title: '削除対象2' },
    ]);

    await setActiveEntryRecord(second.entryId);

    const deleted = await deleteEntryRecords([second.entryId, third.entryId]);
    expect(deleted).toEqual([second.entryId, third.entryId]);

    const entriesDir = resolveEntriesDir();

    await expect(
      fs.stat(path.join(entriesDir, `${second.entryId}.json`)),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      fs.stat(path.join(entriesDir, `${third.entryId}.json`)),
    ).rejects.toMatchObject({ code: 'ENOENT' });

    await expect(
      fs.stat(path.join(entriesDir, `${first.entryId}.json`)),
    ).resolves.toBeDefined();

    const activeJson = await readFileOrNull(resolveActiveFile());
    expect(activeJson).toBeNull();

    const viewContent = await fs.readFile(resolveActiveEntryView(), 'utf8');
    expect(viewContent).toContain('Active Entry: (none)');
    expect(viewContent).toContain('アクティブなエントリは設定されていません。');
  });

  it('存在しないエントリ ID を含むときはエラーになる', async () => {
    await createEntryRecords([{ title: '存在するエントリ' }]);

    await expect(deleteEntryRecords(['entry_99999'])).rejects.toThrow(
      /entry not found/i,
    );
  });

  it('空配列を渡すとエラーになる', async () => {
    await expect(deleteEntryRecords([])).rejects.toThrow(
      /entryIds must contain at least one id/i,
    );
  });

  it('重複した ID は正規化され一度だけ削除される', async () => {
    const [entry] = await createEntryRecords([{ title: '重複削除テスト' }]);

    const deleted = await deleteEntryRecords([
      entry.entryId,
      entry.entryId,
    ]);

    expect(deleted).toEqual([entry.entryId]);
    await expect(
      fs.stat(path.join(resolveEntriesDir(), `${entry.entryId}.json`)),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

