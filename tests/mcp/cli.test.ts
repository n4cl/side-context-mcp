import { beforeEach, describe, expect, it, vi } from 'vitest';

const createSideContextServerMock = vi.fn();
const startMock = vi.fn();

vi.mock('../../src/mcp/server.js', () => ({
  createSideContextServer: createSideContextServerMock,
  serverMetadata: {
    name: 'side-context-mcp',
    version: '0.1.0',
    instructions: 'test instructions',
  },
}));

describe('runSideContextServer', () => {
  beforeEach(() => {
    startMock.mockReset();
    createSideContextServerMock.mockReset();
    createSideContextServerMock.mockReturnValue({
      start: startMock,
    });
  });

  it('FastMCP サーバーを stdio トランスポートで起動する', async () => {
    const { runSideContextServer } = await import('../../src/mcp/cli.js');

    await runSideContextServer();

    expect(createSideContextServerMock).toHaveBeenCalledTimes(1);
    expect(startMock).toHaveBeenCalledWith({ transportType: 'stdio' });
  });
});
