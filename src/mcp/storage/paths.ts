import os from 'node:os';
import path from 'node:path';

export const SIDE_CONTEXT_HOME_ENV = 'SIDE_CONTEXT_MCP_HOME';

const DEFAULT_HOME_DIR = '.side-context-mcp';

/**
 * エントリ関連のデータを保存するルートディレクトリを解決する。
 * `SIDE_CONTEXT_MCP_HOME` が設定されていればそれを優先する。
 */
export const resolveBaseDir = (): string => {
  const override = process.env[SIDE_CONTEXT_HOME_ENV];
  if (override && override.trim().length > 0) {
    return path.resolve(override);
  }

  return path.join(os.homedir(), DEFAULT_HOME_DIR);
};

/**
 * エントリ JSON が保存されるディレクトリを解決する。
 */
export const resolveEntriesDir = (): string => {
  return path.join(resolveBaseDir(), 'entries');
};

/**
 * 現在のアクティブエントリを記録するファイルパスを解決する。
 */
export const resolveActiveFile = (): string => {
  return path.join(resolveBaseDir(), 'active.json');
};

/**
 * 生成済み Markdown ビューを格納するディレクトリを解決する。
 */
export const resolveViewsDir = (): string => {
  return path.join(resolveBaseDir(), 'views');
};

/**
 * アクティブエントリのダッシュボードとして表示する Markdown ファイルのパスを解決する。
 */
export const resolveActiveEntryView = (): string => {
  return path.join(resolveViewsDir(), 'active-entry.md');
};
