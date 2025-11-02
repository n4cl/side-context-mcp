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
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-test-'));
    process.env[SIDE_CONTEXT_HOME_ENV] = tempDir;
  });

  afterEach(async () => {
    delete process.env[SIDE_CONTEXT_HOME_ENV];
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('create コマンドで単一エントリを作成し list で取得できる', async () => {
    const consoleCapture = captureConsole();
    const { runCli } = await importCli();

    await runCli({ argv: ['create', '--title', 'CLI 作成テスト', '--note', 'note'] });

    // list コマンドで確認
    await runCli({ argv: ['list', '--format', 'json'] });

    expect(consoleCapture.logs.pop()).toContain('CLI 作成テスト');
    consoleCapture.restore();
  });

  it('active set/show/clear でアクティブエントリを切り替える', async () => {
    const { runCli } = await importCli();

    await runCli({ argv: ['create', '--title', 'アクティブ対象'] });

    const entriesPath = path.join(tempDir, 'entries');
    const files = await fs.readdir(entriesPath);
    const entryId = files[0].replace(/\.json$/u, '');

    await runCli({ argv: ['active', 'set', entryId] });

    const capture = captureConsole();
    await runCli({ argv: ['active', 'show', '--json'] });
    expect(capture.logs.pop()).toContain(entryId);
    capture.restore();

    await runCli({ argv: ['active', 'clear'] });

    const activeJsonPath = path.join(tempDir, 'active.json');
    await expect(fs.stat(activeJsonPath)).rejects.toBeDefined();
  });
});

