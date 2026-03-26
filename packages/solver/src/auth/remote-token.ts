import { createHmac } from 'node:crypto';

interface ChallengeResponse {
  challenge: string;
  expires_at: number;
}

interface VerifyResponse {
  token: string;
}

export interface FetchTokenInput {
  serverUrl: string;
  identityId: string;
  sharedSecret: string;
}

export interface PullChangesInput {
  serverUrl: string;
  token: string;
  siteId: string;
  sinceVersion: number;
}

async function postJson<T>(url: string, body: unknown, headers?: Record<string, string>): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchToken(input: FetchTokenInput): Promise<string> {
  const challengeResult = await postJson<ChallengeResponse>(`${input.serverUrl}/auth/challenge`, {
    identity_id: input.identityId,
  });

  const response = createHmac('sha256', input.sharedSecret)
    .update(challengeResult.challenge)
    .digest('hex');

  const verifyResult = await postJson<VerifyResponse>(`${input.serverUrl}/auth/verify`, {
    identity_id: input.identityId,
    challenge: challengeResult.challenge,
    response,
  });

  return verifyResult.token;
}

export async function pullChanges(input: PullChangesInput): Promise<unknown> {
  return postJson(`${input.serverUrl}/sync/pull`, {
    site_id: input.siteId,
    since_version: input.sinceVersion,
  }, {
    Authorization: `Bearer ${input.token}`,
  });
}
