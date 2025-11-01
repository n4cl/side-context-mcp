import { FastMCP } from 'fastmcp';
import { buildEntryTools } from './tools.js';

const SERVER_NAME = 'side-context-mcp';
const SERVER_VERSION = '0.1.0';
const SERVER_INSTRUCTIONS =
  'side-context-mcp MCP server providing shared entry memo operations.';

/**
 * やることエントリ向けツールを公開する FastMCP サーバーを生成し初期化する。
 */
export const createSideContextServer = () => {
  const server = new FastMCP({
    name: SERVER_NAME,
    version: SERVER_VERSION,
    instructions: SERVER_INSTRUCTIONS,
  });

  server.addTools(buildEntryTools());

  return server;
};

/**
 * 公開しているサーバーのメタデータ。
 */
export const serverMetadata = {
  name: SERVER_NAME,
  version: SERVER_VERSION,
  instructions: SERVER_INSTRUCTIONS,
};
