import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import type { CliResult, RunCliOptions, SpawnCliOptions } from '../types.js';
import { sanitizedCliEnv } from '../env.js';
import { consumerRootFromPackageRoot, packageRoot } from '../package-root.js';

export function localBinPath(name: string, cwd = process.cwd()): string {
  const suffix = process.platform === 'win32' ? '.cmd' : '';
  return path.join(cwd, 'node_modules', '.bin', `${name}${suffix}`);
}

export function findExecutable(name: string, cwd = process.cwd(), env: NodeJS.ProcessEnv = process.env): string | null {
  const suffix = process.platform === 'win32' ? '.cmd' : '';
  const ownPackageRoot = packageRoot();
  const consumerRoot = consumerRootFromPackageRoot(ownPackageRoot);
  const candidates = unique([
    localBinPath(name, cwd),
    localBinPath(name, process.cwd()),
    localBinPath(name, ownPackageRoot),
    ...(consumerRoot ? [localBinPath(name, consumerRoot)] : []),
  ]);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }

  const pathValue = env.PATH || '';
  for (const dir of pathValue.split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(dir, `${name}${suffix}`);
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function localBinaryExists(name: string, cwd = process.cwd(), env: NodeJS.ProcessEnv = process.env): boolean {
  return !!findExecutable(name, cwd, env);
}

export function requireExecutable(name: string, cwd = process.cwd(), env: NodeJS.ProcessEnv = process.env): string {
  const executable = findExecutable(name, cwd, env);
  if (!executable) {
    throw new Error(`Missing CLI binary: ${name}`);
  }
  return executable;
}

export function spawnExecutable(name: string, args: string[], options: SpawnCliOptions = {}): ChildProcess {
  const cwd = options.cwd || process.cwd();
  const executable = requireExecutable(name, cwd);
  const env = sanitizedCliEnv(process.env, options.env || {});
  return spawn(executable, args, {
    cwd,
    env,
    stdio: options.stdio || ['pipe', 'pipe', 'pipe'],
  });
}

export function runExecutable(name: string, args: string[], options: RunCliOptions = {}): Promise<CliResult> {
  const timeoutMs = options.timeoutMs ?? 120000;
  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      child = spawnExecutable(name, args, {
        cwd: options.cwd,
        env: options.env,
        stdio: 'pipe',
      });
    } catch (error) {
      resolve({
        ok: false,
        code: null,
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        timedOut: false,
      });
      return;
    }

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill('SIGTERM');
      } catch {
        // noop
      }
      resolve({ ok: false, code: null, stdout, stderr, timedOut: true });
    }, timeoutMs);

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: code === 0, code, stdout, stderr, timedOut: false });
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, code: null, stdout, stderr: error.message, timedOut: false });
    });

    if (options.input) child.stdin?.write(options.input);
    child.stdin?.end();
  });
}
