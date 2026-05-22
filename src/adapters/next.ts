import { createAiConnectors } from '../create-ai-connectors.js';
import { connectAI } from '../connect-ai.js';
import { useAI } from '../use-ai.js';
import type { AiConnectorsOptions } from '../types.js';

type RequireUserResult = { userId: string; role?: string } | null;

type NextRouteOptions = AiConnectorsOptions & {
  requireUser?: (request: Request) => Promise<RequireUserResult>;
};

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init?.headers || {}),
    },
  });
}

async function guard(request: Request, requireUser?: NextRouteOptions['requireUser']) {
  if (!requireUser) return null;
  const user = await requireUser(request);
  if (!user) return json({ error: 'Unauthorized' }, { status: 401 });
  return null;
}

export function createNextAiConnectorRoutes(options: NextRouteOptions = {}) {
  const connectors = createAiConnectors(options);

  return {
    async GET(request: Request) {
      const blocked = await guard(request, options.requireUser);
      if (blocked) return blocked;
      const url = new URL(request.url);
      if (url.pathname.endsWith('/runtime')) return json(await connectors.runtimeStatus());
      return json({ providers: await connectors.listProviders() });
    },

    async POST(request: Request) {
      const blocked = await guard(request, options.requireUser);
      if (blocked) return blocked;
      const body = await request.json().catch(() => ({}));
      if (body.action === 'connectAI') return json(await connectAI({ ...(body.input || body), ...options }));
      if (body.action === 'useAI') return json(serializeUseAIResult(await useAI({ ...(body.input || body), ...options })));
      if (body.action === 'connect') return json(await connectors.connectProvider(body.provider, body.options || {}));
      if (body.action === 'status') return json(await connectors.getLoginStatus(body.provider, body.sessionId));
      if (body.action === 'submitCode') return json(await connectors.submitLoginCode(body.provider, body.sessionId, body.code || ''));
      if (body.action === 'stream') {
        const chunks = [];
        for await (const chunk of connectors.streamText(body)) chunks.push(chunk);
        return json({ chunks });
      }
      if (body.action === 'media') return json(await connectors.generateTextFromMedia(body.input || body));
      if (body.action === 'upload') return json(await connectors.uploadFile(body.input || body));
      if (body.action === 'image') return json(await connectors.generateImage(body.input || body));
      if (body.action === 'video') return json(await connectors.generateVideo(body.input || body));
      if (body.action === 'speech') {
        const result = await connectors.generateSpeech(body.input || body);
        return json({
          ...result,
          audio: Buffer.from(result.audio).toString('base64'),
          audioEncoding: 'base64',
        });
      }
      if (body.action === 'transcribe') return json(await connectors.transcribeAudio(body.input || body));
      return json(await connectors.generateText(body));
    },

    async PATCH(request: Request) {
      const blocked = await guard(request, options.requireUser);
      if (blocked) return blocked;
      const body = await request.json().catch(() => ({}));
      if (body.defaultProvider) await connectors.setDefaultProvider(body.defaultProvider);
      return json({ ok: true });
    },

    async DELETE(request: Request) {
      const blocked = await guard(request, options.requireUser);
      if (blocked) return blocked;
      const body = await request.json().catch(() => ({}));
      return json(await connectors.disconnectProvider(body.provider));
    },
  };
}

function serializeUseAIResult(result: any) {
  return {
    ...result,
    asset: serializeAsset(result.asset),
    assets: Array.isArray(result.assets) ? result.assets.map(serializeAsset) : result.assets,
  };
}

function serializeAsset(asset: any) {
  if (!asset?.bytes) return asset;
  return {
    ...asset,
    bytes: Buffer.from(asset.bytes).toString('base64'),
    encoding: 'base64',
  };
}
