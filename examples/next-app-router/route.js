import { createNextAiConnectorRoutes } from '@dhruva/ai-connectors/next';

export const { GET, POST, PATCH, DELETE } = createNextAiConnectorRoutes({
  requireUser: async () => ({ userId: 'demo-user', role: 'admin' }),
});
