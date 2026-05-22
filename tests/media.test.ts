import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { generateImage, generateSpeech, generateVideo } from '../src/media.js';
import { buildGrokResponsesContent } from '../src/grok/media.js';
import { useAI } from '../src/use-ai.js';
import type { AgentArtifactRunner } from '../src/types.js';

describe('media helpers', () => {
  it('builds xAI Responses content for text, image, and file input', () => {
    expect(
      buildGrokResponsesContent({
        provider: 'grok',
        prompt: 'Summarize these inputs',
        media: [
          { type: 'text', text: 'Context before the files' },
          { type: 'image', url: 'https://example.com/screenshot.png', detail: 'high' },
          { type: 'file', fileId: 'file_123' },
        ],
      })
    ).toEqual([
      { type: 'input_text', text: 'Context before the files' },
      { type: 'input_image', image_url: 'https://example.com/screenshot.png', detail: 'high' },
      { type: 'input_file', file_id: 'file_123' },
      { type: 'input_text', text: 'Summarize these inputs' },
    ]);
  });

  it('uses the selected CLI agent path to create local image, video, and voice assets', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'hru-ai-local-media-'));
    const runner: AgentArtifactRunner = async ({ targetPath }) => {
      const body = targetPath.endsWith('.svg')
        ? '<svg xmlns="http://www.w3.org/2000/svg"><text x="8" y="24">local image</text></svg>'
        : targetPath.endsWith('.html')
          ? '<!doctype html><html><body><h1>local video</h1></body></html>'
          : 'RIFF....WAVEfmt ';
      await writeFile(targetPath, body);
      return { ok: true, code: 0, stdout: JSON.stringify({ filePath: targetPath }), stderr: '', timedOut: false };
    };

    try {
      const image = await generateImage({ provider: 'gemini', prompt: 'A product mockup', cwd: dir, artifactRunner: runner });
      expect(image.images[0].url).toContain('data:image/svg+xml;base64,');
      expect(image.images[0].raw).toMatchObject({ mimeType: 'image/svg+xml', filename: 'image.svg' });

      const video = await generateVideo({ provider: 'claude', prompt: 'A launch teaser storyboard', cwd: dir, artifactRunner: runner });
      expect(video.videoUrl).toContain('data:text/html; charset=utf-8;base64,');
      expect(video.raw).toMatchObject({ mimeType: 'text/html; charset=utf-8', filename: 'video.html' });

      const speech = await generateSpeech({ provider: 'codex', text: 'Welcome to the dashboard.', cwd: dir, artifactRunner: runner });
      expect(speech.contentType).toBe('audio/wav');
      expect(new TextDecoder().decode(speech.audio)).toContain('WAVE');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('maps local agent artifacts into useAI assets without throwing for Google', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'hru-ai-use-media-'));
    const runner: AgentArtifactRunner = async ({ targetPath }) => {
      await writeFile(targetPath, targetPath.endsWith('.svg') ? '<svg xmlns="http://www.w3.org/2000/svg" />' : 'asset');
      return { ok: true, code: 0, stdout: JSON.stringify({ filePath: targetPath }), stderr: '', timedOut: false };
    };

    try {
      const image = await useAI({ provider: 'google', output: 'image', prompt: 'A blue CRM dashboard', cwd: dir, artifactRunner: runner });
      expect(image.assets?.[0]).toMatchObject({ kind: 'image', mimeType: 'image/svg+xml', filename: 'image.svg' });
      expect(image.assets?.[0]?.bytes).toBeInstanceOf(Uint8Array);

      const video = await useAI({ provider: 'google', output: 'video', prompt: 'A product intro', cwd: dir, artifactRunner: runner });
      expect(video.asset).toMatchObject({ kind: 'video', mimeType: 'text/html; charset=utf-8', filename: 'video.html' });

      const audio = await useAI({ provider: 'google', output: 'audio', content: 'Read this line aloud.', cwd: dir, artifactRunner: runner });
      expect(audio.asset).toMatchObject({ kind: 'audio', mimeType: 'audio/wav', filename: 'speech.wav' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
