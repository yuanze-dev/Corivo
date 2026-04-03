import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import { healthRoutes } from '../routes/health.routes.js';
import { authRoutes } from '../routes/auth.routes.js';
import { syncRoutes } from '../routes/sync.routes.js';
import type { AuthUseCases } from '../application/auth/auth-use-cases.js';
import type { SyncRepository } from '../application/sync/sync-ports.js';
import type { preHandlerHookHandler } from 'fastify';

interface CreateServerOptions {
  isDev: boolean;
  authUseCases: AuthUseCases;
  syncRepository: SyncRepository;
  authPreHandler: preHandlerHookHandler;
}

export async function createServer(options: CreateServerOptions) {
  const app = Fastify({
    genReqId: () => randomUUID(),
    disableRequestLogging: true,
    logger: {
      level: options.isDev ? 'debug' : 'info',
      ...(options.isDev
        ? {
            transport: {
              target: 'pino-pretty',
              options: {
                colorize: true,
                translateTime: 'SYS:HH:MM:ss',
                ignore: 'pid,hostname',
                singleLine: true,
              },
            },
          }
        : {
            base: { pid: process.pid },
          }),
      serializers: {
        req(request) {
          return {
            method: request.method,
            url: request.url,
            remoteAddress: request.socket?.remoteAddress,
          };
        },
      },
    },
  });

  app.addHook('onRequest', (req, _reply, done) => {
    req.log.debug({ req }, 'IncomingRequest');
    done();
  });

  app.addHook('onResponse', (req, reply, done) => {
    req.log.debug({ req, res: reply, responseTime: reply.elapsedTime }, 'RequestCompleted');
    done();
  });

  await app.register(cors, { origin: false });
  await healthRoutes(app);
  await authRoutes(app, {
    authUseCases: options.authUseCases,
    authPreHandler: options.authPreHandler,
  });
  await syncRoutes(app, {
    syncRepository: options.syncRepository,
    authPreHandler: options.authPreHandler,
  });

  return app;
}
