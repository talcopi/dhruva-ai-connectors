# @ignitedaibusiness/ai-connectors

Short description: OAuth-first multi-provider AI connector for Node.js and Next.js apps.

Description: Connect Codex, Anthropic, Google, and Grok with one package API. Manage sign-in, encrypted SQLite credential storage, model selection, text generation, and text-to-media/document workflows from Node.js, Next.js, or browser UI code through your app route.

## Preferred API

The package now exposes two high-level functions:

```js
import { connectAI, useAI } from '@ignitedaibusiness/ai-connectors';

await connectAI({
  provider: 'codex', // codex | anthropic | google | grok
  setDefault: true,
});

const reply = await useAI({
  provider: 'grok',
  output: 'text',
  prompt: 'Write a short customer support reply.',
});

const pdf = await useAI({
  provider: 'codex',
  output: 'pdf',
  content: 'Invoice summary...',
});
```

`connectAI()` is OAuth-first. For `codex`, `anthropic`, and `google`, it starts the provider CLI OAuth flow, opens/returns the browser login URL when the provider exposes one, then records the connected provider metadata in SQLite after sign-in succeeds. If a provider CLI asks for an authorization code, the returned result includes `needsCode: true` and the same session can be completed through the Next route's `submitCode` action.

Optional `.env` values:

```bash
HRU_AI_HOME=.hru-ai
HRU_AI_SQLITE_PATH=.hru-ai/providers.sqlite
HRU_AI_SECRET_KEY=change-this-long-random-secret
CODEX_MODEL=gpt-5.5
CLAUDE_MODEL=opus
GEMINI_MODEL=gemini-2.5-flash
GROK_MODEL=grok-4.3
```

For browser/React usage, call the same names from client code and point them at your API route:

```js
import { connectAI, useAI } from '@ignitedaibusiness/ai-connectors';

await connectAI({
  provider: 'codex',
  endpoint: '/api/ai',
});

const image = await useAI({
  provider: 'grok',
  endpoint: '/api/ai',
  output: 'image',
  prompt: 'A clean ecommerce product mockup',
});
```

In Next.js App Router, expose the server route:

```js
import { createNextAiConnectorRoutes } from '@ignitedaibusiness/ai-connectors/next';

export const { GET, POST, PATCH, DELETE } = createNextAiConnectorRoutes({
  requireUser: async () => ({ userId: 'demo-user', role: 'admin' }),
});
```

## 0. Install

```bash
npm i @ignitedaibusiness/ai-connectors
```

This package targets Node.js `>=20`. React/browser bundles use the package's browser export, which forwards `connectAI()` and `useAI()` to your API route. Provider CLIs and SQL storage still run server-side.

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

### 1A. Start OAuth With One Function

Use `connectAI()` for OAuth. In browser/React it calls your API route, opens a new tab when a provider returns a login URL, and polls the same route until the provider is connected.

```js
import { connectAI } from '@ignitedaibusiness/ai-connectors';

const result = await connectAI({
  provider: 'gemini',
  endpoint: '/api/ai',
  setDefault: true,
});

console.log(result.status); // "connected" means ready
```

Provider examples:

```js
await connectAI({ provider: 'codex', endpoint: '/api/ai' });
await connectAI({ provider: 'anthropic', endpoint: '/api/ai' });
await connectAI({ provider: 'google', endpoint: '/api/ai' });
await connectAI({ provider: 'grok', endpoint: '/api/ai' });
```

### 1B. What the User Does After Signup/Login

The user flow is:

1. Your app calls `connectAI()`.
2. Your API route starts the provider OAuth flow.
3. The browser opens the provider login page when a URL is available.
4. If the provider asks for an authorization code, submit it back to the same route with `action: "submitCode"`.
5. When the status becomes `"connected"`, the selected AI provider is ready to use.

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
import { createAiConnectors } from '@ignitedaibusiness/ai-connectors';

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
} from '@ignitedaibusiness/ai-connectors';

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
import { generateText } from '@ignitedaibusiness/ai-connectors';

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
import { createNextAiConnectorRoutes } from '@ignitedaibusiness/ai-connectors/next';

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
import { generateText } from '@ignitedaibusiness/ai-connectors';

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
import { generateTextFromMedia } from '@ignitedaibusiness/ai-connectors';

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
import { uploadFile, generateTextFromMedia } from '@ignitedaibusiness/ai-connectors';

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
import { transcribeAudio, generateText } from '@ignitedaibusiness/ai-connectors';

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
import { generateSpeech } from '@ignitedaibusiness/ai-connectors';

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
import { generateImage } from '@ignitedaibusiness/ai-connectors';

const image = await generateImage({
  provider: 'grok',
  model: 'grok-imagine-image',
  prompt: 'A clean SaaS dashboard product mockup, white background',
});

console.log(image.images[0]?.url);
```

### 6F. Generate an AI Video

```js
import { generateVideo } from '@ignitedaibusiness/ai-connectors';

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
import { streamText } from '@ignitedaibusiness/ai-connectors';

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
