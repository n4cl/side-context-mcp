import { FastMCP } from 'fastmcp';
import { buildTaskTools } from './tools.js';

const SERVER_NAME = 'side-context-mcp';
const SERVER_VERSION = '0.1.0';
const SERVER_INSTRUCTIONS =
  'side-context-mcp MCP server exposing task management operations.';

export const createSideContextServer = () => {
  const server = new FastMCP({
    name: SERVER_NAME,
    version: SERVER_VERSION,
    instructions: SERVER_INSTRUCTIONS,
  });

  server.addTools(buildTaskTools());

  return server;
};

export const serverMetadata = {
  name: SERVER_NAME,
  version: SERVER_VERSION,
  instructions: SERVER_INSTRUCTIONS,
};
