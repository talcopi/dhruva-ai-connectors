import { isSecretKey } from '../env.js';

const SECRET_VALUE_PATTERNS = [
  /(xai-[A-Za-z0-9_-]+)/g,
  /(sk-[A-Za-z0-9_-]+)/g,
  /(sk-ant-[A-Za-z0-9_-]+)/g,
  /(ya29\.[A-Za-z0-9_-]+)/g,
  /(eyJ[A-Za-z0-9_.-]+)/g,
];

export function sanitizeOutput(text = ''): string {
  let next = text;
  for (const pattern of SECRET_VALUE_PATTERNS) {
    next = next.replace(pattern, '[REDACTED]');
  }
  next = next.replace(/([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|URI|URL|CREDENTIALS))=([^\s]+)/gi, (_m, key) => {
    return `${key}=[REDACTED]`;
  });
  return next;
}

export function sanitizeRecord(record: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = isSecretKey(key) ? '[REDACTED]' : value;
  }
  return result;
}
