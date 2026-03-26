import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { getDb } from '../db/server-db.js';
import { accounts } from '../db/schema.js';
import { eq } from 'drizzle-orm';

interface ChallengeResponse {
  challenge: string;
}

interface VerifyResponse {
  token: string;
}

export async function getTokenForIdentity(app: FastifyInstance, identityId: string): Promise<string> {
  const db = getDb();
  const account = db.select({ sharedSecret: accounts.sharedSecret })
    .from(accounts)
    .where(eq(accounts.identityId, identityId))
    .get();

  if (!account) {
    throw new Error(`Account not found for identity: ${identityId}`);
  }

  const challengeReply = await app.inject({
    method: 'POST',
    url: '/auth/challenge',
    payload: { identity_id: identityId },
  });

  if (challengeReply.statusCode !== 200) {
    throw new Error(`Challenge request failed: ${challengeReply.statusCode} ${challengeReply.body}`);
  }

  const { challenge } = challengeReply.json() as ChallengeResponse;
  const response = createHmac('sha256', account.sharedSecret).update(challenge).digest('hex');

  const verifyReply = await app.inject({
    method: 'POST',
    url: '/auth/verify',
    payload: {
      identity_id: identityId,
      challenge,
      response,
    },
  });

  if (verifyReply.statusCode !== 200) {
    throw new Error(`Verify request failed: ${verifyReply.statusCode} ${verifyReply.body}`);
  }

  const { token } = verifyReply.json() as VerifyResponse;
  return token;
}
