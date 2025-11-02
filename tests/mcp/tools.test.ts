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
      'deleteEntries',
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
          { title: '朝会の準備メモ', note: 'API 進捗を共有' },
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

  it('createEntries・setActiveEntry・getActiveEntry・deleteEntries・updateEntry・listEntries 以外のツールは未実装エラーを投げる', async () => {
    const tools = buildEntryTools();
    const context = createContextStub();

    for (const tool of tools.filter(({ name }) =>
      ![
        'createEntries',
        'setActiveEntry',
        'getActiveEntry',
        'deleteEntries',
        'updateEntry',
        'listEntries',
      ].includes(name),
    )) {
      await expect(tool.execute({} as never, context)).rejects.toBeInstanceOf(
        UserError,
      );
    }
  });

  it('setActiveEntry が指定エントリをアクティブにする', async () => {
    const tools = buildEntryTools();
    const context = createContextStub();
    const createEntries = tools.find(({ name }) => name === 'createEntries');
    const setActiveEntry = tools.find(({ name }) => name === 'setActiveEntry');
    const getActiveEntry = tools.find(({ name }) => name === 'getActiveEntry');

    expect(createEntries).toBeDefined();
    expect(setActiveEntry).toBeDefined();
    expect(getActiveEntry).toBeDefined();

    const { entryIds } = JSON.parse(
      (await createEntries!.execute(
        {
          entries: [
            { title: 'アクティブ切替テスト', note: 'ビュー生成の確認' },
          ],
        },
        context,
      )) as string,
    ) as { entryIds: string[] };

    const response = await setActiveEntry!.execute(
      { entryId: entryIds[0] },
      context,
    );

    const parsed = JSON.parse(response as string) as {
      entryId: string;
      title: string;
    };

    expect(parsed.entryId).toBe(entryIds[0]);
    expect(parsed.title).toBe('アクティブ切替テスト');

    const activeFile = path.join(tempDir, 'active.json');
    const activeJson = JSON.parse(await fs.readFile(activeFile, 'utf8')) as {
      entryId: string;
    };

    expect(activeJson.entryId).toBe(entryIds[0]);

    const activeResult = await getActiveEntry!.execute({}, context);
    const activeParsed = JSON.parse(activeResult as string) as Record<string, unknown> | null;
    expect(activeParsed).not.toBeNull();
    expect(activeParsed).toMatchObject({ entryId: entryIds[0] });

    const viewContent = await fs.readFile(
      path.join(tempDir, 'views', 'active-entry.md'),
      'utf8',
    );
    expect(viewContent).toContain('アクティブ切替テスト');
    expect(viewContent).toContain('ビュー生成の確認');
  });

  it('setActiveEntry に null を渡すとアクティブが解除される', async () => {
    const tools = buildEntryTools();
    const context = createContextStub();
    const createEntries = tools.find(({ name }) => name === 'createEntries');
    const setActiveEntry = tools.find(({ name }) => name === 'setActiveEntry');
    const getActiveEntry = tools.find(({ name }) => name === 'getActiveEntry');

    expect(createEntries).toBeDefined();
    expect(setActiveEntry).toBeDefined();
    expect(getActiveEntry).toBeDefined();

    const { entryIds } = JSON.parse(
      (await createEntries!.execute(
        { entries: [{ title: '解除前の確認' }] },
        context,
      )) as string,
    ) as { entryIds: string[] };

    await setActiveEntry!.execute({ entryId: entryIds[0] }, context);

    const response = await setActiveEntry!.execute({ entryId: null }, context);
    const parsed = JSON.parse(response as string);
    expect(parsed).toBeNull();

    await expect(fs.readFile(path.join(tempDir, 'active.json'), 'utf8')).rejects.toThrow();

    const viewContent = await fs.readFile(
      path.join(tempDir, 'views', 'active-entry.md'),
      'utf8',
    );
    expect(viewContent).toContain('Active Entry: (none)');
    expect(viewContent).toContain('アクティブなエントリは設定されていません。');

    const activeResult = await getActiveEntry!.execute({}, context);
    const activeParsed = JSON.parse(activeResult as string);
    expect(activeParsed).toBeNull();
  });

  it('updateEntry が note と status を更新する', async () => {
    const tools = buildEntryTools();
    const context = createContextStub();
    const createEntries = tools.find(({ name }) => name === 'createEntries');
    const setActiveEntry = tools.find(({ name }) => name === 'setActiveEntry');
    const updateEntry = tools.find(({ name }) => name === 'updateEntry');

    expect(createEntries).toBeDefined();
    expect(setActiveEntry).toBeDefined();
    expect(updateEntry).toBeDefined();

    const { entryIds } = JSON.parse(
      (await createEntries!.execute(
        { entries: [{ title: '更新テスト', note: 'before memo' }] },
        context,
      )) as string,
    ) as { entryIds: string[] };

    await setActiveEntry!.execute({ entryId: entryIds[0] }, context);

    const response = await updateEntry!.execute(
      { entryId: entryIds[0], note: 'after memo', status: 'doing' },
      context,
    );

    const parsed = JSON.parse(response as string) as {
      entryId: string;
      note: string;
      status: string;
    };

    expect(parsed).toMatchObject({
      entryId: entryIds[0],
      note: 'after memo',
      status: 'doing',
    });

    const viewContent = await fs.readFile(
      path.join(tempDir, 'views', 'active-entry.md'),
      'utf8',
    );
    expect(viewContent).toContain('Status: doing');
    expect(viewContent).toContain('after memo');
  });

  it('updateEntry は存在しない ID 指定時に UserError を返す', async () => {
    const tools = buildEntryTools();
    const context = createContextStub();
    const updateEntry = tools.find(({ name }) => name === 'updateEntry');

    expect(updateEntry).toBeDefined();

    await expect(
      updateEntry!.execute({ entryId: 'entry_404', status: 'todo' }, context),
    ).rejects.toBeInstanceOf(UserError);
  });

  it('deleteEntries が指定したエントリをまとめて削除する', async () => {
    const tools = buildEntryTools();
    const context = createContextStub();
    const createEntries = tools.find(({ name }) => name === 'createEntries');
    const deleteEntries = tools.find(({ name }) => name === 'deleteEntries');

    expect(createEntries).toBeDefined();
    expect(deleteEntries).toBeDefined();

    const { entryIds } = JSON.parse(
      (await createEntries!.execute(
        {
          entries: [
            { title: '削除対象A' },
            { title: '削除対象B' },
            { title: '残すエントリ' },
          ],
        },
        context,
      )) as string,
    ) as { entryIds: string[] };

    await fs.mkdir(path.join(tempDir, 'views'), { recursive: true });
    const activeFile = path.join(tempDir, 'active.json');
    await fs.writeFile(
      activeFile,
      `${JSON.stringify({ entryId: entryIds[0], updatedAt: new Date().toISOString() }, null, 2)}\n`,
      'utf8',
    );

    const response = await deleteEntries!.execute(
      { entryIds: [entryIds[0], entryIds[1]] },
      context,
    );

    const parsed = JSON.parse(response as string) as {
      deletedEntryIds: string[];
    };

    expect(parsed.deletedEntryIds).toEqual([entryIds[0], entryIds[1]]);

    await expect(
      fs.stat(path.join(tempDir, 'entries', `${entryIds[0]}.json`)),
    ).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      fs.stat(path.join(tempDir, 'entries', `${entryIds[1]}.json`)),
    ).rejects.toMatchObject({ code: 'ENOENT' });

    await expect(
      fs.stat(path.join(tempDir, 'entries', `${entryIds[2]}.json`)),
    ).resolves.toBeDefined();

    const viewContent = await fs.readFile(
      path.join(tempDir, 'views', 'active-entry.md'),
      'utf8',
    );
    expect(viewContent).toContain('Active Entry: (none)');
  });

  it('deleteEntries は存在しない ID が含まれると UserError を返す', async () => {
    const tools = buildEntryTools();
    const context = createContextStub();
    const deleteEntries = tools.find(({ name }) => name === 'deleteEntries');

    expect(deleteEntries).toBeDefined();

    await expect(
      deleteEntries!.execute({ entryIds: ['entry_404'] }, context),
    ).rejects.toBeInstanceOf(UserError);
  });

  it('getActiveEntry がアクティブエントリを返す', async () => {
    const tools = buildEntryTools();
    const context = createContextStub();
    const createEntries = tools.find(({ name }) => name === 'createEntries');
    const getActiveEntry = tools.find(({ name }) => name === 'getActiveEntry');

    expect(createEntries).toBeDefined();
    expect(getActiveEntry).toBeDefined();

    const { entryIds } = JSON.parse(
      (await createEntries!.execute(
        { entries: [{ title: 'アクティブ候補' }] },
        context,
      )) as string,
    ) as { entryIds: string[] };

    const entriesDir = path.join(tempDir, 'entries');
    const targetPath = path.join(entriesDir, `${entryIds[0]}.json`);
    const record = JSON.parse(await fs.readFile(targetPath, 'utf8')) as Record<string, unknown>;

    const activeFile = path.join(tempDir, 'active.json');
    await fs.writeFile(
      activeFile,
      `${JSON.stringify(
        { entryId: record.entryId, updatedAt: record.updatedAt },
        null,
        2,
      )}\n`,
      'utf8',
    );

    const result = await getActiveEntry!.execute({}, context);
    const parsed = JSON.parse(result as string) as Record<string, unknown> | null;

    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      entryId: record.entryId,
      title: 'アクティブ候補',
    });
  });

  it('getActiveEntry はアクティブ未設定時に null を返す', async () => {
    const tools = buildEntryTools();
    const context = createContextStub();
    const getActiveEntry = tools.find(({ name }) => name === 'getActiveEntry');

    expect(getActiveEntry).toBeDefined();

    const result = await getActiveEntry!.execute({}, context);
    const parsed = JSON.parse(result as string);

    expect(parsed).toBeNull();
  });

  it('listEntries が保存済みエントリを返す', async () => {
    // 事前にエントリを作成し、一覧取得で想定の要約が返ることを確かめる。
    const tools = buildEntryTools();
    const context = createContextStub();
    const createEntries = tools.find(({ name }) => name === 'createEntries');
    const listEntries = tools.find(({ name }) => name === 'listEntries');

    expect(createEntries).toBeDefined();
    expect(listEntries).toBeDefined();

    await createEntries!.execute(
      {
        entries: [
          { title: '一覧テスト1', note: 'メモを確認' },
          { title: '一覧テスト2' },
        ],
      },
      context,
    );

    const result = await listEntries!.execute({}, context);
    const summaries = JSON.parse(result as string) as Array<{
      entryId: string;
      title: string;
      status: string;
      updatedAt: string;
    }>;

    expect(summaries).toHaveLength(2);
    expect(summaries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: '一覧テスト1',
          status: 'todo',
        }),
        expect.objectContaining({
          title: '一覧テスト2',
          status: 'todo',
        }),
      ]),
    );
  });

  it('listEntries が includeDone の入力を尊重する', async () => {
    const tools = buildEntryTools();
    const context = createContextStub();
    const createEntries = tools.find(({ name }) => name === 'createEntries');
    const listEntries = tools.find(({ name }) => name === 'listEntries');

    expect(createEntries).toBeDefined();
    expect(listEntries).toBeDefined();

    const result = await createEntries!.execute(
      {
        entries: [
          { title: 'フィルター対象 todo' },
          { title: 'フィルター対象 done' },
        ],
      },
      context,
    );

    const { entryIds } = JSON.parse(result as string) as {
      entryIds: string[];
    };

    const doneEntryId = entryIds[1];
    const donePath = path.join(tempDir, 'entries', `${doneEntryId}.json`);
    const doneRecord = JSON.parse(await fs.readFile(donePath, 'utf8')) as Record<string, unknown>;
    doneRecord.status = 'done';
    await fs.writeFile(donePath, `${JSON.stringify(doneRecord, null, 2)}\n`, 'utf8');

    const defaultParsed = JSON.parse((await listEntries!.execute({}, context)) as string) as Array<{
      entryId: string;
      status: string;
    }>;

    expect(defaultParsed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entryId: entryIds[0], status: 'todo' }),
      ]),
    );
    expect(defaultParsed).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ entryId: doneEntryId, status: 'done' }),
      ]),
    );

    const includeDoneParsed = JSON.parse(
      (await listEntries!.execute({ includeDone: true }, context)) as string,
    ) as Array<{
      entryId: string;
      status: string;
    }>;

    expect(includeDoneParsed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entryId: entryIds[0], status: 'todo' }),
        expect.objectContaining({ entryId: doneEntryId, status: 'done' }),
      ]),
    );
  });
});
