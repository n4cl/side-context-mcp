import { createSideContextServer, serverMetadata } from './server.js';

export interface RunSideContextServerOptions {
  readonly transportType?: 'stdio' | 'httpStream';
}

const DEFAULT_TRANSPORT: RunSideContextServerOptions['transportType'] = 'stdio';

export const runSideContextServer = async (
  options: RunSideContextServerOptions = {},
): Promise<void> => {
  const transportType = options.transportType ?? DEFAULT_TRANSPORT;
  const server = createSideContextServer();

  console.info(
    `[${serverMetadata.name}] starting (version=${serverMetadata.version}, transport=${transportType})`,
  );

  await server.start({ transportType });
};
