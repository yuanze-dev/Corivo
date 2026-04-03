import { config } from './config.js';
import { getDb } from './db/server-db.js';
import { createChallengeService } from './auth/challenge.js';
import { createPairingService } from './auth/pairing.js';
import { createAuthPreHandler } from './auth/auth-plugin.js';
import { createAuthUseCases } from './application/auth/auth-use-cases.js';
import { createTokenLifecycleService } from './application/auth/token-lifecycle-service.js';
import { createSyncRepository } from './sync/sync-handler.js';
import { createServer } from './runtime/create-server.js';

const isDev = process.env.NODE_ENV !== 'production';

export async function buildServer() {
  const db = getDb();
  const tokenLifecycleService = createTokenLifecycleService({
    tokenTtlMs: config.tokenTtlMs,
  });
  const challengeService = createChallengeService({
    challengeTtlMs: config.challengeTtlMs,
  });
  const pairingService = createPairingService();
  const authPreHandler = createAuthPreHandler(tokenLifecycleService);

  const authUseCases = createAuthUseCases({
    db,
    issueToken: (identityId) => tokenLifecycleService.issueToken(identityId),
    generateChallenge: (identityId) => challengeService.generateChallenge(identityId),
    verifyChallengeResponse: (identityId, challenge, response, sharedSecret) =>
      challengeService.verifyChallengeResponse(identityId, challenge, response, sharedSecret),
    generateSharedSecret: () => challengeService.generateSharedSecret(),
    generatePairingCode: (identityId) => pairingService.generatePairingCode(identityId),
    redeemPairingCode: (code) => pairingService.redeemPairingCode(code),
  });
  const syncRepository = createSyncRepository({ db });

  return createServer({
    isDev,
    authUseCases,
    syncRepository,
    authPreHandler,
  });
}
