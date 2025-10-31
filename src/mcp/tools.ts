import { UserError, type Tool, type ToolParameters } from 'fastmcp';
import { z } from 'zod';

const notImplemented = async (): Promise<never> => {
  throw new UserError('Not implemented');
};

const createTaskParameters = z.object({
  title: z.string(),
  goal: z.string(),
  priority: z.number().int().optional(),
});

const setActiveTaskParameters = z.object({
  taskId: z.string(),
});

const markTaskStatusParameters = z.object({
  taskId: z.string(),
  status: z.enum([
    'planned',
    'active',
    'blocked',
    'ready_for_commit',
    'done',
    'dropped',
  ]),
});

const appendTaskNoteParameters = z.object({
  taskId: z.string(),
  kind: z.enum(['observation', 'decision', 'todo', 'question', 'misc']),
  body: z.string(),
  relatedFiles: z.array(z.string()).optional(),
});

const updateTaskNextStepsParameters = z.object({
  taskId: z.string(),
  nextSteps: z.array(z.string()),
});

const addBlockerParameters = z.object({
  taskId: z.string(),
  blockingTaskId: z.string(),
  reason: z.string(),
});

const resolveBlockerParameters = z.object({
  taskId: z.string(),
  blockingTaskId: z.string(),
});

const addIssueLinkParameters = z.object({
  taskId: z.string(),
  issueId: z.string(),
  url: z.string().url().optional(),
});

const addPRLinkParameters = z.object({
  taskId: z.string(),
  prUrl: z.string().url(),
});

const getTaskParameters = z.object({
  taskId: z.string(),
});

type MCPAuth = Record<string, unknown> | undefined;
type MCPTool = Tool<MCPAuth>;

const placeholderExecute: MCPTool['execute'] = async (..._args) => notImplemented();

const castSchema = <Schema extends z.ZodTypeAny>(
  schema: Schema,
): ToolParameters => {
  return schema as unknown as ToolParameters;
};

interface PlaceholderConfig {
  readonly name: string;
  readonly description: string;
  readonly parameters?: z.ZodTypeAny;
}

const createPlaceholderTool = (config: PlaceholderConfig): MCPTool => {
  const tool: Partial<MCPTool> & Pick<MCPTool, 'name' | 'description' | 'execute'> = {
    name: config.name,
    description: config.description,
    execute: placeholderExecute,
  };

  if (config.parameters) {
    tool.parameters = castSchema(config.parameters);
  }

  return tool as MCPTool;
};

export const buildTaskTools = (): MCPTool[] => {
  return [
    createPlaceholderTool({
      name: 'createTask',
      description: 'Create a new task record in the side-context store.',
      parameters: createTaskParameters,
    }),
    createPlaceholderTool({
      name: 'setActiveTask',
      description: 'Set the currently active task identifier.',
      parameters: setActiveTaskParameters,
    }),
    createPlaceholderTool({
      name: 'getActiveTask',
      description: 'Retrieve the currently active task.',
    }),
    createPlaceholderTool({
      name: 'markTaskStatus',
      description: 'Update the status for a task.',
      parameters: markTaskStatusParameters,
    }),
    createPlaceholderTool({
      name: 'appendTaskNote',
      description: 'Append a note entry to a task.',
      parameters: appendTaskNoteParameters,
    }),
    createPlaceholderTool({
      name: 'updateTaskNextSteps',
      description: 'Replace the next-steps list for a task.',
      parameters: updateTaskNextStepsParameters,
    }),
    createPlaceholderTool({
      name: 'addBlocker',
      description: 'Register a blocking dependency for a task.',
      parameters: addBlockerParameters,
    }),
    createPlaceholderTool({
      name: 'resolveBlocker',
      description: 'Mark a previously registered blocker as resolved.',
      parameters: resolveBlockerParameters,
    }),
    createPlaceholderTool({
      name: 'addIssueLink',
      description: 'Attach an issue tracker reference to a task.',
      parameters: addIssueLinkParameters,
    }),
    createPlaceholderTool({
      name: 'addPRLink',
      description: 'Attach a pull request reference to a task.',
      parameters: addPRLinkParameters,
    }),
    createPlaceholderTool({
      name: 'listTasks',
      description: 'List lightweight information about all tasks.',
    }),
    createPlaceholderTool({
      name: 'getTask',
      description: 'Retrieve a full task record by identifier.',
      parameters: getTaskParameters,
    }),
  ];
};
