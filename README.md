# @dhruvaaignited/ai-connectors

Short description: OAuth-first multi-provider AI connector for Node.js and Next.js apps.

Description: Connect Codex, Claude Code, Gemini CLI, and Grok with one OAuth-first Node.js API. Manage provider sign-in, runtime status, model selection, text generation, Next.js routes, and Grok media workflows without exposing provider credentials in the browser.

## 0. Install

```bash
npm i @dhruvaaignited/ai-connectors
```

This package targets Node.js `>=20`. Do not import it directly inside React browser components, because provider sign-in and CLI access are server-side concerns. React should call your own Node.js or Next.js API route, and that route should call this package.

Codex, Claude, and Gemini text generation use their provider CLIs. The package includes those CLIs as dependencies, but globally installed CLIs also work.

## 1. Connect Provider OAuth

Supported provider slugs:

```ts
type ProviderSlug = 'codex' | 'claude' | 'gemini' | 'grok';
```

Sign-in summary:

| Provider | Sign-in method | Login command |
| --- | --- | --- |
| `codex` | Codex CLI OAuth/browser sign-in | `codex` |
| `claude` | Claude Code OAuth/browser sign-in | `claude auth login --claudeai` |
| `gemini` | Gemini CLI Google sign-in | `gemini` |
| `grok` | Grok CLI browser sign-in | `grok` |

### 1A. Create a Login Session

Codex, Claude, Gemini, and Grok handle browser sign-in inside their own CLIs. This package does not capture raw callback codes. The app creates a login session, shows the command/instructions to the user, and then checks whether the CLI sign-in has completed.

```js
import { connectProvider, getLoginStatus } from '@dhruvaaignited/ai-connectors';

const session = await connectProvider('gemini', {
  authKind: 'cli_oauth',
  setDefault: true,
});

console.log(session.command);
console.log(session.instructions);

// After the user completes `gemini` sign-in in the terminal:
const status = await getLoginStatus('gemini', session.id);
console.log(status?.status); // "connected" means ready
```

Provider-specific login session examples:

```js
await connectProvider('codex', {
  authKind: 'cli_oauth',
  setDefault: true,
});

await connectProvider('claude', {
  authKind: 'cli_oauth',
  setDefault: true,
});

await connectProvider('gemini', {
  authKind: 'cli_oauth',
  setDefault: true,
});

await connectProvider('grok', {
  authKind: 'cli_browser',
  setDefault: true,
});
```

### 1B. What the User Does After Signup/Login

The user flow is:

1. Your app calls `connectProvider()` and receives a `LoginSession`.
2. Your UI shows `session.command` and `session.instructions`.
3. The user runs the provider command in a terminal.
4. The provider opens the browser for signup/login.
5. If the provider shows a verification code, the user pastes it into the provider CLI terminal prompt.
6. Your app calls `getLoginStatus(provider, session.id)`.
7. When the status becomes `"connected"`, the selected AI provider is ready to use.

```js
async function waitForConnection(provider, sessionId) {
  const status = await getLoginStatus(provider, sessionId);

  if (status?.status === 'connected') {
    return { connected: true };
  }

  return {
    connected: false,
    status: status?.status,
    instructions: status?.instructions,
  };
}
```

### 1C. Interactive Login for Local Tools

For local terminal tools, you can let the package run the provider login command interactively.

```js
import { createAiConnectors } from '@dhruvaaignited/ai-connectors';

const ai = createAiConnectors();

await ai.connectProvider('codex', {
  authKind: 'cli_oauth',
  interactive: true,
  setDefault: true,
});
```

## 2. Use in a Node.js Project

First connect the provider through the OAuth flow, then call `generateText()`.

```js
import {
  connectProvider,
  generateText,
  getLoginStatus,
  runtimeStatus,
  setDefaultProvider,
} from '@dhruvaaignited/ai-connectors';

console.log(await runtimeStatus());

const session = await connectProvider('codex', {
  authKind: 'cli_oauth',
  setDefault: true,
});

console.log(session.instructions);

// After the user completes provider sign-in:
await getLoginStatus('codex', session.id);
await setDefaultProvider('codex');

const result = await generateText({
  prompt: 'Write 5 WhatsApp follow-up replies for a new lead.',
});

console.log(result.text);
```

Call a specific selected provider:

```js
const selectedProvider = 'gemini';

const result = await generateText({
  provider: selectedProvider,
  prompt: 'Explain this order refund policy in simple English.',
});

console.log(result.text);
```

## 3. Choose or Change the AI Model

There is no separate `setModel()` function. The model is selected with the `model` option on the function call.

Use this pattern when the user selects both the provider and model from your UI:

```js
import { generateText } from '@dhruvaaignited/ai-connectors';

async function askSelectedAi({ provider, model, prompt }) {
  const result = await generateText({
    provider,
    model,
    prompt,
  });

  return result.text;
}

const text = await askSelectedAi({
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  prompt: 'Write a short customer support reply.',
});

console.log(text);
```

Provider-specific examples:

```js
await generateText({
  provider: 'codex',
  model: 'gpt-5.5',
  prompt: 'Review this implementation plan.',
});

await generateText({
  provider: 'claude',
  model: 'opus',
  prompt: 'Analyze this complex support escalation.',
});

await generateText({
  provider: 'claude',
  model: 'sonnet',
  prompt: 'Draft a balanced customer support reply.',
});

await generateText({
  provider: 'claude',
  model: 'haiku',
  prompt: 'Classify this message as sales, support, or billing.',
});

await generateText({
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  prompt: 'Create a campaign outline.',
});

await generateText({
  provider: 'grok',
  model: 'grok-4.3',
  prompt: 'Draft a concise product update.',
});
```

Claude Code supports both aliases and pinned model IDs. The aliases are easier for users because Claude Code resolves them to the latest available version for the signed-in account/provider. Use pinned IDs when you want a specific version.

```js
const claudeModels = [
  { value: 'opus', label: 'Claude Opus 4.7', use: 'best for complex coding and reasoning' },
  { value: 'sonnet', label: 'Claude Sonnet 4.6', use: 'balanced speed and intelligence' },
  { value: 'haiku', label: 'Claude Haiku 4.5', use: 'fastest option for simple tasks' },
  { value: 'opus[1m]', label: 'Claude Opus 4.7 1M', use: 'long-context accounts only' },
  { value: 'claude-opus-4-7', label: 'Claude Opus 4.7 pinned', use: 'exact model version' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 pinned', use: 'exact model version' },
  { value: 'claude-opus-4-6', label: 'Claude Opus 4.6 pinned', use: 'older exact model version' },
  { value: 'claude-opus-4-5-20251101', label: 'Claude Opus 4.5 pinned', use: 'dated exact model id' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 pinned', use: 'dated exact model id' },
  { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5 pinned', use: 'dated exact model id' },
];

async function askClaude({ model, prompt }) {
  const result = await generateText({
    provider: 'claude',
    model,
    prompt,
  });

  return result.text;
}

await askClaude({
  model: 'claude-sonnet-4-6',
  prompt: 'Write a concise customer reply.',
});
```

Example UI mapping, based on a provider/model dropdown:

```js
const providerModelPresets = {
  codex: [
    { value: 'gpt-5.5', label: 'GPT-5.5' },
  ],
  claude: claudeModels,
  gemini: [
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  ],
  grok: [
    { value: 'grok-4.3', label: 'Grok 4.3' },
  ],
};

async function runSelectedModel({ provider, model, prompt }) {
  const result = await generateText({ provider, model, prompt });
  return result.text;
}
```

The same `model` option is available on media helpers:

```js
await generateTextFromMedia({
  provider: 'grok',
  model: 'grok-4.3',
  prompt: 'Describe this image.',
  media: [{ type: 'image', url: 'https://example.com/screenshot.png' }],
});

await generateImage({
  provider: 'grok',
  model: 'grok-imagine-image',
  prompt: 'A clean CRM dashboard mockup',
});

await generateVideo({
  provider: 'grok',
  model: 'grok-imagine-video',
  prompt: 'A short product intro animation',
  duration: 5,
});
```

No package `.env` file is required. If your host app already has environment configuration and you want app-wide server defaults, the package reads these model variables when they are present:

```env
CODEX_MODEL=gpt-5.5
CLAUDE_MODEL=sonnet
GEMINI_MODEL=gemini-2.5-flash
GROK_MODEL=grok-4.3
```

For Claude, `CLAUDE_MODEL` can be an alias such as `opus`, `sonnet`, `haiku`, `opus[1m]`, or a pinned model ID such as `claude-opus-4-7` or `claude-sonnet-4-6`.

Per-call `model` wins over the server default. If `model` is not passed, the package uses the provider default model.

## 4. Next.js App Router Integration

`app/api/ai/route.js`

```js
import { createNextAiConnectorRoutes } from '@dhruvaaignited/ai-connectors/next';

export const { GET, POST, PATCH, DELETE } = createNextAiConnectorRoutes({
  requireUser: async (request) => {
    // Add your own auth/JWT/session check here.
    return { userId: 'demo-user', role: 'admin' };
  },
});
```

Start provider OAuth from the frontend:

```js
const res = await fetch('/api/ai', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    action: 'connect',
    provider: 'gemini',
    options: {
      authKind: 'cli_oauth',
      setDefault: true,
    },
  }),
});

const session = await res.json();
console.log(session.command);
console.log(session.instructions);
```

Check the connection after the user completes provider sign-in:

```js
const res = await fetch('/api/ai', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    action: 'status',
    provider: 'gemini',
    sessionId: session.id,
  }),
});

console.log(await res.json());
```

Generate text from your frontend:

```js
const res = await fetch('/api/ai', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    prompt: 'Create a short CRM note from this call summary.',
  }),
});

const data = await res.json();
console.log(data.text);
```

The same Next route can also call media actions when your server is configured for them:

```js
const imageRes = await fetch('/api/ai', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    action: 'image',
    input: {
      provider: 'grok',
      prompt: 'A clean CRM dashboard mockup',
    },
  }),
});

console.log(await imageRes.json());
```

## 5. React Project Pattern

Do not use this package directly in a React browser component. The React component should call an API route, and that API route should call this package.

```jsx
import { useState } from 'react';

export function AiBox() {
  const [text, setText] = useState('');

  async function askAi() {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        prompt: 'Write a polite reply for a delayed delivery.',
      }),
    });
    const data = await res.json();
    setText(data.text);
  }

  return (
    <div>
      <button onClick={askAi}>Ask AI</button>
      <pre>{text}</pre>
    </div>
  );
}
```

## 6. Text, Image, Voice, Document, and Video Use Cases

Text generation works with all four providers after the provider sign-in flow is complete:

```js
import { generateText } from '@dhruvaaignited/ai-connectors';

const answer = await generateText({
  provider: 'claude',
  model: 'claude-sonnet-4-6',
  prompt: 'Summarize this customer complaint in 3 bullet points.',
});

console.log(answer.text);
```

Media helper examples below assume your server has already been configured for Grok media calls by the app owner. The end user does not need to enter any provider secret.

### 6A. Send an Image to AI

```js
import { generateTextFromMedia } from '@dhruvaaignited/ai-connectors';

const result = await generateTextFromMedia({
  provider: 'grok',
  model: 'grok-4.3',
  prompt: 'List the UI issues in this screenshot.',
  media: [
    {
      type: 'image',
      url: 'https://example.com/screenshot.png',
      detail: 'high',
    },
  ],
});

console.log(result.text);
```

You can also send a base64 data URL:

```js
await generateTextFromMedia({
  provider: 'grok',
  model: 'grok-4.3',
  prompt: 'Describe this image.',
  media: [{ type: 'image', dataUrl: 'data:image/png;base64,...' }],
});
```

### 6B. Send PDF, Word, Excel, or TXT Documents

With a public file URL:

```js
const result = await generateTextFromMedia({
  provider: 'grok',
  model: 'grok-4.3',
  prompt: 'Extract the invoice total, date, and vendor name from this PDF.',
  media: [{ type: 'file', url: 'https://example.com/invoice.pdf' }],
});
```

Upload a local file, then ask using the returned file id:

```js
import { uploadFile, generateTextFromMedia } from '@dhruvaaignited/ai-connectors';

const uploaded = await uploadFile({
  provider: 'grok',
  filePath: './docs/report.pdf',
});

const result = await generateTextFromMedia({
  provider: 'grok',
  model: 'grok-4.3',
  prompt: 'Summarize this report and list action items.',
  media: [{ type: 'file', fileId: uploaded.id }],
});

console.log(result.text);
```

### 6C. Send Voice/Audio and Convert It to Text

```js
import { transcribeAudio, generateText } from '@dhruvaaignited/ai-connectors';

const transcript = await transcribeAudio({
  provider: 'grok',
  filePath: './recording.mp3',
  language: 'en',
});

const reply = await generateText({
  provider: 'grok',
  model: 'grok-4.3',
  prompt: `Create a CRM note from this customer call transcript:\n\n${transcript.text}`,
});

console.log(reply.text);
```

### 6D. Generate Voice/Audio From AI

```js
import { writeFile } from 'node:fs/promises';
import { generateSpeech } from '@dhruvaaignited/ai-connectors';

const speech = await generateSpeech({
  provider: 'grok',
  model: 'grok-voice-latest',
  text: 'Welcome to HRU support. How can I help you today?',
  voiceId: 'eve',
  language: 'en',
});

await writeFile('welcome.mp3', speech.audio);
```

### 6E. Generate an AI Image

```js
import { generateImage } from '@dhruvaaignited/ai-connectors';

const image = await generateImage({
  provider: 'grok',
  model: 'grok-imagine-image',
  prompt: 'A clean SaaS dashboard product mockup, white background',
});

console.log(image.images[0]?.url);
```

### 6F. Generate an AI Video

```js
import { generateVideo } from '@dhruvaaignited/ai-connectors';

const video = await generateVideo({
  provider: 'grok',
  model: 'grok-imagine-video',
  prompt: 'A 5 second product intro animation for a CRM dashboard',
  duration: 5,
  aspectRatio: '16:9',
  resolution: '720p',
  waitForCompletion: true,
});

console.log(video.videoUrl);
```

Image-to-video:

```js
await generateVideo({
  provider: 'grok',
  model: 'grok-imagine-video',
  prompt: 'Animate this product screenshot with smooth camera movement.',
  image: 'https://example.com/product.png',
  duration: 5,
});
```

## 7. Streaming Text

The current `streamText()` wrapper yields the provider result as chunks.

```js
import { streamText } from '@dhruvaaignited/ai-connectors';

for await (const chunk of streamText({
  provider: 'gemini',
  model: 'gemini-2.5-flash',
  prompt: 'Write a short onboarding email.',
})) {
  if (chunk.textDelta) process.stdout.write(chunk.textDelta);
}
```

## 8. CLI Commands

```bash
npx hru-ai status
npx hru-ai providers
npx hru-ai login codex
npx hru-ai login claude
npx hru-ai login gemini
npx hru-ai login grok
npx hru-ai ask gemini "Say hello"
npx hru-ai doctor gemini
npx hru-ai logout gemini
```

## 9. Important Security Notes

- Keep provider sign-in and provider credentials on the server.
- Do not expose provider credentials in a React/browser bundle.
- `connectProvider()` stores safe metadata such as provider slug, auth mode, and connection status.
- `disconnectProvider()` deletes package metadata only. It does not delete provider CLI credential files. Use the provider CLI logout command when you need to remove CLI-managed credentials.
- Media helpers are currently implemented for Grok server-side media mode. Use `generateText()` for Codex, Claude, and Gemini text-only calls. For full provider-native multimodal support, use each provider's official SDK/API.

## 10. Official Docs Checked

- Codex CLI: https://github.com/openai/codex/tree/main/codex-rs
- Codex app-server auth surface: https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md
- Claude Code authentication: https://code.claude.com/docs/en/authentication
- Gemini CLI authentication: https://google-gemini.github.io/gemini-cli/docs/get-started/authentication.html
- xAI Responses API: https://docs.x.ai/docs/guides/chat
- xAI image understanding: https://docs.x.ai/docs/guides/image-understanding
- xAI files: https://docs.x.ai/docs/guides/files
- xAI image generation: https://docs.x.ai/docs/guides/image-generation
- xAI voice: https://docs.x.ai/developers/model-capabilities/audio/voice
- xAI video generation: https://docs.x.ai/developers/model-capabilities/video/generation
