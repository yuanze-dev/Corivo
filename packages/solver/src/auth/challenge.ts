import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

interface ChallengeEntry {
  challenge: string;
  expiresAt: number;
}

export interface ChallengeService {
  generateChallenge(identityId: string): { challenge: string; expiresAt: number };
  verifyChallengeResponse(identityId: string, challenge: string, response: string, sharedSecret: string): boolean;
  generateSharedSecret(): string;
}

interface CreateChallengeServiceOptions {
  challengeTtlMs: number;
  now?: () => number;
  cleanupIntervalMs?: number;
}

export function createChallengeService(options: CreateChallengeServiceOptions): ChallengeService {
  const now = options.now ?? Date.now;
  const challengeStore = new Map<string, ChallengeEntry>();

  setInterval(() => {
    const current = now();
    for (const [key, entry] of challengeStore) {
      if (current > entry.expiresAt) challengeStore.delete(key);
    }
  }, options.cleanupIntervalMs ?? 60_000).unref();

  return {
    generateChallenge(identityId) {
      const challenge = randomBytes(16).toString('hex');
      const expiresAt = now() + options.challengeTtlMs;
      challengeStore.set(identityId, { challenge, expiresAt });
      return { challenge, expiresAt };
    },
    verifyChallengeResponse(identityId, challenge, response, sharedSecret) {
      const entry = challengeStore.get(identityId);
      if (!entry || entry.challenge !== challenge || now() > entry.expiresAt) {
        challengeStore.delete(identityId);
        return false;
      }
      const expected = createHmac('sha256', sharedSecret).update(challenge).digest('hex');
      challengeStore.delete(identityId);
      try {
        const expectedBuf = Buffer.from(expected, 'hex');
        const responseBuf = Buffer.from(response, 'hex');
        if (expectedBuf.length !== responseBuf.length) return false;
        return timingSafeEqual(expectedBuf, responseBuf);
      } catch {
        return false;
      }
    },
    generateSharedSecret() {
      return randomBytes(32).toString('hex');
    },
  };
}
