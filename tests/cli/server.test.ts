import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const importCli = async () => {
  vi.resetModules();
  return import('../../src/bin/side-context-mcp.ts');
};

describe('cli server command', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('起動引数なしで server コマンドを呼び出す', async () => {
    const startMock = vi.fn();

    vi.doMock('../../src/mcp/cli.js', () => ({
      runSideContextServer: startMock,
    }));

    const { runCli } = await importCli();

    await runCli({ argv: [] });

    expect(startMock).toHaveBeenCalledWith({ transportType: 'stdio' });
  });

  it('transport オプションを指定して server を起動する', async () => {
    const startMock = vi.fn();

    vi.doMock('../../src/mcp/cli.js', () => ({
      runSideContextServer: startMock,
    }));

    const { runCli } = await importCli();

    await runCli({ argv: ['server', '--transport', 'httpStream'] });

    expect(startMock).toHaveBeenCalledWith({ transportType: 'httpStream' });
  });
});

