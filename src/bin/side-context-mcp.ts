#!/usr/bin/env node
import { runSideContextServer } from '../mcp/cli.js';

const main = async (): Promise<void> => {
  try {
    await runSideContextServer();
  } catch (error) {
    console.error('[side-context-mcp] failed to start server:', error);
    process.stderr.write('MCP server terminated unexpectedly.\n');
    process.exitCode = 1;
  }
};

void main();
