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

function extractAnchorTerms(value: string): string[] {
  const matches = value.toLowerCase().match(/[a-z0-9_]+/g) ?? [];

  return dedupeStrings(
    matches.filter((term) => term.length > 1 && !STOP_WORDS.has(term)),
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
