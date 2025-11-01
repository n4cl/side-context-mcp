import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createEntryRecords,
  listEntrySummaries,
} from '../../../src/mcp/storage/entryRepository.js';
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

describe('listEntrySummaries', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'entry-repo-test-'));
    process.env[SIDE_CONTEXT_HOME_ENV] = tempDir;
  });

  afterEach(async () => {
    delete process.env[SIDE_CONTEXT_HOME_ENV];
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('保存済みエントリを要約形式で返す', async () => {
    // 先にエントリを保存してから一覧取得で読み戻せることを確認する。
    const [first, second] = await createEntryRecords([
      { title: '一覧の一件目', note: '最初のメモ' },
      { title: '一覧の二件目' },
    ]);

    const summaries = await listEntrySummaries();

    expect(summaries).toEqual(
      expect.arrayContaining([
        {
          entryId: first.entryId,
          title: '一覧の一件目',
          status: 'todo',
          updatedAt: first.updatedAt,
        },
        {
          entryId: second.entryId,
          title: '一覧の二件目',
          status: 'todo',
          updatedAt: second.updatedAt,
        },
      ]),
    );
  });

  it('エントリが存在しない場合は空配列を返す', async () => {
    // 保存済みのエントリがないときは空配列を返す想定を検証する。
    const summaries = await listEntrySummaries();
    expect(summaries).toEqual([]);
  });

  it('デフォルトでは done を除外し includeDone で含める', async () => {
    const records = await createEntryRecords([
      { title: 'フィルター:todo' },
      { title: 'フィルター:doing' },
      { title: 'フィルター:done' },
    ]);

    const entriesDir = resolveEntriesDir();

    const overrideStatus = async (entryId: string, status: string) => {
      const filePath = path.join(entriesDir, `${entryId}.json`);
      const raw = await fs.readFile(filePath, 'utf8');
      const record = JSON.parse(raw) as Record<string, unknown>;
      record.status = status;
      await fs.writeFile(filePath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    };

    await overrideStatus(records[1].entryId, 'doing');
    await overrideStatus(records[2].entryId, 'done');

    const defaultSummaries = await listEntrySummaries();
    expect(defaultSummaries.map(({ entryId }) => entryId)).toEqual([
      records[0].entryId,
      records[1].entryId,
    ]);

    const allSummaries = await listEntrySummaries({ includeDone: true });
    expect(allSummaries.map(({ entryId }) => entryId)).toEqual(
      records.map(({ entryId }) => entryId),
    );
  });
});
