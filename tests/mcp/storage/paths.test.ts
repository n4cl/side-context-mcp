import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import {
  resolveBaseDir,
  resolveEntriesDir,
  SIDE_CONTEXT_HOME_ENV,
} from '../../../src/mcp/storage/paths.js';

describe('resolveBaseDir', () => {
  let originalValue: string | undefined;

  beforeEach(() => {
    originalValue = process.env[SIDE_CONTEXT_HOME_ENV];
  });

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env[SIDE_CONTEXT_HOME_ENV];
    } else {
      process.env[SIDE_CONTEXT_HOME_ENV] = originalValue;
    }
  });

  it('環境変数が未設定ならデフォルトディレクトリを返す', () => {
    delete process.env[SIDE_CONTEXT_HOME_ENV];
    const expected = path.join(os.homedir(), '.side-context-mcp');
    expect(resolveBaseDir()).toBe(expected);
  });

  it('環境変数が空文字の場合はデフォルトにフォールバックする', () => {
    process.env[SIDE_CONTEXT_HOME_ENV] = '';
    const expected = path.join(os.homedir(), '.side-context-mcp');
    expect(resolveBaseDir()).toBe(expected);
  });

  it('環境変数に "undefined" が指定された場合はその値を採用する', () => {
    // Inspector 側から文字列 "undefined" が届いたときはそのまま解決する。
    process.env[SIDE_CONTEXT_HOME_ENV] = 'undefined';

    const expected = path.resolve('undefined');
    expect(resolveBaseDir()).toBe(expected);
  });
});

describe('resolveEntriesDir', () => {
  afterEach(() => {
    delete process.env[SIDE_CONTEXT_HOME_ENV];
  });

  it('ベースパスに "entries" を連結する', () => {
    process.env[SIDE_CONTEXT_HOME_ENV] = '/tmp/side-context';
    expect(resolveEntriesDir()).toBe('/tmp/side-context/entries');
  });
});
