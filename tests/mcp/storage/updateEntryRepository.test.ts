import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createEntryRecords,
  updateEntryRecord,
} from '../../../src/mcp/storage/entryRepository.js';
import {
  resolveActiveEntryView,
  resolveEntriesDir,
  SIDE_CONTEXT_HOME_ENV,
} from '../../../src/mcp/storage/paths.js';
import { setActiveEntryRecord } from '../../../src/mcp/storage/activeEntryRepository.js';

describe('updateEntryRecord', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'update-entry-test-'));
    process.env[SIDE_CONTEXT_HOME_ENV] = tempDir;
  });

  afterEach(async () => {
    delete process.env[SIDE_CONTEXT_HOME_ENV];
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('note と status を更新し updatedAt を再計算する', async () => {
    const [entry] = await createEntryRecords([
      { title: 'ステータス更新対象', note: '初期メモ' },
    ]);

    const updated = await updateEntryRecord(entry.entryId, {
      note: '更新後のメモ',
      status: 'doing',
    });

    expect(updated).toMatchObject({
      entryId: entry.entryId,
      note: '更新後のメモ',
      status: 'doing',
    });
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(entry.updatedAt).getTime(),
    );

    const entriesDir = resolveEntriesDir();
    const raw = await fs.readFile(
      path.join(entriesDir, `${entry.entryId}.json`),
      'utf8',
    );
    const persisted = JSON.parse(raw) as Record<string, unknown>;
    expect(persisted).toMatchObject({ note: '更新後のメモ', status: 'doing' });
  });

  it('note を空文字にするとメモがクリアされる', async () => {
    const [entry] = await createEntryRecords([
      { title: 'メモを削除したい', note: '消去予定' },
    ]);

    const updated = await updateEntryRecord(entry.entryId, { note: '' });
    expect(updated.note).toBe('');
  });

  it('存在しないエントリ ID を指定するとエラーになる', async () => {
    await expect(
      updateEntryRecord('entry_99999', { status: 'doing' }),
    ).rejects.toThrow(/entry not found/i);
  });

  it('アクティブエントリを更新するとビューも更新される', async () => {
    const [entry] = await createEntryRecords([
      { title: 'ビュー更新対象', note: 'Before' },
    ]);

    await setActiveEntryRecord(entry.entryId);

    await updateEntryRecord(entry.entryId, {
      note: 'After',
      status: 'done',
    });

    const viewContent = await fs.readFile(resolveActiveEntryView(), 'utf8');
    expect(viewContent).toContain('Status: done');
    expect(viewContent).toContain('After');
  });
});

