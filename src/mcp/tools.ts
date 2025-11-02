import { UserError, type Tool, type ToolParameters } from 'fastmcp';
import { z } from 'zod';
import {
  createEntryRecords,
  deleteEntryRecords,
  listEntrySummaries,
  type CreateEntryInput,
} from './storage/entryRepository.js';
import {
  getActiveEntryRecord,
  setActiveEntryRecord,
} from './storage/activeEntryRepository.js';

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

const setActiveEntryParameters = z.object({
  entryId: z.union([z.string().min(1), z.null()]),
});

const deleteEntriesParameters = z.object({
  entryIds: z.array(z.string().min(1)).min(1),
});

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

  const setActiveEntryTool: MCPTool = {
    name: 'setActiveEntry',
    description: 'アクティブなエントリを切り替える。',
    parameters: castSchema(setActiveEntryParameters),
    execute: async (args) => {
      const parsed = setActiveEntryParameters.parse(args) as {
        entryId: string | null;
      };

      try {
        const record = await setActiveEntryRecord(parsed.entryId);
        return JSON.stringify(record);
      } catch (error: unknown) {
        if (error instanceof Error && /entry not found/i.test(error.message)) {
          throw new UserError('指定したエントリが存在しません。');
        }

        throw error;
      }
    },
  };

  const getActiveEntryTool: MCPTool = {
    name: 'getActiveEntry',
    description: 'アクティブなやることエントリを取得する。',
    execute: async () => {
      const record = await getActiveEntryRecord();
      return JSON.stringify(record);
    },
  };

  const deleteEntriesTool: MCPTool = {
    name: 'deleteEntries',
    description: 'やることエントリをまとめて削除する。',
    parameters: castSchema(deleteEntriesParameters),
    execute: async (args) => {
      const parsed = deleteEntriesParameters.parse(args) as {
        entryIds: string[];
      };

      try {
        const deleted = await deleteEntryRecords(parsed.entryIds);
        return JSON.stringify({ deletedEntryIds: deleted });
      } catch (error: unknown) {
        if (error instanceof Error && /entry not found/i.test(error.message)) {
          throw new UserError('削除対象のエントリが見つかりません。');
        }

        throw error;
      }
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
    setActiveEntryTool,
    getActiveEntryTool,
    deleteEntriesTool,
    createPlaceholderTool(
      'updateEntry',
      'エントリの内容やステータスを更新する（未実装）。',
    ),
    listEntriesTool,
  ];
};
