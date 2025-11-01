import { beforeEach, describe, expect, it, vi } from 'vitest';

const addToolsMock = vi.fn();
const startMock = vi.fn();
const stopMock = vi.fn();

vi.mock('fastmcp', () => {
  const FastMCP = vi.fn(function FastMCPMock(this: unknown, options: unknown) {
    void options;
    return {
      addTools: addToolsMock,
      start: startMock,
      stop: stopMock,
    };
  });

  class MockUserError extends Error {}

  return {
    FastMCP,
    UserError: MockUserError,
  };
});

const buildEntryToolsMock = vi.fn();

vi.mock('../../src/mcp/tools.js', async (importOriginal) => {
  try {
    const actual = await importOriginal<typeof import('../../src/mcp/tools.js')>();
    return {
      ...actual,
      buildEntryTools: buildEntryToolsMock,
    };
  } catch {
    return {
      buildEntryTools: buildEntryToolsMock,
    };
  }
});

describe('createSideContextServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildEntryToolsMock.mockReturnValue([
      { name: 'mock', description: '', execute: vi.fn(), parameters: undefined },
    ]);
  });

  it('FastMCP サーバー生成時にプレースホルダーのツール群が登録される', async () => {
    const { createSideContextServer } = await import('../../src/mcp/server.js');

    const server = createSideContextServer();

    const { FastMCP } = await import('fastmcp');

    expect(FastMCP).toHaveBeenCalledWith({
      name: 'side-context-mcp',
      version: '0.1.0',
      instructions: expect.stringMatching(/side-context-mcp/i),
    });

    expect(buildEntryToolsMock).toHaveBeenCalledTimes(1);
    expect(addToolsMock).toHaveBeenCalledWith([
      { name: 'mock', description: '', execute: expect.any(Function), parameters: undefined },
    ]);
    expect(server).toMatchObject({
      start: expect.any(Function),
      stop: expect.any(Function),
    });
  });
});
