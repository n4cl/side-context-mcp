import { UserError, type Tool, type ToolParameters } from 'fastmcp';
import { z } from 'zod';
import { createEntryRecords, type CreateEntryInput } from './storage/entryRepository.js';

const notImplemented = async (): Promise<never> => {
  throw new UserError('Not implemented');
};

type MCPAuth = Record<string, unknown> | undefined;
type MCPTool = Tool<MCPAuth>;

const createEntriesParameters = z.object({
  entries: z
    .array(
      z.object({
        title: z.string().min(1),
        note: z.string().optional(),
      }),
    )
    .min(1),
});

const castSchema = <Schema extends z.ZodTypeAny>(
  schema: Schema,
): ToolParameters => {
  return schema as unknown as ToolParameters;
};

const createPlaceholderTool = (name: string, description: string): MCPTool => {
  return {
    name,
    description,
    execute: notImplemented,
  };
};

/**
 * TODO エントリを扱う MCP ツール群を組み立てる。
 * 現時点で実装済みなのは `createEntries` のみで、他はプレースホルダー。
 */
export const buildEntryTools = (): MCPTool[] => {
  const createEntriesTool: MCPTool = {
    name: 'createEntries',
    description: 'エントリ（TODO）をまとめて追加する。',
    parameters: castSchema(createEntriesParameters),
    execute: async (args) => {
      const parsed = createEntriesParameters.parse(args) as {
        entries: CreateEntryInput[];
      };

      const records = await createEntryRecords(parsed.entries);
      return JSON.stringify({
        entryIds: records.map(({ entryId }) => entryId),
      });
    },
  };

  return [
    createEntriesTool,
    createPlaceholderTool(
      'setActiveEntry',
      'アクティブなエントリを切り替える（未実装）。',
    ),
    createPlaceholderTool(
      'getActiveEntry',
      '現在アクティブなエントリを取得する（未実装）。',
    ),
    createPlaceholderTool(
      'updateEntry',
      'エントリの内容やステータスを更新する（未実装）。',
    ),
    createPlaceholderTool(
      'listEntries',
      '登録済みエントリを一覧表示する（未実装）。',
    ),
  ];
};
