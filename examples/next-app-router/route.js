import { createNextAiConnectorRoutes } from '@dhruvaaignited/ai-connectors/next';

export const { GET, POST, PATCH, DELETE } = createNextAiConnectorRoutes({
  requireUser: async () => ({ userId: 'demo-user', role: 'admin' }),
});
