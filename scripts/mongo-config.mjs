import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function mongoBinary() {
  const local = resolve('.cache/mongodb-runtime', process.platform === 'win32' ? 'mongod.exe' : 'mongod');
  const systemBinary = process.env.MONGOMS_SYSTEM_BINARY || (existsSync(local) ? local : undefined);
  return { downloadDir: resolve('.cache/mongodb-binaries'), version: process.env.MONGOMS_VERSION || '7.0.24', ...(systemBinary ? { systemBinary } : {}) };
}
