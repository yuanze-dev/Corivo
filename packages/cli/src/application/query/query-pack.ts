export interface QueryPackInput {
  prompt?: string;
  assistantMessage?: string;
  cwd?: string;
  sessionId?: string;
  surfacedMemoryIds?: string[];
  recentTurns?: string[];
}

export interface QueryPack {
  anchorText: string;
  prompt: string;
  assistantMessage: string;
  cwd?: string;
  sessionId?: string;
  surfacedMemoryIds: string[];
  recentTurns: string[];
  anchorTerms: string[];
}

export interface SimilarQueryRecord {
  query: string;
  timestamp: number;
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'the',
  'to',
  'for',
  'of',
  'in',
  'on',
  'with',
  'we',
  'i',
  'it',
  'this',
  'that',
  'is',
  'are',
  'be',
  'kept',
  'keep',
  'old',
  'plan',
]);

function normalizeText(value?: string): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function dedupeStrings(values: string[] = []): string[] {
  return [...new Set(values.filter(Boolean))];
}

function extractHanTerms(value: string): string[] {
  const segments = value.match(/[\p{Script=Han}]{2,}/gu) ?? [];
  const terms: string[] = [];

  for (const segment of segments) {
    for (let start = 0; start < segment.length; start++) {
      for (let size = 2; size <= 4; size++) {
        const term = segment.slice(start, start + size);
        if (term.length >= 2) {
          terms.push(term);
        }
      }
    }
  }

  return terms;
}

function extractQueryHistoryTerms(value: string): string[] {
  const hanChars = value.match(/[\u4e00-\u9fa5]/g) ?? [];
  const englishWords = value.toLowerCase().match(/[a-z]{2,}/g) ?? [];
  return dedupeStrings([...hanChars, ...englishWords]);
}

function extractAnchorTerms(value: string): string[] {
  const asciiMatches = value.toLowerCase().match(/[a-z0-9_]+/g) ?? [];
  const hanMatches = extractHanTerms(value);

  return dedupeStrings(
    [
      ...asciiMatches.filter((term) => term.length > 1 && !STOP_WORDS.has(term)),
      ...hanMatches,
    ],
  );
}

export function isSimilarQuery(query1: string, query2: string): boolean {
  if (query1 === query2) {
    return false;
  }

  const words1 = new Set(extractQueryHistoryTerms(query1));
  const words2 = new Set(extractQueryHistoryTerms(query2));

  if (words1.size === 0 || words2.size === 0) {
    return false;
  }

  const intersection = new Set([...words1].filter((word) => words2.has(word)));
  const union = new Set([...words1, ...words2]);
  return intersection.size / union.size > 0.4;
}

export function buildSimilarQueryReminder(similarQueries: SimilarQueryRecord[]): string {
  if (similarQueries.length === 1) {
    const preview = similarQueries[0].query;
    return `[corivo] 你之前也查过类似的："${preview.length > 20 ? `${preview.slice(0, 20)}...` : preview}"`;
  }

  const previews = similarQueries
    .slice(0, 2)
    .map(({ query }) => (query.length > 15 ? `${query.slice(0, 15)}...` : query));
  return `[corivo] 你之前也查过类似的：${previews.join('、')}`;
}

export function createQueryPack(input: QueryPackInput): QueryPack {
  const prompt = normalizeText(input.prompt);
  const assistantMessage = normalizeText(input.assistantMessage);
  const anchorText = prompt || assistantMessage;
  const recentTurns = (input.recentTurns ?? [])
    .map((turn) => normalizeText(turn))
    .filter(Boolean);

  return {
    anchorText,
    prompt,
    assistantMessage,
    cwd: input.cwd,
    sessionId: input.sessionId,
    recentTurns,
    surfacedMemoryIds: dedupeStrings(input.surfacedMemoryIds ?? []).sort(),
    anchorTerms: extractAnchorTerms(anchorText),
  };
}
