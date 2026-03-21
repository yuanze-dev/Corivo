import Fastify from 'fastify';
import cors from '@fastify/cors';
import { healthRoutes } from './routes/health.routes.js';
import { authRoutes } from './routes/auth.routes.js';
import { syncRoutes } from './routes/sync.routes.js';

const isDev = process.env.NODE_ENV !== 'production';

export async function buildServer() {
  const app = Fastify({
    disableRequestLogging: true,
    logger: {
      level: isDev ? 'debug' : 'info',
      ...(isDev
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
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(syncRoutes);

  return app;
}
