import type { FastifyInstance } from 'fastify';
import '../types.js';
import type { preHandlerHookHandler } from 'fastify';
import type { AuthUseCases } from '../application/auth/auth-use-cases.js';

interface RegisterBody {
  identity_id: string;
  fingerprints: string[];
  device_id: string;
  device_name?: string;
  platform?: string;
  arch?: string;
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
  platform?: string;
  arch?: string;
  site_id: string;
}

interface RedeemPairBody {
  pairing_code: string;
  device_id: string;
  device_name?: string;
  platform?: string;
  arch?: string;
  site_id: string;
}

interface AuthRouteDeps {
  authUseCases: AuthUseCases;
  authPreHandler: preHandlerHookHandler;
}

export async function authRoutes(app: FastifyInstance, deps: AuthRouteDeps): Promise<void> {
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
          platform: { type: 'string' },
          arch: { type: 'string' },
          site_id: { type: 'string', maxLength: 256 },
        },
      },
    },
  }, async (req, reply) => {
    const result = deps.authUseCases.registerAccount({
      identityId: req.body.identity_id,
      fingerprints: req.body.fingerprints,
      deviceId: req.body.device_id,
      deviceName: req.body.device_name,
      platform: req.body.platform,
      arch: req.body.arch,
      siteId: req.body.site_id,
    });
    if (!result.ok) {
      return reply.code(409).send({ error: 'Already registered' });
    }

    return reply.code(201).send({ shared_secret: result.sharedSecret });
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
    const result = deps.authUseCases.createChallenge(req.body.identity_id);
    if (!result.ok) {
      return reply.code(404).send({ error: 'Account not found' });
    }

    return reply.send({ challenge: result.challenge, expires_at: result.expiresAt });
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
    const result = deps.authUseCases.verifyChallenge({
      identityId: req.body.identity_id,
      challenge: req.body.challenge,
      response: req.body.response,
    });
    if (!result.ok) {
      if (result.code === 'ACCOUNT_NOT_FOUND') {
        return reply.code(404).send({ error: 'Account not found' });
      }
      return reply.code(401).send({ error: 'Invalid challenge response' });
    }

    return reply.send({ token: result.token });
  });

  // POST /auth/add-device
  app.post<{ Body: AddDeviceBody }>('/auth/add-device', {
    preHandler: deps.authPreHandler,
    schema: {
      body: {
        type: 'object',
        required: ['device_id', 'site_id'],
        properties: {
          device_id: { type: 'string', maxLength: 256 },
          device_name: { type: 'string' },
          platform: { type: 'string' },
          arch: { type: 'string' },
          site_id: { type: 'string', maxLength: 256 },
        },
      },
    },
  }, async (req, reply) => {
    const result = deps.authUseCases.addDevice({
      identityId: req.identityId!,
      deviceId: req.body.device_id,
      deviceName: req.body.device_name,
      platform: req.body.platform,
      arch: req.body.arch,
      siteId: req.body.site_id,
    });
    if (!result.ok) {
      return reply.code(409).send({ error: 'Device already registered' });
    }

    return reply.code(201).send({ ok: true });
  });

  // POST /auth/pair — generate a pairing code (requires authentication)
  app.post('/auth/pair', {
    preHandler: deps.authPreHandler,
  }, async (req, reply) => {
    const result = deps.authUseCases.createPairingCode(req.identityId!);
    return reply.send({ pairing_code: result.code, expires_at: result.expiresAt });
  });

  // POST /auth/redeem-pair — redeem a pairing code to register a new device (no authentication required)
  app.post<{ Body: RedeemPairBody }>('/auth/redeem-pair', {
    schema: {
      body: {
        type: 'object',
        required: ['pairing_code', 'device_id', 'site_id'],
        properties: {
          pairing_code: { type: 'string', maxLength: 16 },
          device_id: { type: 'string', maxLength: 256 },
          device_name: { type: 'string' },
          platform: { type: 'string' },
          arch: { type: 'string' },
          site_id: { type: 'string', maxLength: 256 },
        },
      },
    },
  }, async (req, reply) => {
    const result = deps.authUseCases.redeemPairing({
      pairingCode: req.body.pairing_code,
      deviceId: req.body.device_id,
      deviceName: req.body.device_name,
      platform: req.body.platform,
      arch: req.body.arch,
      siteId: req.body.site_id,
    });
    if (!result.ok) {
      if (result.code === 'DEVICE_ALREADY_REGISTERED') {
        return reply.code(409).send({ error: 'Device already registered' });
      }
      if (result.code === 'ACCOUNT_NOT_FOUND') {
        return reply.code(404).send({ error: 'Account not found' });
      }
      return reply.code(404).send({ error: 'Pairing code invalid or expired' });
    }

    return reply.code(201).send({ identity_id: result.identityId, shared_secret: result.sharedSecret });
  });

  // GET /auth/devices — list all devices belonging to the current identity (requires authentication)
  app.get('/auth/devices', {
    preHandler: deps.authPreHandler,
  }, async (req, reply) => {
    const rows = deps.authUseCases.listDevices(req.identityId!);
    return reply.send({ devices: rows });
  });
}
