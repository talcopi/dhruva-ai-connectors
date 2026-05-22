import express from 'express';
import type { Server } from 'node:http';
import { createAiConnectors } from '../create-ai-connectors.js';
import { connectAI } from '../connect-ai.js';
import { normalizeProvider } from '../provider-alias.js';
import { useAI } from '../use-ai.js';
import type { AgentToolRegistry, AiConnectorsOptions } from '../types.js';

type ExpressLikeApp = {
  use: (...args: any[]) => any;
  listen: (...args: any[]) => Server;
};

type ExpressLikeRouter = {
  use: (...args: any[]) => any;
  get: (...args: any[]) => any;
  post: (...args: any[]) => any;
  patch: (...args: any[]) => any;
  delete: (...args: any[]) => any;
};

type RequestLike = {
  body?: any;
};

type ResponseLike = {
  status(code: number): ResponseLike;
  json(data: unknown): void;
};

export type ExpressAiConnectorOptions = Omit<AiConnectorsOptions, 'tools'> & {
  jsonLimit?: string;
  basePath?: string;
  tools?: AgentToolRegistry | ((req: RequestLike) => AgentToolRegistry | Promise<AgentToolRegistry>);
};

export type ExpressAiConnectorServer = {
  app: ExpressLikeApp;
  server: Server;
  url: string;
  close(): Promise<void>;
};

export function createExpressAiConnectorRouter(options: ExpressAiConnectorOptions = {}): ExpressLikeRouter {
  const router = express.Router() as ExpressLikeRouter;
  const connectors = createAiConnectors(connectorOptions(options));
  router.use(express.json({ limit: options.jsonLimit || '50mb' }));

  router.get('/runtime', asyncHandler(async (_req: RequestLike, res: ResponseLike) => {
    res.json(await connectors.runtimeStatus());
  }));

  router.get('/providers', asyncHandler(async (_req: RequestLike, res: ResponseLike) => {
    res.json({ providers: await connectors.listProviders() });
  }));

  router.post('/', asyncHandler(async (req: RequestLike, res: ResponseLike) => {
    const body = req.body || {};
    if (body.action === 'connectAI') return res.json(await connectAI({ ...(body.input || body), ...options }));
    if (body.action === 'useAI') return res.json(serializeUseAIResult(await useAI({ ...(body.input || body), ...options })));
    if (body.action === 'workflow' || body.action === 'runAgentWorkflow' || body.action === 'runAITools') {
      return res.json(await connectors.runAgentWorkflow({ ...(body.input || body), tools: await resolveTools(options.tools, req) }));
    }
    if (body.action === 'connect') return res.json(await connectors.connectProvider(normalizeProvider(body.provider), body.options || {}));
    if (body.action === 'logoutAI' || body.action === 'logout' || body.action === 'disconnect') {
      return res.json(await connectors.disconnectProvider(normalizeProvider(body.provider)));
    }
    if (body.action === 'status') return res.json(await connectors.getLoginStatus(normalizeProvider(body.provider), body.sessionId));
    if (body.action === 'submitCode') {
      return res.json(await connectors.submitLoginCode(normalizeProvider(body.provider), body.sessionId, body.code || ''));
    }
    if (body.action === 'stream') {
      const chunks = [];
      for await (const chunk of connectors.streamText(body.input || body)) chunks.push(chunk);
      return res.json({ chunks });
    }
    if (body.action === 'media') return res.json(await connectors.generateTextFromMedia(body.input || body));
    if (body.action === 'upload') return res.json(await connectors.uploadFile(body.input || body));
    if (body.action === 'image') return res.json(await connectors.generateImage(body.input || body));
    if (body.action === 'video') return res.json(await connectors.generateVideo(body.input || body));
    if (body.action === 'speech') {
      const result = await connectors.generateSpeech(body.input || body);
      return res.json({ ...result, audio: Buffer.from(result.audio).toString('base64'), audioEncoding: 'base64' });
    }
    if (body.action === 'transcribe') return res.json(await connectors.transcribeAudio(body.input || body));
    return res.json(await connectors.generateText(body.input || body));
  }));

  router.patch('/', asyncHandler(async (req: RequestLike, res: ResponseLike) => {
    const body = req.body || {};
    if (body.defaultProvider) await connectors.setDefaultProvider(normalizeProvider(body.defaultProvider));
    res.json({ ok: true });
  }));

  router.delete('/', asyncHandler(async (req: RequestLike, res: ResponseLike) => {
    const body = req.body || {};
    res.json(await connectors.disconnectProvider(normalizeProvider(body.provider)));
  }));

  return router;
}

function connectorOptions(options: ExpressAiConnectorOptions): AiConnectorsOptions {
  return {
    cwd: options.cwd,
    homeDir: options.homeDir,
    defaultProvider: options.defaultProvider,
    store: options.store,
    secretStore: options.secretStore,
    env: options.env,
    tools: typeof options.tools === 'function' ? undefined : options.tools,
  };
}

async function resolveTools(
  tools: ExpressAiConnectorOptions['tools'],
  req: RequestLike
): Promise<AgentToolRegistry | undefined> {
  return typeof tools === 'function' ? tools(req) : tools;
}

export function createExpressAiConnectorApp(options: ExpressAiConnectorOptions = {}): ExpressLikeApp {
  const app = express() as ExpressLikeApp;
  app.use(options.basePath || '/api/ai', createExpressAiConnectorRouter(options));
  return app;
}

export async function startExpressAiConnectorServer(
  options: ExpressAiConnectorOptions & { port?: number; host?: string } = {}
): Promise<ExpressAiConnectorServer> {
  const app = createExpressAiConnectorApp(options);
  const port = options.port ?? Number(process.env.PORT || 3037);
  const host = options.host || process.env.HOST || 'localhost';
  const server = await new Promise<Server>((resolve, reject) => {
    const created = app.listen(port, host, () => resolve(created));
    created.on('error', reject);
  });
  return {
    app,
    server,
    url: `http://${host}:${port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

function asyncHandler(handler: (req: RequestLike, res: ResponseLike) => Promise<void> | void) {
  return (req: RequestLike, res: ResponseLike, next: (error?: unknown) => void) => {
    Promise.resolve(handler(req, res)).catch((error) => {
      if (typeof next === 'function') return next(error);
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    });
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
