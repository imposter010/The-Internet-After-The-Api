import { resolve } from 'node:path';
import { createServer } from 'vite';

const server = await createServer({ root: resolve('apps/console'), server: { host: '127.0.0.1', port: 5183, strictPort: true } });
await server.listen();
const stop = async () => { await server.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
