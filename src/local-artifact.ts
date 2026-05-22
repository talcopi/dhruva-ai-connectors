import crypto from 'node:crypto';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { ProviderGenerationError, ProviderNotConnectedError, ProviderNotInstalledError } from './errors.js';
import { modelFromEnv } from './env.js';
import { PROVIDERS } from './providers.js';
import { runExecutable } from './process/run-cli.js';
import { sanitizeOutput } from './process/sanitize-output.js';
import { runtimeProviderStatus } from './runtime.js';
import { codexCliEnv } from './codex/utils.js';
import { claudeCliEnv } from './claude/utils.js';
import { geminiCliEnv } from './gemini/utils.js';
import { grokCliEnv } from './grok/utils.js';
import type {
  AgentArtifactRunnerInput,
  CliResult,
  GenerateLocalArtifactInput,
  GenerateLocalArtifactResult,
  LocalArtifactKind,
} from './types.js';

const DEFAULT_TIMEOUT_MS = 180000;
const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;

export const LOCAL_ARTIFACT_SKILLS: Record<LocalArtifactKind, string> = {
  image:
    'Create a local visual asset. SVG is preferred because it is portable, inspectable, and can be displayed directly in browsers.',
  video:
    'Create a local motion artifact. If an MP4/WebM encoder is available, create that file. Otherwise create a self-contained animated HTML/SVG file.',
  audio:
    'Create a local audio artifact when local audio tooling is available. If true speech synthesis is unavailable, write the closest useful local artifact requested by the filename/instructions.',
  pdf: 'Create a local PDF artifact.',
  doc: 'Create a local document artifact.',
  docx: 'Create a local document artifact.',
  excel: 'Create a local spreadsheet artifact.',
  xlsx: 'Create a local spreadsheet artifact.',
  csv: 'Create a local CSV artifact.',
  file: 'Create the requested local file artifact.',
};

export async function generateLocalArtifact(input: GenerateLocalArtifactInput): Promise<GenerateLocalArtifactResult> {
  const provider = input.provider || 'codex';
  const env = input.env || process.env;
  const cwd = path.resolve(input.cwd || process.cwd());
  const model = input.model || modelFromEnv(provider, PROVIDERS[provider].defaultModel, env);
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const outputDir = path.resolve(cwd, input.outputDir || path.join('.hru-ai', 'artifacts', `${provider}-${Date.now()}-${crypto.randomUUID()}`));
  const filename = safeFilename(input.filename || defaultArtifactFilename(input.kind));
  const targetPath = path.resolve(outputDir, filename);
  const mimeType = input.mimeType || mimeTypeForFilename(filename);

  if (!isInsideDir(targetPath, outputDir)) {
    throw new Error(`Artifact filename must stay inside outputDir: ${filename}`);
  }

  await fsp.mkdir(outputDir, { recursive: true });
  const prompt = buildLocalArtifactPrompt({
    kind: input.kind,
    prompt: input.prompt,
    targetPath,
    filename,
    mimeType,
    instructions: input.instructions,
  });

  const runner = input.artifactRunner || runProviderArtifactAgent;
  const result = await runner({
    provider,
    model,
    prompt,
    cwd,
    outputDir,
    targetPath,
    timeoutMs,
    auth: input.auth,
    env,
    permissionMode: input.permissionMode || 'write',
  });

  if (result.timedOut) throw new ProviderGenerationError(provider, `${PROVIDERS[provider].label} artifact generation timed out`);
  if (!result.ok) {
    throw new ProviderGenerationError(
      provider,
      sanitizeOutput(result.stderr || result.stdout || `${PROVIDERS[provider].label} artifact generation failed`)
    );
  }

  const filePath = await resolveArtifactPath(outputDir, targetPath, result.stdout);
  if (!filePath) {
    throw new ProviderGenerationError(
      provider,
      sanitizeOutput(
        [
          `${PROVIDERS[provider].label} completed but did not create an artifact file.`,
          `Expected: ${targetPath}`,
          result.stdout,
          result.stderr,
        ]
          .filter(Boolean)
          .join('\n')
      )
    );
  }

  const stat = await fsp.stat(filePath);
  const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES;
  if (stat.size > maxBytes) {
    throw new ProviderGenerationError(provider, `Generated artifact is too large (${stat.size} bytes, max ${maxBytes})`);
  }

  const bytes = await fsp.readFile(filePath);
  const finalMimeType = input.mimeType || mimeTypeForFilename(filePath);
  return {
    provider,
    model,
    kind: input.kind,
    filename: path.basename(filePath),
    filePath,
    mimeType: finalMimeType,
    bytes,
    text: isTextMime(finalMimeType) ? bytes.toString('utf8') : undefined,
    raw: {
      filePath,
      outputDir,
      stdout: sanitizeOutput(result.stdout),
      stderr: sanitizeOutput(result.stderr),
      code: result.code,
    },
  };
}

export function dataUrlForArtifact(artifact: Pick<GenerateLocalArtifactResult, 'mimeType' | 'bytes'>): string {
  return `data:${artifact.mimeType};base64,${Buffer.from(artifact.bytes).toString('base64')}`;
}

export function defaultArtifactFilename(kind: LocalArtifactKind): string {
  if (kind === 'image') return 'image.svg';
  if (kind === 'video') return 'video.html';
  if (kind === 'audio') return 'speech.wav';
  if (kind === 'pdf') return 'document.pdf';
  if (kind === 'doc' || kind === 'docx') return 'document.doc';
  if (kind === 'excel' || kind === 'xlsx') return 'workbook.xls';
  if (kind === 'csv') return 'data.csv';
  return 'artifact.txt';
}

export function mimeTypeForFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.html' || ext === '.htm') return 'text/html; charset=utf-8';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.ogg') return 'audio/ogg';
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.doc') return 'application/msword';
  if (ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (ext === '.xls') return 'application/vnd.ms-excel';
  if (ext === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (ext === '.csv') return 'text/csv; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.txt' || ext === '.md') return 'text/plain; charset=utf-8';
  return 'application/octet-stream';
}

async function runProviderArtifactAgent(input: AgentArtifactRunnerInput): Promise<CliResult> {
  const runtime = runtimeProviderStatus(input.provider, input.cwd, input.env);
  if (!runtime.installed) throw new ProviderNotInstalledError(input.provider, PROVIDERS[input.provider].binary);
  if (!runtime.authConfigured && !input.auth?.apiKey && !input.auth?.oauthToken) {
    throw new ProviderNotConnectedError(input.provider, `${PROVIDERS[input.provider].label} is not connected for local artifact generation.`);
  }

  if (input.provider === 'codex') {
    return runExecutable('codex', ['exec', '--sandbox', 'workspace-write', '--model', input.model, input.prompt], {
      cwd: input.cwd,
      env: codexCliEnv({ OPENAI_API_KEY: input.auth?.apiKey || input.env?.OPENAI_API_KEY }),
      timeoutMs: input.timeoutMs,
    });
  }

  if (input.provider === 'claude') {
    return runExecutable(
      'claude',
      [
        '-p',
        input.prompt,
        '--output-format',
        'json',
        '--model',
        input.model,
        '--permission-mode',
        input.permissionMode === 'full' ? 'bypassPermissions' : 'acceptEdits',
        '--tools',
        input.permissionMode === 'full' ? 'Read,Write,Edit,Bash' : 'Read,Write,Edit',
        '--no-session-persistence',
        '--setting-sources',
        'user',
      ],
      {
        cwd: input.cwd,
        env: claudeCliEnv({
          CLAUDE_CODE_OAUTH_TOKEN: input.auth?.oauthToken || input.env?.CLAUDE_CODE_OAUTH_TOKEN,
          ANTHROPIC_API_KEY: input.auth?.apiKey || input.env?.ANTHROPIC_API_KEY,
        }),
        timeoutMs: input.timeoutMs,
      }
    );
  }

  if (input.provider === 'gemini') {
    return runExecutable(
      'gemini',
      [
        '--prompt',
        input.prompt,
        '--output-format',
        'json',
        '--model',
        input.model,
        '--approval-mode',
        input.permissionMode === 'full' ? 'yolo' : 'auto_edit',
        '--skip-trust',
      ],
      {
        cwd: input.cwd,
        env: geminiCliEnv({
          cwd: input.cwd,
          extra: {
            GEMINI_API_KEY: input.auth?.apiKey || input.env?.GEMINI_API_KEY,
          },
        }),
        timeoutMs: input.timeoutMs,
      }
    );
  }

  return runExecutable('grok', ['-p', input.prompt, '-m', input.model, '--output-format', 'json'], {
    cwd: input.cwd,
    env: grokCliEnv({
      GROK_CODE_XAI_API_KEY: input.auth?.apiKey || input.env?.GROK_CODE_XAI_API_KEY,
      XAI_API_KEY: input.auth?.apiKey || input.env?.XAI_API_KEY,
    }),
    timeoutMs: input.timeoutMs,
  });
}

function buildLocalArtifactPrompt(input: {
  kind: LocalArtifactKind;
  prompt: string;
  targetPath: string;
  filename: string;
  mimeType: string;
  instructions?: string;
}): string {
  return [
    'You are running as a local file-generation agent inside a developer project.',
    LOCAL_ARTIFACT_SKILLS[input.kind],
    '',
    `User request: ${input.prompt}`,
    input.instructions ? `Extra instructions: ${input.instructions}` : '',
    '',
    `Create exactly one ${input.kind} artifact at this absolute path:`,
    input.targetPath,
    '',
    `Required filename: ${input.filename}`,
    `Expected MIME type: ${input.mimeType}`,
    '',
    'Rules:',
    '- Write the artifact file before finishing.',
    '- Keep all generated files inside the target directory.',
    '- Do not ask the user for more input.',
    '- Return JSON only after the file is written.',
    '',
    'Return this JSON shape only:',
    `{"filePath":${JSON.stringify(input.targetPath)},"mimeType":${JSON.stringify(input.mimeType)},"summary":"short summary"}`,
  ]
    .filter(Boolean)
    .join('\n');
}

async function resolveArtifactPath(outputDir: string, targetPath: string, stdout: string): Promise<string | null> {
  const fromJson = parseJsonObject(stdout);
  const candidates = [
    typeof fromJson?.filePath === 'string' ? fromJson.filePath : '',
    typeof fromJson?.path === 'string' ? fromJson.path : '',
    targetPath,
    ...(await listFiles(outputDir)),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const absolute = path.resolve(candidate);
    if (!isInsideDir(absolute, outputDir)) continue;
    try {
      const stat = await fsp.stat(absolute);
      if (stat.isFile()) return absolute;
    } catch {
      // Try next candidate.
    }
  }

  return null;
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  const candidates = [
    trimmed,
    trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] || '',
    trimmed.match(/\{[\s\S]*\}/)?.[0] || '',
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      // Try next candidate.
    }
  }

  return null;
}

function safeFilename(filename: string): string {
  const base = path.basename(filename).replace(/[^\w.\- ]+/g, '_').trim();
  return base || 'artifact.txt';
}

function isInsideDir(filePath: string, dir: string): boolean {
  const relative = path.relative(path.resolve(dir), path.resolve(filePath));
  return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function isTextMime(mimeType: string): boolean {
  return (
    mimeType.startsWith('text/') ||
    mimeType.includes('json') ||
    mimeType.includes('xml') ||
    mimeType.includes('svg') ||
    mimeType.includes('msword') ||
    mimeType.includes('excel')
  );
}
