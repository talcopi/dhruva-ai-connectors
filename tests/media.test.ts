import { describe, expect, it } from 'vitest';
import { generateImage } from '../src/media.js';
import { buildGrokResponsesContent } from '../src/grok/media.js';

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

  it('keeps media generation scoped to Grok API mode', async () => {
    await expect(generateImage({ provider: 'gemini', prompt: 'A product mockup' })).rejects.toMatchObject({
      code: 'PROVIDER_AUTH_UNSUPPORTED',
      provider: 'gemini',
    });
  });
});
