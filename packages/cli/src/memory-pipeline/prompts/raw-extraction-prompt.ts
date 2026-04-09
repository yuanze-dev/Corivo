import { MEMORY_TYPES } from './memory-types.js';
import { WHAT_NOT_TO_SAVE_SECTION } from './what-not-to-save.js';

export interface RawExtractionPromptInput {
  sessionFilename: string;
  sessionTranscript: string;
}

const TYPES_SECTION = [
  '## Types of memory',
  '- user: durable user facts, preferences, identity, or working style that should stay private',
  '- feedback: user feedback about how the assistant should behave, usually private by default',
  '- project: project rules, goals, constraints, or conventions that often belong to the team scope',
  '- reference: reusable factual reference material, docs, or stable lookup knowledge that usually belongs to the team scope',
].join('\n');

const OUTPUT_FORMAT_SECTION = `## Output format
Return exactly one JSON object with this shape:

{
  "items": [
    {
      "frontmatter": {
        "name": "{memory name}",
        "description": "{one-line description}",
        "type": "{${MEMORY_TYPES.join(', ')}}",
        "scope": "{private, team}",
        "source_session": "{session filename}",
        "forget": true
      },
      "body": "{memory content}"
    }
  ]
}

Rules:
- Return only valid JSON. No markdown fences. No commentary.
- Each item must capture one useful memory, not a recap of the whole session.
- Omit the "forget" field unless it is needed.
- Do not include any file path or directory fields. The system will create filenames itself.
- If a session has NO memories worth extracting, output exactly: {"items":[]}`;

const REMEMBER_FORGET_SECTION = [
  '## Remember and forget instructions',
  'If the user explicitly asks you to remember something, extract it directly using the most appropriate memory type.',
  'If the user explicitly asks you to forget something, emit a deletion marker in the raw memory output instead of silently ignoring it.',
].join('\n');

export function buildRawExtractionPrompt(input: RawExtractionPromptInput): string {
  return [
    'You are acting as the memory extraction subagent.',
    'Read the provided session transcript and extract only discrete, useful memories from that session.',
    'Extract only discrete, useful memories that could help in future conversations or decisions.',
    'Do not write a session summary.',
    'Do not attempt to investigate or verify that content further.',
    TYPES_SECTION,
    WHAT_NOT_TO_SAVE_SECTION,
    OUTPUT_FORMAT_SECTION,
    REMEMBER_FORGET_SECTION,
    '## Session input',
    `Session filename: ${input.sessionFilename}`,
    'Transcript:',
    input.sessionTranscript,
  ].join('\n\n');
}
