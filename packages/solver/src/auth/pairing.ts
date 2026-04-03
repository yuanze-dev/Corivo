import { randomBytes } from 'node:crypto';

interface PairingEntry {
  identityId: string;
  expiresAt: number;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excludes visually ambiguous characters: 0/O/I/1

export interface PairingService {
  generatePairingCode(identityId: string): { code: string; expiresAt: number };
  redeemPairingCode(code: string): string | null;
}

interface CreatePairingServiceOptions {
  pairingTtlMs?: number;
  now?: () => number;
  cleanupIntervalMs?: number;
}

export function createPairingService(options: CreatePairingServiceOptions = {}): PairingService {
  const now = options.now ?? Date.now;
  const pairingTtlMs = options.pairingTtlMs ?? 24 * 60 * 60 * 1000;
  const pairingStore = new Map<string, PairingEntry>();

  setInterval(() => {
    const current = now();
    for (const [code, entry] of pairingStore) {
      if (current > entry.expiresAt) pairingStore.delete(code);
    }
  }, options.cleanupIntervalMs ?? 5 * 60 * 1000).unref();

  return {
    generatePairingCode(identityId) {
      let code: string;
      do {
        const bytes = randomBytes(6);
        code = Array.from(bytes).map((b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
      } while (pairingStore.has(code));

      const expiresAt = now() + pairingTtlMs;
      pairingStore.set(code, { identityId, expiresAt });
      return { code, expiresAt };
    },
    redeemPairingCode(code) {
      const normalizedCode = code.toUpperCase();
      const entry = pairingStore.get(normalizedCode);
      if (!entry || now() > entry.expiresAt) {
        pairingStore.delete(normalizedCode);
        return null;
      }
      pairingStore.delete(normalizedCode);
      return entry.identityId;
    },
  };
}
