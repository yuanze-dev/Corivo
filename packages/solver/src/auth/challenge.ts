import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

interface ChallengeEntry {
  challenge: string;
  expiresAt: number;
}

const challengeStore = new Map<string, ChallengeEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of challengeStore) {
    if (now > entry.expiresAt) challengeStore.delete(key);
  }
}, 60_000).unref();

export function generateChallenge(identityId: string): { challenge: string; expiresAt: number } {
  const challenge = randomBytes(16).toString('hex');
  const expiresAt = Date.now() + config.challengeTtlMs;
  challengeStore.set(identityId, { challenge, expiresAt });
  return { challenge, expiresAt };
}

export function verifyChallengeResponse(
  identityId: string,
  challenge: string,
  response: string,
  sharedSecret: string
): boolean {
  const entry = challengeStore.get(identityId);
  if (!entry || entry.challenge !== challenge || Date.now() > entry.expiresAt) {
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
}

export function generateSharedSecret(): string {
  return randomBytes(32).toString('hex');
}
