import { describe, expect, it } from 'vitest';
import { UserError } from 'fastmcp';
import type { Context } from 'fastmcp';
import { buildTaskTools } from '../../src/mcp/tools.js';

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

describe('buildTaskTools', () => {
  it('タスク操作系ツールがすべて定義されていることを確認する', () => {
    const tools = buildTaskTools();
    const toolNames = tools.map(({ name }) => name);

    expect(toolNames).toEqual([
      'createTask',
      'setActiveTask',
      'getActiveTask',
      'markTaskStatus',
      'appendTaskNote',
      'updateTaskNextSteps',
      'addBlocker',
      'resolveBlocker',
      'addIssueLink',
      'addPRLink',
      'listTasks',
      'getTask',
    ]);
  });

  it('createTask ツールの引数スキーマが必須項目と型制約を満たすか検証する', () => {
    const tools = buildTaskTools();
    const createTask = tools.find(({ name }) => name === 'createTask');
    expect(createTask).toBeDefined();
    const params = createTask?.parameters as
      | { parse: (value: unknown) => unknown }
      | undefined;
    expect(params).toBeDefined();
    expect(() =>
      params?.parse({ title: 'Implement MCP', goal: 'Server skeleton ready' }),
    ).not.toThrow();
    expect(() => params?.parse({ title: 'Missing goal' })).toThrow();
    expect(() =>
      params?.parse({ title: 'Bad priority', goal: 'test', priority: 'high' }),
    ).toThrow();
  });

  it('各ツールの execute が未実装プレースホルダーとして UserError を送出する', async () => {
    const tools = buildTaskTools();
    const context = createContextStub();

    const sampleArgs: Record<string, unknown> = {
      createTask: { title: 'Sample', goal: 'Goal' },
      setActiveTask: { taskId: 'task_00001' },
      getActiveTask: {},
      markTaskStatus: { taskId: 'task_00001', status: 'active' },
      appendTaskNote: {
        taskId: 'task_00001',
        kind: 'observation',
        body: 'note',
      },
      updateTaskNextSteps: {
        taskId: 'task_00001',
        nextSteps: ['Implement test'],
      },
      addBlocker: {
        taskId: 'task_00001',
        blockingTaskId: 'task_00002',
        reason: 'Dependent feature',
      },
      resolveBlocker: {
        taskId: 'task_00001',
        blockingTaskId: 'task_00002',
      },
      addIssueLink: {
        taskId: 'task_00001',
        issueId: '123',
        url: 'https://tracker.example/issues/123',
      },
      addPRLink: {
        taskId: 'task_00001',
        prUrl: 'https://git.example/pr/1',
      },
      listTasks: {},
      getTask: {
        taskId: 'task_00001',
      },
    };

    for (const tool of tools) {
      const args = sampleArgs[tool.name] ?? {};
      await expect(tool.execute(args as never, context)).rejects.toBeInstanceOf(UserError);
      await expect(tool.execute(args as never, context)).rejects.toThrow(
        /not implemented/i,
      );
    }
  });
});
