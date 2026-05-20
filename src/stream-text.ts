import { generateText } from './generate-text.js';
import type { GenerateTextChunk, GenerateTextInput } from './types.js';

export async function* streamText(input: GenerateTextInput): AsyncIterable<GenerateTextChunk> {
  const result = await generateText(input);
  yield {
    provider: result.provider,
    model: result.model,
    textDelta: result.text,
    raw: result.raw,
  };
  yield {
    provider: result.provider,
    model: result.model,
    done: true,
  };
}
