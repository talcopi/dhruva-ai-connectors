# @ignitedaibusiness/ai-connectors

Short description: OAuth-first multi-provider AI connector for Node.js and Next.js apps.

Description: Connect Codex, Anthropic, Google, and Grok with one package API. Manage sign-in, encrypted SQLite credential storage, model selection, text generation, and text-to-media/document workflows from Node.js, Next.js, or browser UI code through your app route.

## Preferred API

Use two high-level functions:

- `connectAI()` starts OAuth/login and stores the provider connection metadata server-side.
- `useAI()` runs text, image, video, audio, PDF, DOC, Excel, or CSV generation after a provider is connected.

Preferred public provider names:

```ts
type AIProvider = 'codex' | 'anthropic' | 'google' | 'grok';
```

Quick server-side example:

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

`connectAI()` is OAuth-first. For `codex`, `anthropic`, and `google`, it starts the provider CLI OAuth flow, opens/returns the browser login URL when the provider exposes one, then records the connected provider metadata in encrypted SQLite after sign-in succeeds. If a provider CLI asks for an authorization code, the returned result includes `needsCode: true`; submit that code with the same `connectAI()` function by passing `sessionId` and `code`.

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

## Step 1. `connectAI()` Examples

These examples use the same provider names everywhere: `codex`, `anthropic`, `google`, and `grok`.

### React.js

React runs in the browser, so provider CLI login and SQLite storage must happen through your server route. The component below calls `/api/ai`, opens the provider login page in a new tab when available, and then uses the connected provider.

```jsx
import { useState } from 'react';
import { connectAI, useAI } from '@ignitedaibusiness/ai-connectors';

export function AiPanel() {
  const [status, setStatus] = useState('idle');
  const [reply, setReply] = useState('');

  async function connectCodex() {
    setStatus('connecting');

    const result = await connectAI({
      provider: 'codex',
      endpoint: '/api/ai',
      setDefault: true,
    });

    if (result.needsCode) {
      const code = window.prompt('Paste the authorization code');
      if (code) {
        const completed = await connectAI({
          provider: result.provider,
          endpoint: '/api/ai',
          sessionId: result.sessionId,
          code,
          poll: true,
        });
        setStatus(completed.connected ? 'connected' : completed.status);
        return;
      }
    }

    setStatus(result.connected ? 'connected' : result.status);
  }

  async function askAI() {
    const result = await useAI({
      provider: 'codex',
      endpoint: '/api/ai',
      output: 'text',
      prompt: 'Write a polite reply for a delayed delivery.',
    });

    setReply(result.text || '');
  }

  return (
    <section>
      <button onClick={connectCodex}>Connect Codex</button>
      <button onClick={askAI} disabled={status !== 'connected'}>
        Ask AI
      </button>
      <p>{status}</p>
      <pre>{reply}</pre>
    </section>
  );
}
```

### Node.js

Use this pattern for Express/Fastify/custom Node servers. The React/browser app calls this route; the route starts OAuth, checks status, accepts provider authorization codes, and runs `useAI()`.

```js
import express from 'express';
import {
  connectAI,
  createAiConnectors,
  useAI,
} from '@ignitedaibusiness/ai-connectors';

const app = express();
const ai = createAiConnectors();

app.use(express.json());

app.post('/api/ai', async (req, res, next) => {
  try {
    const body = req.body || {};

    if (body.action === 'connectAI') {
      const result = await connectAI({
        ...(body.input || body),
        openBrowser: false,
      });
      return res.json(result);
    }

    if (body.action === 'status') {
      const result = await ai.getLoginStatus(body.provider, body.sessionId);
      return res.json(result);
    }

    if (body.action === 'submitCode') {
      const result = await ai.submitLoginCode(body.provider, body.sessionId, body.code);
      return res.json(result);
    }

    if (body.action === 'useAI') {
      const result = await useAI(body.input || body);
      return res.json(result);
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (error) {
    next(error);
  }
});

app.listen(3000, () => {
  console.log('AI route ready at http://localhost:3000/api/ai');
});
```

Direct Node script:

```js
import { connectAI, useAI } from '@ignitedaibusiness/ai-connectors';

const connection = await connectAI({
  provider: 'google',
  setDefault: true,
  poll: true,
});

if (connection.connected) {
  const result = await useAI({
    provider: 'google',
    output: 'csv',
    prompt: 'Create a CSV of 5 CRM lead statuses.',
  });

  console.log(result.text);
}
```

### Next.js

Create one App Router API route:

`app/api/ai/route.js`

```js
import { createNextAiConnectorRoutes } from '@ignitedaibusiness/ai-connectors/next';

export const { GET, POST, PATCH, DELETE } = createNextAiConnectorRoutes({
  requireUser: async () => ({ userId: 'demo-user', role: 'admin' }),
});
```

Then call `connectAI()` and `useAI()` from a client component:

```jsx
'use client';

import { useState } from 'react';
import { connectAI, useAI } from '@ignitedaibusiness/ai-connectors';

export default function ConnectAiButton() {
  const [status, setStatus] = useState('idle');

  async function connectGoogle() {
    const result = await connectAI({
      provider: 'google',
      endpoint: '/api/ai',
      setDefault: true,
    });

    setStatus(result.connected ? 'connected' : result.status);
  }

  async function generatePdf() {
    const result = await useAI({
      provider: 'google',
      endpoint: '/api/ai',
      output: 'pdf',
      prompt: 'Create a one-page invoice summary.',
      filename: 'invoice-summary.pdf',
    });

    console.log(result.asset);
  }

  return (
    <div>
      <button onClick={connectGoogle}>Connect Google</button>
      <button onClick={generatePdf}>Generate PDF</button>
      <span>{status}</span>
    </div>
  );
}
```

### Any Provider

```js
await connectAI({ provider: 'codex', endpoint: '/api/ai' });
await connectAI({ provider: 'anthropic', endpoint: '/api/ai' });
await connectAI({ provider: 'google', endpoint: '/api/ai' });
await connectAI({ provider: 'grok', endpoint: '/api/ai' });
```

Use any output type:

```js
const image = await useAI({
  provider: 'grok',
  endpoint: '/api/ai',
  output: 'image',
  prompt: 'A clean ecommerce product mockup',
});

const doc = await useAI({
  provider: 'anthropic',
  endpoint: '/api/ai',
  output: 'doc',
  prompt: 'Create a short project brief.',
});
```

## 0. Install

```bash
npm i @ignitedaibusiness/ai-connectors
```

That is the only package install command your user needs. Do not install SQLite, `better-sqlite3`, Codex CLI, Claude Code, or Gemini CLI separately for this package. They are normal package dependencies and npm installs them automatically.

This package targets Node.js `>=20`. React/browser bundles use the package's browser export, which forwards `connectAI()` and `useAI()` to your API route. Provider CLIs and SQL storage still run server-side.

SQLite is embedded through the npm dependency. On first use the package automatically creates:

```text
.hru-ai/providers.sqlite
.hru-ai/secret.key
```

The app developer only calls the functions:

```js
import { connectAI, useAI } from '@ignitedaibusiness/ai-connectors';

await connectAI({ provider: 'codex', endpoint: '/api/ai' });

const result = await useAI({
  provider: 'codex',
  endpoint: '/api/ai',
  output: 'text',
  prompt: 'Write a short reply.',
});
```

Codex, Claude, and Gemini text generation use their provider CLIs. The package includes those CLIs as dependencies, but globally installed CLIs also work.

Grok does not require a separate CLI for API/media mode. Set `XAI_API_KEY` on the server and `connectAI({ provider: "grok" })` will use encrypted API-key storage automatically.

## 1. Connect Provider OAuth

Preferred provider input:

```ts
type AIProvider = 'codex' | 'anthropic' | 'google' | 'grok';
```

The package stores Anthropic as the internal CLI slug `claude` and Google as the internal CLI slug `gemini`. The high-level `connectAI()` and `useAI()` APIs normalize the public names for you.

Sign-in summary:

| Provider | Sign-in method | Login command |
| --- | --- | --- |
| `codex` | Codex CLI OAuth/browser sign-in | `codex` |
| `anthropic` | Claude Code OAuth/browser sign-in | `claude auth login --claudeai` |
| `google` | Gemini CLI Google sign-in | `gemini` |
| `grok` | Grok CLI browser sign-in | `grok` |

### 1A. Start OAuth With One Function

Use `connectAI()` for OAuth. In browser/React it calls your API route, opens a new tab when a provider returns a login URL, and polls the same route until the provider is connected.

```js
import { connectAI } from '@ignitedaibusiness/ai-connectors';

const result = await connectAI({
  provider: 'google',
  endpoint: '/api/ai',
  setDefault: true,
});

console.log(result.status); // "connected" means ready
```

For Claude/Anthropic and Google/Gemini, the provider page may show an authorization code after login. Paste that code back with the same function:

```js
const started = await connectAI({
  provider: 'anthropic',
  endpoint: '/api/ai',
});

if (started.needsCode) {
  const completed = await connectAI({
    provider: started.provider,
    endpoint: '/api/ai',
    sessionId: started.sessionId,
    code: 'paste-code-from-provider-page',
    poll: true,
  });

  console.log(completed.status);
}
```

For Codex, `connectAI()` appends the `userCode` to the login URL when the Codex CLI provides one and also exposes it in the result/onStatus callback:

```js
await connectAI({
  provider: 'codex',
  endpoint: '/api/ai',
  onStatus: (status) => {
    if (status.userCode) console.log(`Codex code: ${status.userCode}`);
  },
});
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
4. If the provider asks for an authorization code, call `connectAI({ provider, endpoint, sessionId, code, poll: true })`.
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

First connect the provider through the OAuth flow, then call `useAI()`.

```js
import {
  connectAI,
  runtimeStatus,
  useAI,
} from '@ignitedaibusiness/ai-connectors';

console.log(await runtimeStatus());

const connection = await connectAI({
  provider: 'codex',
  setDefault: true,
  poll: true,
});

if (connection.connected) {
  const result = await useAI({
    provider: 'codex',
    output: 'text',
    prompt: 'Write 5 WhatsApp follow-up replies for a new lead.',
  });

  console.log(result.text);
}
```

Call a specific selected provider:

```js
const selectedProvider = 'google';

const result = await useAI({
  provider: selectedProvider,
  output: 'text',
  prompt: 'Explain this order refund policy in simple English.',
});

console.log(result.text);
```

## 3. Choose or Change the AI Model

There is no separate `setModel()` function. The model is selected with the `model` option on the function call.

Use this pattern when the user selects both the provider and model from your UI:

```js
import { useAI } from '@ignitedaibusiness/ai-connectors';

async function askSelectedAi({ provider, model, prompt }) {
  const result = await useAI({
    provider,
    model,
    output: 'text',
    prompt,
  });

  return result.text;
}

const text = await askSelectedAi({
  provider: 'google',
  model: 'gemini-2.5-flash',
  prompt: 'Write a short customer support reply.',
});

console.log(text);
```

Provider-specific examples:

```js
await useAI({
  provider: 'codex',
  model: 'gpt-5.5',
  output: 'text',
  prompt: 'Review this implementation plan.',
});

await useAI({
  provider: 'anthropic',
  model: 'opus',
  output: 'text',
  prompt: 'Analyze this complex support escalation.',
});

await useAI({
  provider: 'anthropic',
  model: 'sonnet',
  output: 'text',
  prompt: 'Draft a balanced customer support reply.',
});

await useAI({
  provider: 'anthropic',
  model: 'haiku',
  output: 'text',
  prompt: 'Classify this message as sales, support, or billing.',
});

await useAI({
  provider: 'google',
  model: 'gemini-2.5-flash',
  output: 'text',
  prompt: 'Create a campaign outline.',
});

await useAI({
  provider: 'grok',
  model: 'grok-4.3',
  output: 'text',
  prompt: 'Draft a concise product update.',
});
```

Anthropic Claude Code supports both aliases and pinned model IDs. The aliases are easier for users because Claude Code resolves them to the latest available version for the signed-in account/provider. Use pinned IDs when you want a specific version.

```js
const anthropicModels = [
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

async function askAnthropic({ model, prompt }) {
  const result = await useAI({
    provider: 'anthropic',
    model,
    output: 'text',
    prompt,
  });

  return result.text;
}

await askAnthropic({
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
  anthropic: anthropicModels,
  google: [
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  ],
  grok: [
    { value: 'grok-4.3', label: 'Grok 4.3' },
  ],
};

async function runSelectedModel({ provider, model, prompt }) {
  const result = await useAI({ provider, model, output: 'text', prompt });
  return result.text;
}
```

The same `model` option is available on media and document outputs:

```js
await useAI({
  provider: 'grok',
  model: 'grok-4.3',
  output: 'media-text',
  prompt: 'Describe this image.',
  media: [{ type: 'image', url: 'https://example.com/screenshot.png' }],
});

await useAI({
  provider: 'grok',
  model: 'grok-imagine-image',
  output: 'image',
  prompt: 'A clean CRM dashboard mockup',
});

await useAI({
  provider: 'grok',
  model: 'grok-imagine-video',
  output: 'video',
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

Start provider OAuth from the frontend with `connectAI()`:

```js
import { connectAI } from '@ignitedaibusiness/ai-connectors';

const result = await connectAI({
  provider: 'google',
  endpoint: '/api/ai',
  setDefault: true,
});

console.log(result.status);
```

Generate text from your frontend with `useAI()`:

```js
import { useAI } from '@ignitedaibusiness/ai-connectors';

const data = await useAI({
  provider: 'google',
  endpoint: '/api/ai',
  output: 'text',
  model: 'gemini-2.5-flash',
  prompt: 'Create a short CRM note from this call summary.',
});

console.log(data.text);
```

The same Next route can also call media actions when your server is configured for them:

```js
const image = await useAI({
  provider: 'grok',
  endpoint: '/api/ai',
  output: 'image',
  prompt: 'A clean CRM dashboard mockup',
});

console.log(image.assets?.[0]?.url);
```

## 5. React Project Pattern

React can import `connectAI()` and `useAI()` directly. In the browser bundle, both functions forward to your API route; provider credentials and SQLite storage stay server-side.

```jsx
import { useState } from 'react';
import { connectAI, useAI } from '@ignitedaibusiness/ai-connectors';

export function AiBox() {
  const [connected, setConnected] = useState(false);
  const [text, setText] = useState('');

  async function connect() {
    const result = await connectAI({
      provider: 'anthropic',
      endpoint: '/api/ai',
      setDefault: true,
    });

    setConnected(result.connected);
  }

  async function askAi() {
    const result = await useAI({
      provider: 'anthropic',
      endpoint: '/api/ai',
      output: 'text',
      model: 'sonnet',
      prompt: 'Write a polite reply for a delayed delivery.',
    });

    setText(result.text || '');
  }

  return (
    <div>
      <button onClick={connect}>Connect Anthropic</button>
      <button onClick={askAi} disabled={!connected}>Ask AI</button>
      <pre>{text}</pre>
    </div>
  );
}
```

## 6. Text, Image, Voice, Document, and Video Use Cases

Text generation works with all four providers after the provider sign-in flow is complete:

```js
import { useAI } from '@ignitedaibusiness/ai-connectors';

const answer = await useAI({
  provider: 'anthropic',
  output: 'text',
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
import { transcribeAudio, useAI } from '@ignitedaibusiness/ai-connectors';

const transcript = await transcribeAudio({
  provider: 'grok',
  filePath: './recording.mp3',
  language: 'en',
});

const reply = await useAI({
  provider: 'grok',
  model: 'grok-4.3',
  output: 'text',
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

The current lower-level `streamText()` wrapper yields the provider result as chunks. Streaming uses the internal CLI provider slug for Claude/Gemini.

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
- Media helpers are currently implemented for Grok server-side media mode. Use `useAI({ output: "text" })` for Codex, Anthropic, and Google text-only calls. For full provider-native multimodal support, use each provider's official SDK/API.

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
