import type { QueryPack } from './query-pack.js';
import type { CorivoSurfaceItem } from './types.js';

export interface RawRecallDatabase {
  listRawSessions?: () => Array<{ sessionKey: string }> | Promise<Array<{ sessionKey: string }>>;
  getRawTranscript?: (
    sessionKey: string,
  ) => (
    | {
        session: { sessionKey: string };
        messages: Array<{ content: string }>;
      }
    | null
    | Promise<{
        session: { sessionKey: string };
        messages: Array<{ content: string }>;
      } | null>
  );
}

export async function generateRawTranscriptRecall(
  db: RawRecallDatabase,
  queryPack: QueryPack,
): Promise<CorivoSurfaceItem | null> {
  if (typeof db.listRawSessions !== 'function' || typeof db.getRawTranscript !== 'function') {
    return null;
  }

  const sessions = await Promise.resolve(db.listRawSessions());
  const candidates: Array<{ sessionKey: string; excerpt: string; score: number }> = [];

  for (const session of sessions) {
    const transcript = await Promise.resolve(db.getRawTranscript(session.sessionKey));
    if (!transcript) {
      continue;
    }

    const joined = transcript.messages.map((message) => message.content).join('\n');
    const score = scoreTranscript(joined, queryPack);
    if (score === 0) {
      continue;
    }

    candidates.push({
      sessionKey: transcript.session.sessionKey,
      excerpt: buildExcerpt(joined, queryPack),
      score,
    });
  }

  candidates.sort((left, right) => right.score - left.score);
  const selected = candidates[0];
  if (!selected) {
    return null;
  }

  return {
    mode: 'uncertain',
    confidence: selected.score >= 2 ? 'medium' : 'low',
    whyNow: 'Markdown memory 暂未命中，改为回看原始对话记录。',
    claim: selected.excerpt,
    evidence: [`raw-session:${selected.sessionKey}`],
    memoryIds: [`raw-session:${selected.sessionKey}`],
  };
}

function scoreTranscript(transcript: string, queryPack: QueryPack): number {
  const haystack = transcript.toLowerCase();
  const anchorTerms = queryPack.anchorTerms.map((term) => term.toLowerCase());
  return anchorTerms.filter((term) => haystack.includes(term)).length;
}

function buildExcerpt(transcript: string, queryPack: QueryPack): string {
  const compact = transcript.replace(/\s+/g, ' ').trim();
  const lower = compact.toLowerCase();
  const firstTerm = queryPack.anchorTerms.find((term) => lower.includes(term.toLowerCase()));
  if (!firstTerm) {
    return compact.slice(0, 160);
  }

  const index = lower.indexOf(firstTerm.toLowerCase());
  const start = Math.max(0, index - 40);
  const end = Math.min(compact.length, index + 120);
  return compact.slice(start, end);
}
