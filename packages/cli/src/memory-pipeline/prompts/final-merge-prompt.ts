import { WHAT_NOT_TO_SAVE_SECTION } from './what-not-to-save.js';

export interface FinalMergePromptInput {
  rawFiles: string[];
  existingFinalFiles: string[];
}

const MERGE_RULES_SECTION = [
  '## Merge rules',
  'Dedup by semantics, not filenames',
  'Treat memories as duplicates when they express the same fact, rule, or preference even if the filenames or wording differ.',
  'Prefer the more complete, more specific, or more recent version when memories overlap semantically.',
  'Merge evolving facts',
  'When a newer memory naturally supersedes an older one, keep the newer, more accurate canonical version instead of preserving both.',
  'Resolve conflicts explicitly',
  'If two memories look inconsistent but can both be true under different conditions, integrate them into one clearer canonical memory instead of keeping them as conflicting duplicates.',
  'Only keep multiple memories when splitting them makes the canonical set clearer.',
  'Preserve scope correctly',
  'Re-check scope during merge so user memories stay private, feedback defaults to private, project constraints usually land in team, and reference memories usually land in team.',
  'Drop stale project memories',
  'Remove project memories that are clearly outdated, date-bound, or no longer represent a durable project constraint.',
  'Respect the exclusion list',
  'Apply the exclusion rules again as a second defense and do not let raw output force low-value or disallowed memories into the final set.',
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
