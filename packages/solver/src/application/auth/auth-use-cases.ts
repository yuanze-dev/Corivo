import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { accounts, devices } from '../../db/schema.js';
import type * as schema from '../../db/schema.js';

interface RegisterAccountInput {
  identityId: string;
  fingerprints: string[];
  deviceId: string;
  deviceName?: string;
  platform?: string;
  arch?: string;
  siteId: string;
}

interface VerifyChallengeInput {
  identityId: string;
  challenge: string;
  response: string;
}

interface AddDeviceInput {
  identityId: string;
  deviceId: string;
  deviceName?: string;
  platform?: string;
  arch?: string;
  siteId: string;
}

interface RedeemPairingInput {
  pairingCode: string;
  deviceId: string;
  deviceName?: string;
  platform?: string;
  arch?: string;
  siteId: string;
}

interface AuthUseCaseDeps {
  db: BetterSQLite3Database<typeof schema>;
  now?: () => number;
  issueToken(identityId: string): string;
  generateChallenge(identityId: string): { challenge: string; expiresAt: number };
  verifyChallengeResponse(identityId: string, challenge: string, response: string, sharedSecret: string): boolean;
  generateSharedSecret(): string;
  generatePairingCode(identityId: string): { code: string; expiresAt: number };
  redeemPairingCode(code: string): string | null;
}

export interface AuthUseCases {
  registerAccount(input: RegisterAccountInput): { ok: true; sharedSecret: string } | { ok: false; code: 'ALREADY_REGISTERED' };
  createChallenge(identityId: string): { ok: true; challenge: string; expiresAt: number } | { ok: false; code: 'ACCOUNT_NOT_FOUND' };
  verifyChallenge(input: VerifyChallengeInput): { ok: true; token: string } | { ok: false; code: 'ACCOUNT_NOT_FOUND' | 'INVALID_CHALLENGE_RESPONSE' };
  addDevice(input: AddDeviceInput): { ok: true } | { ok: false; code: 'DEVICE_ALREADY_REGISTERED' };
  createPairingCode(identityId: string): { code: string; expiresAt: number };
  redeemPairing(input: RedeemPairingInput): { ok: true; identityId: string; sharedSecret: string } | { ok: false; code: 'PAIRING_CODE_INVALID' | 'ACCOUNT_NOT_FOUND' | 'DEVICE_ALREADY_REGISTERED' };
  listDevices(identityId: string): {
    deviceId: string;
    deviceName: string | null;
    platform: string | null;
    arch: string | null;
    createdAt: number;
    lastSeenAt: number;
  }[];
}

export function createAuthUseCases(deps: AuthUseCaseDeps): AuthUseCases {
  const now = deps.now ?? Date.now;

  return {
    registerAccount(input) {
      const existing = deps.db
        .select({ identityId: accounts.identityId })
        .from(accounts)
        .where(eq(accounts.identityId, input.identityId))
        .get();
      if (existing) {
        return { ok: false, code: 'ALREADY_REGISTERED' };
      }

      const current = now();
      const sharedSecret = deps.generateSharedSecret();

      deps.db
        .insert(accounts)
        .values({
          identityId: input.identityId,
          fingerprints: JSON.stringify(input.fingerprints),
          sharedSecret,
          createdAt: current,
          lastSeenAt: current,
        })
        .run();

      deps.db
        .insert(devices)
        .values({
          deviceId: input.deviceId,
          identityId: input.identityId,
          deviceName: input.deviceName ?? null,
          platform: input.platform ?? null,
          arch: input.arch ?? null,
          siteId: input.siteId,
          createdAt: current,
          lastSeenAt: current,
        })
        .run();

      return { ok: true, sharedSecret };
    },
    createChallenge(identityId) {
      const account = deps.db
        .select({ identityId: accounts.identityId })
        .from(accounts)
        .where(eq(accounts.identityId, identityId))
        .get();
      if (!account) {
        return { ok: false, code: 'ACCOUNT_NOT_FOUND' };
      }

      const { challenge, expiresAt } = deps.generateChallenge(identityId);
      return { ok: true, challenge, expiresAt };
    },
    verifyChallenge(input) {
      const account = deps.db
        .select({ sharedSecret: accounts.sharedSecret })
        .from(accounts)
        .where(eq(accounts.identityId, input.identityId))
        .get();
      if (!account) {
        return { ok: false, code: 'ACCOUNT_NOT_FOUND' };
      }

      const valid = deps.verifyChallengeResponse(input.identityId, input.challenge, input.response, account.sharedSecret);
      if (!valid) {
        return { ok: false, code: 'INVALID_CHALLENGE_RESPONSE' };
      }

      deps.db
        .update(accounts)
        .set({ lastSeenAt: now() })
        .where(eq(accounts.identityId, input.identityId))
        .run();

      const token = deps.issueToken(input.identityId);
      return { ok: true, token };
    },
    addDevice(input) {
      const existing = deps.db
        .select({ deviceId: devices.deviceId })
        .from(devices)
        .where(eq(devices.deviceId, input.deviceId))
        .get();
      if (existing) {
        return { ok: false, code: 'DEVICE_ALREADY_REGISTERED' };
      }

      const current = now();
      deps.db
        .insert(devices)
        .values({
          deviceId: input.deviceId,
          identityId: input.identityId,
          deviceName: input.deviceName ?? null,
          platform: input.platform ?? null,
          arch: input.arch ?? null,
          siteId: input.siteId,
          createdAt: current,
          lastSeenAt: current,
        })
        .run();

      return { ok: true };
    },
    createPairingCode(identityId) {
      return deps.generatePairingCode(identityId);
    },
    redeemPairing(input) {
      const identityId = deps.redeemPairingCode(input.pairingCode);
      if (!identityId) {
        return { ok: false, code: 'PAIRING_CODE_INVALID' };
      }

      const account = deps.db
        .select({ sharedSecret: accounts.sharedSecret })
        .from(accounts)
        .where(eq(accounts.identityId, identityId))
        .get();
      if (!account) {
        return { ok: false, code: 'ACCOUNT_NOT_FOUND' };
      }

      const existing = deps.db
        .select({ deviceId: devices.deviceId })
        .from(devices)
        .where(eq(devices.deviceId, input.deviceId))
        .get();
      if (existing) {
        return { ok: false, code: 'DEVICE_ALREADY_REGISTERED' };
      }

      const current = now();
      deps.db
        .insert(devices)
        .values({
          deviceId: input.deviceId,
          identityId,
          deviceName: input.deviceName ?? null,
          platform: input.platform ?? null,
          arch: input.arch ?? null,
          siteId: input.siteId,
          createdAt: current,
          lastSeenAt: current,
        })
        .run();

      return {
        ok: true,
        identityId,
        sharedSecret: account.sharedSecret,
      };
    },
    listDevices(identityId) {
      return deps.db
        .select({
          deviceId: devices.deviceId,
          deviceName: devices.deviceName,
          platform: devices.platform,
          arch: devices.arch,
          createdAt: devices.createdAt,
          lastSeenAt: devices.lastSeenAt,
        })
        .from(devices)
        .where(eq(devices.identityId, identityId))
        .all();
    },
  };
}
