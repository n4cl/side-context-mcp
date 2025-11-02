import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createEntryRecords } from '../../../src/mcp/storage/entryRepository.js';
import {
  getActiveEntryRecord,
  setActiveEntryRecord,
} from '../../../src/mcp/storage/activeEntryRepository.js';
import {
  resolveActiveFile,
  resolveActiveEntryView,
  SIDE_CONTEXT_HOME_ENV,
} from '../../../src/mcp/storage/paths.js';

describe('getActiveEntryRecord', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'active-repo-test-'));
    process.env[SIDE_CONTEXT_HOME_ENV] = tempDir;
  });

  afterEach(async () => {
    delete process.env[SIDE_CONTEXT_HOME_ENV];
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('アクティブファイルが存在しない場合は null を返す', async () => {
    const record = await getActiveEntryRecord();
    expect(record).toBeNull();
  });

  it('保存済みエントリをアクティブに設定した場合はレコードを返す', async () => {
    // 先にエントリを作成し、その ID を active.json に書き込む。
    const [entry] = await createEntryRecords([{ title: 'アクティブ判定' }]);
    const activeFile = resolveActiveFile();
    await fs.mkdir(path.dirname(activeFile), { recursive: true });
    await fs.writeFile(
      activeFile,
      `${JSON.stringify({ entryId: entry.entryId, updatedAt: entry.updatedAt }, null, 2)}\n`,
      'utf8',
    );

    const record = await getActiveEntryRecord();

    expect(record).not.toBeNull();
    expect(record).toMatchObject({
      entryId: entry.entryId,
      title: 'アクティブ判定',
      status: 'todo',
    });
  });

  it('アクティブファイルが壊れている場合は null を返す', async () => {
    const activeFile = resolveActiveFile();
    await fs.mkdir(path.dirname(activeFile), { recursive: true });
    // JSON ではない内容が保存されているケースを想定した防御的な検証。
    await fs.writeFile(activeFile, '::invalid-json::', 'utf8');

    const record = await getActiveEntryRecord();
    expect(record).toBeNull();
  });

  it('setActiveEntryRecord がエントリをアクティブに設定しビューを更新する', async () => {
    // 先にエントリを作成し、その ID をアクティブとして登録する。
    const [entry] = await createEntryRecords([
      { title: 'ビュー更新テスト', note: 'Markdown 出力を確認' },
    ]);

    const record = await setActiveEntryRecord(entry.entryId);

    expect(record).not.toBeNull();
    expect(record).toMatchObject({
      entryId: entry.entryId,
      title: 'ビュー更新テスト',
    });

    const activeFile = resolveActiveFile();
    const activeJson = JSON.parse(await fs.readFile(activeFile, 'utf8')) as {
      entryId: string;
      updatedAt: string;
    };

    expect(activeJson.entryId).toBe(entry.entryId);
    // 切り替え時刻が ISO8601 形式で保存されていることを簡易的に検証する。
    expect(new Date(activeJson.updatedAt).toISOString()).toBe(activeJson.updatedAt);

    const viewPath = resolveActiveEntryView();
    const viewContent = await fs.readFile(viewPath, 'utf8');
    expect(viewContent).toContain(`# Active Entry: [${entry.entryId}] ビュー更新テスト`);
    expect(viewContent).toContain('Status: todo');
    expect(viewContent).toContain('## Note');
    expect(viewContent).toContain('Markdown 出力を確認');
  });

  it('setActiveEntryRecord に null を渡すとアクティブが解除される', async () => {
    const [entry] = await createEntryRecords([{ title: '解除前のエントリ' }]);
    await setActiveEntryRecord(entry.entryId);

    const result = await setActiveEntryRecord(null);
    expect(result).toBeNull();

    await expect(fs.readFile(resolveActiveFile(), 'utf8')).rejects.toThrow();

    const viewContent = await fs.readFile(resolveActiveEntryView(), 'utf8');
    expect(viewContent).toContain('# Active Entry: (none)');
    expect(viewContent).toContain('アクティブなエントリは設定されていません。');
  });

  it('存在しないエントリを指定した場合はエラーになる', async () => {
    await expect(setActiveEntryRecord('entry_99999')).rejects.toThrow(/entry not found/i);
  });
});
