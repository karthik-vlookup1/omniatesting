import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * True when the module at `importMetaUrl` is the process entry point (`tsx file.ts`),
 * so a module can export functions and also act as a CLI.
 */
export function isMainModule(importMetaUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const normalise = (p: string) => {
    const resolved = path.resolve(p);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return normalise(entry) === normalise(fileURLToPath(importMetaUrl));
}
