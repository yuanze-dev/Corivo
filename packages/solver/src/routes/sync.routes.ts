import type { FastifyInstance } from 'fastify';
import { authPreHandler } from '../auth/auth-plugin.js';
import { pushChangesets, pullChangesets, getSyncStatus } from '../sync/sync-handler.js';
import '../types.js';

const changesetSchema = {
  type: 'object',
  required: ['table_name', 'pk', 'col_version', 'db_version'],
  properties: {
    table_name: { type: 'string', maxLength: 128 },
    pk: { type: 'string', maxLength: 4096 },
    col_name: { type: 'string', maxLength: 128 },
    col_version: { type: 'integer' },
    db_version: { type: 'integer' },
    value: { type: 'string', maxLength: 65536 },
    site_id: { type: 'string', maxLength: 64 },
  },
};

export async function syncRoutes(app: FastifyInstance): Promise<void> {
  // POST /sync/push
  app.post('/sync/push', {
    preHandler: authPreHandler,
    schema: {
      body: {
        type: 'object',
        required: ['site_id', 'changesets'],
        properties: {
          site_id: { type: 'string', maxLength: 64 },
          db_version: { type: 'integer' },
          changesets: {
            type: 'array',
            items: changesetSchema,
            maxItems: 1000,
          },
        },
      },
    },
  }, async (req, reply) => {
    const identityId = req.identityId!;
    const body = req.body as {
      site_id: string;
      db_version?: number;
      changesets: any[];
    };

    const result = pushChangesets(identityId, {
      site_id: body.site_id,
      db_version: body.db_version ?? 0,
      changesets: body.changesets,
    });

    return reply.send({ ok: true, stored: result.stored });
  });

  // POST /sync/pull
  app.post('/sync/pull', {
    preHandler: authPreHandler,
    schema: {
      body: {
        type: 'object',
        required: ['site_id', 'since_version'],
        properties: {
          site_id: { type: 'string', maxLength: 64 },
          since_version: { type: 'integer', minimum: 0 },
        },
      },
    },
  }, async (req, reply) => {
    const identityId = req.identityId!;
    const body = req.body as { site_id: string; since_version: number };

    const result = pullChangesets(identityId, {
      site_id: body.site_id,
      since_version: body.since_version,
    });

    return reply.send(result);
  });

  // GET /sync/status
  app.get('/sync/status', {
    preHandler: authPreHandler,
    schema: {
      querystring: {
        type: 'object',
        required: ['device_id'],
        properties: {
          device_id: { type: 'string', maxLength: 256 },
        },
      },
    },
  }, async (req, reply) => {
    const identityId = req.identityId!;
    const query = req.query as { device_id?: string };
    const deviceId = query.device_id ?? '';

    const status = getSyncStatus(identityId, deviceId);
    return reply.send(status);
  });
}
