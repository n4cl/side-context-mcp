import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UserError } from 'fastmcp';
import type { Context } from 'fastmcp';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildEntryTools } from '../../src/mcp/tools.js';

const HOME_ENV = 'SIDE_CONTEXT_MCP_HOME';

const createContextStub = (): Context<Record<string, unknown>> => {
  return {
    client: {
      version: {
        name: 'test-client',
        version: '1.0.0',
      },
    },
    log: {
      debug: () => {},
      error: () => {},
      info: () => {},
      warn: () => {},
    },
    reportProgress: async () => {},
    streamContent: async () => {},
    session: undefined,
  } as unknown as Context<Record<string, unknown>>;
};

describe('buildEntryTools', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'side-context-entry-'));
    process.env[HOME_ENV] = tempDir;
  });

  afterEach(async () => {
    delete process.env[HOME_ENV];
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('エントリ操作ツールが定義されている', () => {
    const tools = buildEntryTools();
    const toolNames = tools.map(({ name }) => name);

    expect(toolNames).toEqual([
      'createEntries',
      'setActiveEntry',
      'getActiveEntry',
      'updateEntry',
      'listEntries',
    ]);
  });

  it('createEntries の引数スキーマが配列入力と note の省略を許容する', () => {
    const createEntries = buildEntryTools().find(
      ({ name }) => name === 'createEntries',
    );
    expect(createEntries).toBeDefined();

    const params = createEntries?.parameters;
    expect(params).toBeDefined();

    expect(() =>
      params?.parse({ entries: [{ title: 'テスト', note: 'メモ' }] }),
    ).not.toThrow();
    expect(() => params?.parse({ entries: [{ title: 'メモだけ' }] })).not.toThrow();
    expect(() => params?.parse({ entries: [] })).toThrow();
  });

  it('createEntries がエントリファイルを生成し entryIds を返却する', async () => {
    const context = createContextStub();
    const createEntries = buildEntryTools().find(
      ({ name }) => name === 'createEntries',
    );
    expect(createEntries).toBeDefined();

    const result = await createEntries!.execute(
      {
        entries: [
          { title: '朝会の準備', note: 'API 進捗を共有' },
          { title: 'レビューコメントを書く' },
        ],
      },
      context,
    );

    const parsed = JSON.parse(result as string) as { entryIds: string[] };
    expect(parsed.entryIds).toHaveLength(2);
    expect(parsed.entryIds[0]).toMatch(/^entry_\d{5}$/);
    expect(new Set(parsed.entryIds).size).toBe(2);

    const entriesDir = path.join(tempDir, 'entries');

    for (const entryId of parsed.entryIds) {
      const filePath = path.join(entriesDir, `${entryId}.json`);
      const raw = await fs.readFile(filePath, 'utf8');
      const record = JSON.parse(raw) as Record<string, unknown>;

      expect(record).toMatchObject({
        entryId,
        status: 'todo',
      });
      expect(typeof record.title).toBe('string');
      expect(typeof record.note).toBe('string');
      expect(typeof record.createdAt).toBe('string');
      expect(typeof record.updatedAt).toBe('string');
    }
  });

  it('createEntries 以外のツールは未実装エラーを投げる', async () => {
    const tools = buildEntryTools();
    const context = createContextStub();

    for (const tool of tools.filter(({ name }) => name !== 'createEntries')) {
      await expect(tool.execute({} as never, context)).rejects.toBeInstanceOf(
        UserError,
      );
    }
  });
});
