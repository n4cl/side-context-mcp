import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createEntryRecords } from '../../../src/mcp/storage/entryRepository.js';
import {
  resolveEntriesDir,
  SIDE_CONTEXT_HOME_ENV,
} from '../../../src/mcp/storage/paths.js';

describe('createEntryRecords', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'entry-repo-test-'));
    process.env[SIDE_CONTEXT_HOME_ENV] = tempDir;
  });

  afterEach(async () => {
    delete process.env[SIDE_CONTEXT_HOME_ENV];
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('エントリを連番で保存しそのまま返す', async () => {
    const records = await createEntryRecords([
      { title: 'todo-1' },
      { title: 'todo-2', note: 'memo' },
    ]);

    expect(records).toHaveLength(2);
    expect(records[0].entryId).toMatch(/^entry_\d{5}$/);
    expect(records[0].status).toBe('todo');
    expect(records[0].note).toBe('');
    expect(records[0].createdAt).toEqual(records[0].updatedAt);

    const entriesDir = resolveEntriesDir();
    const savedFiles = await fs.readdir(entriesDir);
    expect(savedFiles.sort()).toEqual([
      `${records[0].entryId}.json`,
      `${records[1].entryId}.json`,
    ]);
  });

  it('既存ファイルがあっても連番が継続する', async () => {
    const entriesDir = resolveEntriesDir();
    await fs.mkdir(entriesDir, { recursive: true });
    await fs.writeFile(
      path.join(entriesDir, 'entry_00009.json'),
      JSON.stringify({}),
    );

    const [record] = await createEntryRecords([{ title: 'continue' }]);
    expect(record.entryId).toBe('entry_00010');
  });

  it('空配列を渡すとエラーになる', async () => {
    await expect(createEntryRecords([])).rejects.toThrow(
      /entries must contain at least one item/i,
    );
  });
});
