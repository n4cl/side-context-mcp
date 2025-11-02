import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SIDE_CONTEXT_HOME_ENV } from '../../src/mcp/storage/paths.js';

const importCli = async () => {
  vi.resetModules();
  return import('../../src/bin/side-context-mcp.ts');
};

const captureConsole = () => {
  const logs: string[] = [];
  const errors: string[] = [];

  const logSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
    logs.push(args.join(' '));
  });
  const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
    errors.push(args.join(' '));
  });

  return {
    logs,
    errors,
    restore: () => {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    },
  };
};

describe('cli entry commands', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'side-context-cli-'));
    process.env[SIDE_CONTEXT_HOME_ENV] = tempDir;
  });

  afterEach(async () => {
    delete process.env[SIDE_CONTEXT_HOME_ENV];
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('create → list でエントリを確認できる', async () => {
    const { runCli } = await importCli();

    await runCli({ argv: ['create', '--title', 'CLI 作成テスト', '--note', 'note'] });

    const capture = captureConsole();
    await runCli({ argv: ['--json', 'list'] });

    const output = capture.logs.at(-1);
    capture.restore();

    expect(output).toBeDefined();
    const parsed = JSON.parse(output ?? '[]') as Array<{ title: string }>;
    expect(parsed[0]?.title).toBe('CLI 作成テスト');
  });

  it('active set/show/clear でアクティブエントリを切り替える', async () => {
    const { runCli } = await importCli();

    await runCli({ argv: ['create', '--title', 'アクティブ対象'] });

    const entriesDir = path.join(tempDir, 'entries');
    const files = await fs.readdir(entriesDir);
    const entryId = files[0]?.replace(/\.json$/u, '');
    expect(entryId).toBeDefined();

    await runCli({ argv: ['active', 'set', entryId ?? ''] });

    const capture = captureConsole();
    await runCli({ argv: ['--json', 'active', 'show'] });

    const output = capture.logs.at(-1);
    capture.restore();

    expect(output).toBeDefined();
    const parsed = JSON.parse(output ?? 'null') as { entryId?: string } | null;
    expect(parsed?.entryId).toBe(entryId);

    await runCli({ argv: ['active', 'clear'] });

    const activeJsonPath = path.join(tempDir, 'active.json');
    await expect(fs.stat(activeJsonPath)).rejects.toBeDefined();
  });
});

