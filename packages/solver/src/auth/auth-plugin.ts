import type { FastifyRequest, FastifyReply } from 'fastify';
import { randomBytes } from 'node:crypto';
import { config } from '../config.js';
import '../types.js';

interface TokenEntry {
  identityId: string;
  expiresAt: number;
}

const tokenStore = new Map<string, TokenEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of tokenStore) {
    if (now > entry.expiresAt) tokenStore.delete(key);
  }
}, 5 * 60_000).unref();

export function generateToken(identityId: string): string {
  const token = randomBytes(32).toString('hex');
  tokenStore.set(token, {
    identityId,
    expiresAt: Date.now() + config.tokenTtlMs,
  });
  return token;
}

export async function authPreHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'Unauthorized' });
    return;
  }
  const token = authHeader.slice(7);
  const entry = tokenStore.get(token);
  if (!entry || Date.now() > entry.expiresAt) {
    tokenStore.delete(token);
    reply.code(401).send({ error: 'Invalid or expired token' });
    return;
  }
  req.identityId = entry.identityId;
}
