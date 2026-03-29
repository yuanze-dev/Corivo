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
