import type { FastifyInstance } from 'fastify';
import '../types.js';
import { getServerDb } from '../db/server-db.js';
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
    const db = getServerDb();
    const now = Date.now();

    const existing = db.prepare('SELECT identity_id FROM accounts WHERE identity_id = ?').get(identity_id);
    if (existing) {
      return reply.code(409).send({ error: 'Already registered' });
    }

    const sharedSecret = generateSharedSecret();

    db.prepare(`
      INSERT INTO accounts (identity_id, fingerprints, shared_secret, created_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(identity_id, JSON.stringify(fingerprints), sharedSecret, now, now);

    db.prepare(`
      INSERT INTO devices (device_id, identity_id, device_name, site_id, created_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(device_id, identity_id, device_name ?? null, site_id, now, now);

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
    const db = getServerDb();

    const account = db.prepare('SELECT identity_id FROM accounts WHERE identity_id = ?').get(identity_id);
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
    const db = getServerDb();

    const account = db.prepare('SELECT shared_secret FROM accounts WHERE identity_id = ?').get(identity_id) as
      | { shared_secret: string }
      | undefined;

    if (!account) {
      return reply.code(404).send({ error: 'Account not found' });
    }

    const valid = verifyChallengeResponse(identity_id, challenge, response, account.shared_secret);
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid challenge response' });
    }

    db.prepare('UPDATE accounts SET last_seen_at = ? WHERE identity_id = ?').run(Date.now(), identity_id);

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
    const db = getServerDb();
    const now = Date.now();

    const existing = db.prepare('SELECT device_id FROM devices WHERE device_id = ?').get(device_id);
    if (existing) {
      return reply.code(409).send({ error: 'Device already registered' });
    }

    db.prepare(`
      INSERT INTO devices (device_id, identity_id, device_name, site_id, created_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(device_id, identityId, device_name ?? null, site_id, now, now);

    return reply.code(201).send({ ok: true });
  });
}
