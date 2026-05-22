import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_NAME = '@ignitedaibusiness/ai-connectors';

let cachedRoot: string | null = null;

export function packageRoot(): string {
  if (cachedRoot) return cachedRoot;

  let dir = moduleDir();
  for (let depth = 0; depth < 8; depth += 1) {
    const packageJsonPath = path.join(dir, 'package.json');
    try {
      const parsed = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as { name?: string };
      if (parsed.name === PACKAGE_NAME) {
        cachedRoot = dir;
        return dir;
      }
    } catch {
      // Keep walking up until the package root is found.
    }

    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  cachedRoot = path.resolve(moduleDir(), '..');
  return cachedRoot;
}

export function consumerRootFromPackageRoot(root = packageRoot()): string | null {
  const parts = root.split(path.sep);
  const index = parts.lastIndexOf('node_modules');
  if (index <= 0) return null;
  const prefix = parts.slice(0, index).join(path.sep);
  return prefix || path.sep;
}

function moduleDir(): string {
  if (typeof __dirname === 'string') return __dirname;
  return path.dirname(fileURLToPath(import.meta.url));
}
