import { describe, expect, it } from 'vitest';
import {
  parseRawMemoryDocument,
  renderMemoryIndex,
  renderRawMemoryDocument,
} from '../../src/memory-pipeline/index.js';

describe('memory pipeline markdown', () => {
  it('parses raw memory documents with FILE comments and frontmatter', () => {
    const parsed = parseRawMemoryDocument(`<!-- FILE: private/user-short-prs.md -->
\`\`\`markdown
---
name: User prefers short PRs
description: User usually wants small reviewable pull requests
type: user
scope: private
source_session: session-001
---

Keep PRs narrowly scoped and easy to review.
\`\`\`
`);

    expect(parsed.noMemories).toBe(false);
    expect(parsed.documents).toHaveLength(1);
    expect(parsed.documents[0]).toMatchObject({
      filePath: 'private/user-short-prs.md',
      frontmatter: {
        name: 'User prefers short PRs',
        description: 'User usually wants small reviewable pull requests',
        type: 'user',
        scope: 'private',
        source_session: 'session-001',
      },
      body: 'Keep PRs narrowly scoped and easy to review.',
    });
  });

  it('recognizes the NO_MEMORIES sentinel', () => {
    const parsed = parseRawMemoryDocument('<!-- NO_MEMORIES -->');

    expect(parsed).toEqual({
      noMemories: true,
      documents: [],
    });
  });

  it('renders MEMORY.md entries as one-line semantic hooks', () => {
    const rawMemory = renderRawMemoryDocument({
      filePath: 'private/user-short-prs.md',
      frontmatter: {
        name: 'User prefers short PRs',
        description: 'User usually wants small reviewable pull requests',
        type: 'user',
        scope: 'private',
        source_session: 'session-001',
      },
      body: 'Keep PRs narrowly scoped and easy to review.',
    });

    expect(rawMemory).toContain('<!-- FILE: private/user-short-prs.md -->');
    expect(rawMemory).toContain('source_session: session-001');

    const index = renderMemoryIndex([
      {
        title: 'User prefers short PRs',
        filename: 'user-short-prs.md',
        hook: 'Small, reviewable PRs are the default expectation.',
      },
    ]);

    expect(index).toBe('- [User prefers short PRs](user-short-prs.md) - Small, reviewable PRs are the default expectation.');
    expect(index).toMatch(/^[^\n]+$/);
  });
});
