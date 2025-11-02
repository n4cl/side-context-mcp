#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UserError } from 'fastmcp';
import { runSideContextServer } from '../mcp/cli.js';
import {
  createEntryRecords,
  deleteEntryRecords,
  listEntrySummaries,
  updateEntryRecord,
  type CreateEntryInput,
  type UpdateEntryInput,
} from '../mcp/storage/entryRepository.js';
import {
  getActiveEntryRecord,
  setActiveEntryRecord,
} from '../mcp/storage/activeEntryRepository.js';
import {
  SIDE_CONTEXT_HOME_ENV,
  resolveActiveEntryView,
} from '../mcp/storage/paths.js';

type TransportType = 'stdio' | 'httpStream';

interface RunCliOptions {
  readonly argv?: string[];
}

interface GlobalOptions {
  homePath?: string;
  json: boolean;
}

type CommandName =
  | 'server'
  | 'create'
  | 'list'
  | 'active'
  | 'update'
  | 'delete'
  | 'help';

interface ParsedArguments {
  readonly command: CommandName;
  readonly global: GlobalOptions;
  readonly args: string[];
}

class CliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliError';
  }
}

const parseArguments = (argv: string[]): ParsedArguments => {
  const global: GlobalOptions = { json: false };
  const rest: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--home') {
      const value = argv[index + 1];
      if (!value) {
        throw new CliError('--home の引数が不足しています。');
      }
      global.homePath = value;
      index += 1;
      continue;
    }

    if (token === undefined) {
      throw new CliError('引数の解析に失敗しました。');
    }

    if (token === '--json') {
      global.json = true;
      continue;
    }

    if (token === '--help' || token === '-h') {
      return { command: 'help', global, args: [] };
    }

    rest.push(token);
  }

  if (rest.length === 0) {
    return { command: 'server', global, args: [] };
  }

  const [command, ...commandArgs] = rest;

  if (
    command === 'server' ||
    command === 'create' ||
    command === 'list' ||
    command === 'active' ||
    command === 'update' ||
    command === 'delete'
  ) {
    return { command, global, args: commandArgs };
  }

  if (command === 'help') {
    return { command: 'help', global, args: [] };
  }

  throw new CliError(`不明なコマンドです: ${command}`);
};

const applyGlobalOptions = (global: GlobalOptions): void => {
  if (global.homePath !== undefined) {
    process.env[SIDE_CONTEXT_HOME_ENV] = global.homePath;
  }
};

const logJson = (value: unknown): void => {
  console.log(JSON.stringify(value, null, 2));
};

const handleServerCommand = async (
  args: string[],
): Promise<void> => {
  let transport: TransportType = 'stdio';

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--transport') {
      const value = args[index + 1];
      if (value !== 'stdio' && value !== 'httpStream') {
        throw new CliError('transport は "stdio" または "httpStream" を指定してください。');
      }
      transport = value;
      index += 1;
      continue;
    }

    throw new CliError(`server コマンドで不明なオプションです: ${token}`);
  }

  await runSideContextServer({ transportType: transport });
};

const readJsonFile = async <T>(filePath: string): Promise<T> => {
  const target = path.resolve(filePath);
  const raw = await fs.readFile(target, 'utf8');
  return JSON.parse(raw) as T;
};

const handleCreateCommand = async (
  args: string[],
  global: GlobalOptions,
): Promise<void> => {
  let title: string | undefined;
  let note: string | undefined;
  let filePath: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--title') {
      title = args[index + 1];
      if (!title) {
        throw new CliError('--title の引数が不足しています。');
      }
      index += 1;
      continue;
    }

    if (token === '--note') {
      note = args[index + 1];
      if (note === undefined) {
        throw new CliError('--note の引数が不足しています。');
      }
      index += 1;
      continue;
    }

    if (token === '--file') {
      filePath = args[index + 1];
      if (!filePath) {
        throw new CliError('--file の引数が不足しています。');
      }
      index += 1;
      continue;
    }

    throw new CliError(`create コマンドで不明なオプションです: ${token}`);
  }

  let inputs: CreateEntryInput[];

  if (typeof filePath === 'string') {
    const sourcePath = filePath;
    const data = await readJsonFile<unknown>(sourcePath);
    if (!Array.isArray(data)) {
      throw new CliError('--file で指定した JSON が配列ではありません。');
    }

    inputs = data.map((item) => {
      if (!item || typeof item !== 'object') {
        throw new CliError('エントリ定義はオブジェクトである必要があります。');
      }

      const payload = item as { title?: unknown; note?: unknown };
      if (typeof payload.title !== 'string' || payload.title.trim().length === 0) {
        throw new CliError('エントリに title が含まれていません。');
      }

      const titleValue = payload.title as string;
      const noteValue = typeof payload.note === 'string' ? payload.note : undefined;

      return {
        title: titleValue,
        note: noteValue,
      } satisfies CreateEntryInput;
    });
  } else {
    if (!title) {
      throw new CliError('タイトルを指定するか --file でエントリ定義を渡してください。');
    }

    inputs = [{ title, note }];
  }

  const records = await createEntryRecords(inputs);
  const entryIds = records.map(({ entryId }) => entryId);

  if (global.json) {
    logJson({ entryIds });
  } else {
    console.log(`作成したエントリ: ${entryIds.join(', ')}`);
  }
};

const formatTable = (rows: string[][]): string => {
  if (rows.length === 0) {
    return '（エントリがありません）';
  }

  const header = rows[0];
  if (header === undefined) {
    return '（エントリがありません）';
  }

  const widths = header.map((_, column) =>
    Math.max(
      ...rows.map((row) => {
        const cell = row[column];
        return cell !== undefined ? cell.length : 0;
      }),
    ),
  );

  return rows
    .map((row) =>
      row
        .map((cellValue, index) => {
          const cell = cellValue ?? '';
          const width = widths[index] ?? 0;
          return cell.padEnd(width);
        })
        .join(' | '),
    )
    .join('\n');
};

const handleListCommand = async (
  args: string[],
  global: GlobalOptions,
): Promise<void> => {
  let includeDone = false;
  let format: 'json' | 'table' = global.json ? 'json' : 'table';

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === '--include-done') {
      includeDone = true;
      continue;
    }

    if (token === '--format') {
      const value = args[index + 1];
      if (value !== 'json' && value !== 'table') {
        throw new CliError('--format には "json" または "table" を指定してください。');
      }
      format = value;
      index += 1;
      continue;
    }

    throw new CliError(`list コマンドで不明なオプションです: ${token}`);
  }

  const summaries = await listEntrySummaries({ includeDone });

  if (global.json || format === 'json') {
    logJson(summaries);
    return;
  }

  const rows = [
    ['entryId', 'status', 'title', 'updatedAt'],
    ...summaries.map(({ entryId, status, title, updatedAt }) => [
      entryId,
      status,
      title,
      updatedAt,
    ]),
  ];

  console.log(formatTable(rows));
};

const formatActiveEntry = (record: unknown): string => {
  if (!record) {
    return 'Active Entry: (none)';
  }

  const entry = record as {
    entryId: string;
    title: string;
    status: string;
  };

  return `Active Entry: [${entry.entryId}] ${entry.title} (${entry.status})`;
};

const handleActiveCommand = async (
  args: string[],
  global: GlobalOptions,
): Promise<void> => {
  const subcommand = args[0] ?? 'show';

  if (subcommand === 'show') {
    const record = await getActiveEntryRecord();
    if (global.json) {
      logJson(record);
    } else {
      console.log(formatActiveEntry(record));
      if (!record) {
        const viewPath = resolveActiveEntryView();
        console.log(`ビュー: ${viewPath}`);
      }
    }
    return;
  }

  if (subcommand === 'set') {
    const entryId = args[1];
    if (!entryId) {
      throw new CliError('active set には entryId を指定してください。');
    }

    const record = await setActiveEntryRecord(entryId);
    if (global.json) {
      logJson(record);
    } else {
      console.log(formatActiveEntry(record));
    }
    return;
  }

  if (subcommand === 'clear') {
    await setActiveEntryRecord(null);
    if (global.json) {
      logJson(null);
    } else {
      console.log('Active Entry: (none)');
    }
    return;
  }

  throw new CliError(`active コマンドで不明なサブコマンドです: ${subcommand}`);
};

const handleUpdateCommand = async (
  args: string[],
  global: GlobalOptions,
): Promise<void> => {
  const [entryId, ...rest] = args;
  if (!entryId) {
    throw new CliError('update には entryId を指定してください。');
  }

  let note: string | undefined;
  let status: UpdateEntryInput['status'] | undefined;

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === undefined) {
      throw new CliError('update コマンドのパラメータが不正です。');
    }
    if (token === '--note') {
      note = rest[index + 1] ?? '';
      index += 1;
      continue;
    }

    if (token === '--status') {
      const value = rest[index + 1];
      if (value !== 'todo' && value !== 'doing' && value !== 'done') {
        throw new CliError('--status には "todo" / "doing" / "done" のいずれかを指定してください。');
      }
      status = value;
      index += 1;
      continue;
    }

    throw new CliError(`update コマンドで不明なオプションです: ${token}`);
  }

  if (note === undefined && status === undefined) {
    throw new CliError('note か status のいずれかを指定してください。');
  }

  const updatePayload: UpdateEntryInput = {
    ...(note !== undefined ? { note } : {}),
    ...(status !== undefined ? { status } : {}),
  };

  const record = await updateEntryRecord(entryId, updatePayload);

  if (global.json) {
    logJson(record);
  } else {
    console.log(`更新しました: ${record.entryId}`);
  }
};

const handleDeleteCommand = async (
  args: string[],
  global: GlobalOptions,
): Promise<void> => {
  let filePath: string | undefined;
  const entryIds: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === undefined) {
      throw new CliError('delete コマンドのパラメータが不正です。');
    }
    if (token === '--file') {
      const next = args[index + 1];
      if (!next) {
        throw new CliError('--file の引数が不足しています。');
      }
      filePath = next;
      index += 1;
      continue;
    }

    if (token.startsWith('--')) {
      throw new CliError(`delete コマンドで不明なオプションです: ${token}`);
    }

    entryIds.push(token);
  }

  if (typeof filePath === 'string') {
    const sourcePath = filePath;
    const data = await readJsonFile<unknown>(sourcePath);
    if (!Array.isArray(data)) {
      throw new CliError('--file で指定した JSON が配列ではありません。');
    }

    for (const value of data) {
      if (typeof value !== 'string') {
        throw new CliError('削除対象の ID は文字列で定義してください。');
      }
      entryIds.push(value);
    }
  }

  if (entryIds.length === 0) {
    throw new CliError('削除対象の entryId を 1 件以上指定してください。');
  }

  const deleted = await deleteEntryRecords(entryIds);

  if (global.json) {
    logJson({ deletedEntryIds: deleted });
  } else {
    console.log(`削除したエントリ: ${deleted.join(', ')}`);
  }
};

const printHelp = (): void => {
  console.log(`Usage: side-context-mcp [command] [options]\n\nCommands:\n  server [--transport <stdio|httpStream>]    MCP サーバーを起動します。\n  create --title <title> [--note <note>]    やることエントリを追加します。\n         --file <path>                      JSON 配列からまとめて追加します。\n  list [--include-done] [--format json]     登録済みエントリを一覧表示します。\n  active show|set <id>|clear               アクティブエントリを確認・変更します。\n  update <id> [--note <note>] [--status <value>]  エントリを更新します。\n  delete <id...> [--file <path>]           エントリを削除します。\n\nGlobal options:\n  --home <path>   データディレクトリを上書きします。\n  --json          出力を JSON 形式に固定します。\n`);
};

const handleError = (error: unknown): void => {
  if (error instanceof CliError) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  if (error instanceof UserError) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  if (error instanceof Error) {
    console.error('[side-context-mcp] 予期しないエラーが発生しました:', error.message);
    process.exitCode = 1;
    return;
  }

  console.error('[side-context-mcp] 予期しないエラーが発生しました。');
  process.exitCode = 1;
};

export const runCli = async (
  options: RunCliOptions = {},
): Promise<void> => {
  const argv = options.argv ?? process.argv.slice(2);

  let parsed: ParsedArguments;
  try {
    parsed = parseArguments(argv);
  } catch (error: unknown) {
    handleError(error);
    return;
  }

  applyGlobalOptions(parsed.global);

  if (parsed.command === 'help') {
    printHelp();
    return;
  }

  try {
    switch (parsed.command) {
      case 'server':
        await handleServerCommand(parsed.args);
        break;
      case 'create':
        await handleCreateCommand(parsed.args, parsed.global);
        break;
      case 'list':
        await handleListCommand(parsed.args, parsed.global);
        break;
      case 'active':
        await handleActiveCommand(parsed.args, parsed.global);
        break;
      case 'update':
        await handleUpdateCommand(parsed.args, parsed.global);
        break;
      case 'delete':
        await handleDeleteCommand(parsed.args, parsed.global);
        break;
      default:
        throw new CliError('未対応のコマンドです。');
    }
  } catch (error: unknown) {
    handleError(error);
  }
};

const isExecutedDirectly = (): boolean => {
  const currentFile = fileURLToPath(import.meta.url);
  const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
  return invokedFile !== undefined && currentFile === invokedFile;
};

if (isExecutedDirectly()) {
  runCli().catch((error) => {
    handleError(error);
  });
}
