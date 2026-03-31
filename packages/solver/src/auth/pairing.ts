import { randomBytes } from 'node:crypto';

interface PairingEntry {
  identityId: string;
  expiresAt: number;
}

const PAIRING_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excludes visually ambiguous characters: 0/O/I/1

const pairingStore = new Map<string, PairingEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of pairingStore) {
    if (now > entry.expiresAt) pairingStore.delete(code);
  }
}, 5 * 60 * 1000).unref();

export function generatePairingCode(identityId: string): { code: string; expiresAt: number } {
  let code: string;
  // Retry until the generated code does not collide with an existing entry
  do {
    const bytes = randomBytes(6);
    code = Array.from(bytes).map(b => CODE_CHARS[b % CODE_CHARS.length]).join('');
  } while (pairingStore.has(code));

  const expiresAt = Date.now() + PAIRING_TTL_MS;
  pairingStore.set(code, { identityId, expiresAt });
  return { code, expiresAt };
}

export function redeemPairingCode(code: string): string | null {
  const entry = pairingStore.get(code.toUpperCase());
  if (!entry || Date.now() > entry.expiresAt) {
    pairingStore.delete(code.toUpperCase());
    return null;
  }
  pairingStore.delete(code.toUpperCase());
  return entry.identityId;
}
