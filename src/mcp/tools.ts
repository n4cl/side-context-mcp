import { UserError, type Tool, type ToolParameters } from 'fastmcp';
import { z } from 'zod';
import {
  createEntryRecords,
  deleteEntryRecords,
  listEntrySummaries,
  updateEntryRecord,
  type CreateEntryInput,
  type UpdateEntryInput,
} from './storage/entryRepository.js';
import {
  getActiveEntryRecord,
  setActiveEntryRecord,
} from './storage/activeEntryRepository.js';

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

const setActiveEntryParameters = z.object({
  entryId: z.union([z.string().min(1), z.null()]),
});

const deleteEntriesParameters = z.object({
  entryIds: z.array(z.string().min(1)).min(1),
});

const updateEntryParameters = z
  .object({
    entryId: z.string().min(1),
    note: z.string().optional(),
    status: z.enum(['todo', 'doing', 'done']).optional(),
  })
  .refine((value) => value.note !== undefined || value.status !== undefined, {
    message: 'note か status のいずれかを指定してください。',
    path: ['note'],
  });

/**
 * やることエントリを扱う MCP ツール群を組み立てる。
 * 現状は `createEntries` と `listEntries` を提供し、残りはプレースホルダー。
 */
export const buildEntryTools = (): MCPTool[] => {
  const createEntriesTool: MCPTool = {
    name: 'createEntries',
    description: `複数のやることエントリを一括登録する。
引数 entries は { title: string, note?: string } の配列で、title には1 行程度の要約、note には補足メモを指定する。
note を省略した場合は空文字で保存され、作成済みエントリの entryId を配列で返す。`,
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
    description: `現在注目しているエントリ（アクティブエントリ）を切り替える。
entryId に既存の ID を渡すと active.json と表示用 Markdown を更新する。
null を渡すとアクティブ状態を解除して (none) 表示に戻す。`,
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
    description: `アクティブなやることエントリを取得する。
返り値は { entryId, title, note, status, createdAt, updatedAt } 形式の JSON もしくは null。
アクティブ未設定の場合は null が返る。`,
    execute: async () => {
      const record = await getActiveEntryRecord();
      return JSON.stringify(record);
    },
  };

  const deleteEntriesTool: MCPTool = {
    name: 'deleteEntries',
    description: `やることエントリをまとめて削除する。
entryIds に文字列 ID を配列で指定する。
存在しない ID が含まれると UserError を返す。
アクティブな ID が含まれている場合は自動的にアクティブ状態を解除してビューを (none) に更新する。`,
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

  const updateEntryTool: MCPTool = {
    name: 'updateEntry',
    description: `既存エントリの note と status を部分更新する。
note に文字列を渡すとメモが上書きされ、空文字を指定するとメモを消去できる。
status は todo / doing / done のいずれか。
更新後は updatedAt が再計算され、アクティブエントリの場合はビューも最新化される。`,
    parameters: castSchema(updateEntryParameters),
    execute: async (args) => {
      const parsed = updateEntryParameters.parse(args) as {
        entryId: string;
        note?: string;
        status?: UpdateEntryInput['status'];
      };

      const updatePayload: UpdateEntryInput = {
        ...(parsed.note !== undefined ? { note: parsed.note } : {}),
        ...(parsed.status !== undefined ? { status: parsed.status } : {}),
      };

      try {
        const record = await updateEntryRecord(parsed.entryId, updatePayload);
        return JSON.stringify(record);
      } catch (error: unknown) {
        if (error instanceof Error) {
          if (/entry not found/i.test(error.message)) {
            throw new UserError('指定したエントリが存在しません。');
          }

          if (/updates must include note or status/i.test(error.message)) {
            throw new UserError('note か status のいずれかを指定してください。');
          }
        }

        throw error;
      }
    },
  };

  const listEntriesTool: MCPTool = {
    name: 'listEntries',
    description: `登録済みエントリの軽量サマリーを取得する。
includeDone を true にすると完了済みも含める。
既定では todo / doing のみを返す。
返り値は { entryId, title, status, updatedAt } の配列。`,
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
    updateEntryTool,
    listEntriesTool,
  ];
};
