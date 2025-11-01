import { UserError, type Tool, type ToolParameters } from 'fastmcp';
import { z } from 'zod';
import {
  createEntryRecords,
  listEntrySummaries,
  type CreateEntryInput,
} from './storage/entryRepository.js';

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
 * やることエントリを扱う MCP ツール群を組み立てる。
 * 現状は `createEntries` と `listEntries` を提供し、残りはプレースホルダー。
 */
export const buildEntryTools = (): MCPTool[] => {
  const createEntriesTool: MCPTool = {
    name: 'createEntries',
    description: 'エントリ（やることメモ）をまとめて追加する。',
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

  const listEntriesTool: MCPTool = {
    name: 'listEntries',
    description: '登録済みのやることエントリを取得する。',
    parameters: castSchema(
      z
        .object({
          includeDone: z.boolean().optional(),
        })
        .optional(),
    ),
    execute: async (args) => {
      const parsed = (args as { includeDone?: boolean } | undefined) ?? {};
      const summaries = await listEntrySummaries({
        includeDone: parsed.includeDone === true,
      });
      return JSON.stringify(summaries);
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
    listEntriesTool,
  ];
};
