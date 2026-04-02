import { describe, expect, it } from 'vitest';
import {
  buildFinalMergePrompt,
  buildRawExtractionPrompt,
  MEMORY_TYPES,
  WHAT_NOT_TO_SAVE_SECTION,
} from '../../src/memory-pipeline/index.js';

describe('memory pipeline prompts', () => {
  it('builds the raw extraction prompt with the required invariant sections', () => {
    const prompt = buildRawExtractionPrompt({
      sessionFilename: 'session-001.json',
      sessionTranscript: 'User: remember that I prefer short PRs.',
    });

    expect(prompt).toContain('You are acting as the memory extraction subagent');
    expect(prompt).toContain('Do not attempt to investigate or verify that content further');
    expect(prompt).toContain('## Types of memory');
    expect(prompt).toContain('## What NOT to save in memory');
    expect(prompt).toContain('## Output format');
    expect(prompt).toContain('If the user explicitly asks you to remember something');
    expect(prompt).toContain('If the user explicitly asks you to forget something');
    expect(prompt).toContain('If a session has NO memories worth extracting, output exactly: <!-- NO_MEMORIES -->');
    expect(prompt).toContain('<!-- FILE: {scope}/{filename}.md -->');
    expect(prompt).toContain('type: {user, feedback, project, reference}');
    expect(prompt).toContain('scope: {private, team}');
    expect(prompt).toContain('source_session: {session filename}');
    expect(prompt).toContain(WHAT_NOT_TO_SAVE_SECTION);
    expect(MEMORY_TYPES).toEqual(['user', 'feedback', 'project', 'reference']);
  });

  it('builds the final merge prompt with the required merge rule sections', () => {
    const prompt = buildFinalMergePrompt({
      rawFiles: ['raw/session-001.memories.md'],
      existingFinalFiles: ['memories/final/private/user-short-prs.md'],
    });

    expect(prompt).toContain('Dedup by semantics, not filenames');
    expect(prompt).toContain('Merge evolving facts');
    expect(prompt).toContain('Resolve conflicts explicitly');
    expect(prompt).toContain('Preserve scope correctly');
    expect(prompt).toContain('Drop stale project memories');
    expect(prompt).toContain('Respect the exclusion list');
    expect(prompt).toContain('Write the final memory files directly to disk');
    expect(prompt).toContain('Private memories -> memories/final/private/{filename}.md');
    expect(prompt).toContain('Team memories -> memories/final/team/{filename}.md');
    expect(prompt).toContain('Private index -> memories/final/private/MEMORY.md');
    expect(prompt).toContain('Team index -> memories/final/team/MEMORY.md');
    expect(prompt).toContain('Each MEMORY.md entry should be one line, under ~150 characters');
    expect(prompt).toContain('Organize semantically by topic, not chronologically');
    expect(prompt).toContain('Keep each index under 200 lines');
  });
});
