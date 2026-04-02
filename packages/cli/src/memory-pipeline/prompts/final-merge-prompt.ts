import { WHAT_NOT_TO_SAVE_SECTION } from './what-not-to-save.js';

export interface FinalMergePromptInput {
  rawFiles: string[];
  existingFinalFiles: string[];
}

const MERGE_RULES_SECTION = [
  '## Merge rules',
  'Dedup by semantics, not filenames',
  'Merge evolving facts',
  'Resolve conflicts explicitly',
  'Preserve scope correctly',
  'Drop stale project memories',
  'Respect the exclusion list',
].join('\n');

const OUTPUT_TARGETS_SECTION = `## Output targets
Write the final memory files directly to disk:

- Private memories -> memories/final/private/{filename}.md
- Team memories -> memories/final/team/{filename}.md
- Private index -> memories/final/private/MEMORY.md
- Team index -> memories/final/team/MEMORY.md

Each MEMORY.md entry should be one line, under ~150 characters
Organize semantically by topic, not chronologically
Keep each index under 200 lines`;

export function buildFinalMergePrompt(input: FinalMergePromptInput): string {
  const rawFiles = input.rawFiles.length > 0 ? input.rawFiles.join('\n') : '(none)';
  const finalFiles =
    input.existingFinalFiles.length > 0 ? input.existingFinalFiles.join('\n') : '(none)';

  return [
    'You are acting as the final memory merge subagent.',
    'Read the raw extraction files and current final memory set, then update the canonical markdown memories.',
    MERGE_RULES_SECTION,
    WHAT_NOT_TO_SAVE_SECTION,
    OUTPUT_TARGETS_SECTION,
    '## Inputs',
    'Raw extraction files:',
    rawFiles,
    'Existing final memory files:',
    finalFiles,
  ].join('\n\n');
}
