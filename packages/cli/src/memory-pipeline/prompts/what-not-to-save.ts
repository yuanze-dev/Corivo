export const WHAT_NOT_TO_SAVE_ITEMS = [
  'Do not save one-off tasks, temporary reminders, or TODO items.',
  'Do not save ephemeral task details or current conversation-only context.',
  'Do not save information that is speculative, weakly implied, or too vague to be a durable memory.',
  'Do not save raw transcripts, excessive wording, or details that do not improve future assistance.',
  'Do not save code patterns, coding conventions, architecture, file paths, or project structure as memories.',
  'Do not save git history, recent changes, or who changed what.',
  'Do not save debugging solutions or fix recipes unless they become a stable project rule.',
  'Do not save anything already documented in CLAUDE.md files.',
  'Do not save secrets, credentials, tokens, private keys, or other sensitive information.',
  'Do not save sensitive content beyond what is necessary for the memory itself.',
] as const;

export const WHAT_NOT_TO_SAVE_SECTION = [
  '## What NOT to save in memory',
  ...WHAT_NOT_TO_SAVE_ITEMS.map((item) => `- ${item}`),
].join('\n');
