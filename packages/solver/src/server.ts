import Fastify from 'fastify';
import cors from '@fastify/cors';
import { healthRoutes } from './routes/health.routes.js';
import { authRoutes } from './routes/auth.routes.js';
import { syncRoutes } from './routes/sync.routes.js';

export async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: false });
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(syncRoutes);

  return app;
}
