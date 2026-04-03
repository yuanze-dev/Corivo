import { randomBytes } from 'node:crypto';

interface TokenEntry {
  identityId: string;
  expiresAt: number;
}

export interface TokenLifecycleService {
  issueToken(identityId: string): string;
  authenticateBearer(authHeader: string | undefined): { ok: true; identityId: string } | { ok: false; code: 'UNAUTHORIZED' | 'INVALID_OR_EXPIRED' };
}

interface CreateTokenLifecycleServiceOptions {
  tokenTtlMs: number;
  now?: () => number;
  createToken?: () => string;
  cleanupIntervalMs?: number;
}

export function createTokenLifecycleService(options: CreateTokenLifecycleServiceOptions): TokenLifecycleService {
  const now = options.now ?? Date.now;
  const createToken = options.createToken ?? (() => randomBytes(32).toString('hex'));
  const cleanupIntervalMs = options.cleanupIntervalMs ?? 5 * 60_000;
  const tokenStore = new Map<string, TokenEntry>();

  setInterval(() => {
    const current = now();
    for (const [token, entry] of tokenStore) {
      if (current > entry.expiresAt) {
        tokenStore.delete(token);
      }
    }
  }, cleanupIntervalMs).unref();

  return {
    issueToken(identityId: string) {
      const token = createToken();
      tokenStore.set(token, {
        identityId,
        expiresAt: now() + options.tokenTtlMs,
      });
      return token;
    },
    authenticateBearer(authHeader: string | undefined) {
      if (!authHeader?.startsWith('Bearer ')) {
        return { ok: false, code: 'UNAUTHORIZED' };
      }

      const token = authHeader.slice(7);
      const entry = tokenStore.get(token);
      if (!entry || now() > entry.expiresAt) {
        tokenStore.delete(token);
        return { ok: false, code: 'INVALID_OR_EXPIRED' };
      }

      return { ok: true, identityId: entry.identityId };
    },
  };
}
