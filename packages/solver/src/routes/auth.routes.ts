import type { FastifyInstance } from 'fastify';
import '../types.js';
import { getDb } from '../db/server-db.js';
import { accounts, devices } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { generateChallenge, verifyChallengeResponse, generateSharedSecret } from '../auth/challenge.js';
import { generateToken, authPreHandler } from '../auth/auth-plugin.js';

interface RegisterBody {
  identity_id: string;
  fingerprints: string[];
  device_id: string;
  device_name?: string;
  site_id: string;
}

interface ChallengeBody {
  identity_id: string;
}

interface VerifyBody {
  identity_id: string;
  challenge: string;
  response: string;
}

interface AddDeviceBody {
  device_id: string;
  device_name?: string;
  site_id: string;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // POST /auth/register
  app.post<{ Body: RegisterBody }>('/auth/register', {
    schema: {
      body: {
        type: 'object',
        required: ['identity_id', 'fingerprints', 'device_id', 'site_id'],
        properties: {
          identity_id: { type: 'string', maxLength: 256 },
          fingerprints: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 512 } },
          device_id: { type: 'string', maxLength: 256 },
          device_name: { type: 'string' },
          site_id: { type: 'string', maxLength: 256 },
        },
      },
    },
  }, async (req, reply) => {
    const { identity_id, fingerprints, device_id, device_name, site_id } = req.body;
    const db = getDb();
    const now = Date.now();

    const existing = db.select({ identityId: accounts.identityId })
      .from(accounts)
      .where(eq(accounts.identityId, identity_id))
      .get();
    if (existing) {
      return reply.code(409).send({ error: 'Already registered' });
    }

    const sharedSecret = generateSharedSecret();

    db.insert(accounts).values({
      identityId: identity_id,
      fingerprints: JSON.stringify(fingerprints),
      sharedSecret,
      createdAt: now,
      lastSeenAt: now,
    }).run();

    db.insert(devices).values({
      deviceId: device_id,
      identityId: identity_id,
      deviceName: device_name ?? null,
      siteId: site_id,
      createdAt: now,
      lastSeenAt: now,
    }).run();

    return reply.code(201).send({ shared_secret: sharedSecret });
  });

  // POST /auth/challenge
  app.post<{ Body: ChallengeBody }>('/auth/challenge', {
    schema: {
      body: {
        type: 'object',
        required: ['identity_id'],
        properties: {
          identity_id: { type: 'string', maxLength: 256 },
        },
      },
    },
  }, async (req, reply) => {
    const { identity_id } = req.body;
    const db = getDb();

    const account = db.select({ identityId: accounts.identityId })
      .from(accounts)
      .where(eq(accounts.identityId, identity_id))
      .get();
    if (!account) {
      return reply.code(404).send({ error: 'Account not found' });
    }

    const { challenge, expiresAt } = generateChallenge(identity_id);
    return reply.send({ challenge, expires_at: expiresAt });
  });

  // POST /auth/verify
  app.post<{ Body: VerifyBody }>('/auth/verify', {
    schema: {
      body: {
        type: 'object',
        required: ['identity_id', 'challenge', 'response'],
        properties: {
          identity_id: { type: 'string', maxLength: 256 },
          challenge: { type: 'string', maxLength: 64 },
          response: { type: 'string', maxLength: 128 },
        },
      },
    },
  }, async (req, reply) => {
    const { identity_id, challenge, response } = req.body;
    const db = getDb();

    const account = db.select({ sharedSecret: accounts.sharedSecret })
      .from(accounts)
      .where(eq(accounts.identityId, identity_id))
      .get();

    if (!account) {
      return reply.code(404).send({ error: 'Account not found' });
    }

    const valid = verifyChallengeResponse(identity_id, challenge, response, account.sharedSecret);
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid challenge response' });
    }

    db.update(accounts)
      .set({ lastSeenAt: Date.now() })
      .where(eq(accounts.identityId, identity_id))
      .run();

    const token = generateToken(identity_id);
    return reply.send({ token });
  });

  // POST /auth/add-device
  app.post<{ Body: AddDeviceBody }>('/auth/add-device', {
    preHandler: authPreHandler,
    schema: {
      body: {
        type: 'object',
        required: ['device_id', 'site_id'],
        properties: {
          device_id: { type: 'string', maxLength: 256 },
          device_name: { type: 'string' },
          site_id: { type: 'string', maxLength: 256 },
        },
      },
    },
  }, async (req, reply) => {
    const identityId = req.identityId!;
    const { device_id, device_name, site_id } = req.body;
    const db = getDb();
    const now = Date.now();

    const existing = db.select({ deviceId: devices.deviceId })
      .from(devices)
      .where(eq(devices.deviceId, device_id))
      .get();
    if (existing) {
      return reply.code(409).send({ error: 'Device already registered' });
    }

    db.insert(devices).values({
      deviceId: device_id,
      identityId,
      deviceName: device_name ?? null,
      siteId: site_id,
      createdAt: now,
      lastSeenAt: now,
    }).run();

    return reply.code(201).send({ ok: true });
  });
}
