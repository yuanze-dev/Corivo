import { describe, expect, it } from 'vitest';
import {
  parseRawMemoryDocument,
  renderFinalMemoryDocument,
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

  it('parses a deletion-marker raw memory path', () => {
    const parsed = parseRawMemoryDocument(`<!-- FILE: private/user-short-prs.md -->
\`\`\`markdown
---
name: Forget short PR preference
description: Remove the short PR preference memory
type: feedback
scope: private
source_session: session-002
forget: true
---

The user explicitly asked to forget this memory.
\`\`\`
`);

    expect(parsed.documents[0]?.frontmatter.forget).toBe(true);

    const rendered = renderRawMemoryDocument(parsed.documents[0]!);
    expect(rendered).toContain('forget: true');
  });

  it('recognizes the NO_MEMORIES sentinel', () => {
    const parsed = parseRawMemoryDocument('<!-- NO_MEMORIES -->');

    expect(parsed).toEqual({
      noMemories: true,
      documents: [],
    });
  });

  it('fails fast on malformed non-sentinel raw memory content', () => {
    expect(() =>
      parseRawMemoryDocument('This is not a valid raw memory document.'),
    ).toThrow(/Malformed raw memory document/);
  });

  it('fails fast when a FILE comment is not followed by a matching markdown block', () => {
    expect(() =>
      parseRawMemoryDocument('<!-- FILE: private/user-short-prs.md -->'),
    ).toThrow(/Malformed raw memory document/);
  });

  it('validates required frontmatter keys and enum values', () => {
    expect(() =>
      parseRawMemoryDocument(`<!-- FILE: private/user-short-prs.md -->
\`\`\`markdown
---
name: Missing description
type: invalid
scope: nowhere
source_session: session-003
---

Broken memory.
\`\`\`
`),
    ).toThrow(/Invalid raw memory frontmatter/);
  });

  it('rejects traversal paths in FILE comments', () => {
    expect(() =>
      parseRawMemoryDocument(`<!-- FILE: ../user-short-prs.md -->
\`\`\`markdown
---
name: User prefers short PRs
description: User usually wants small reviewable pull requests
type: user
scope: private
source_session: session-004
---

Keep PRs narrowly scoped and easy to review.
\`\`\`
`),
    ).toThrow(/Invalid raw memory file path/);
  });

  it('rejects FILE path scope mismatches with frontmatter scope', () => {
    expect(() =>
      parseRawMemoryDocument(`<!-- FILE: team/user-short-prs.md -->
\`\`\`markdown
---
name: User prefers short PRs
description: User usually wants small reviewable pull requests
type: user
scope: private
source_session: session-005
---

Keep PRs narrowly scoped and easy to review.
\`\`\`
`),
    ).toThrow(/Invalid raw memory file path/);
  });

  it('rejects malformed FILE path shapes outside scope-filename contract', () => {
    expect(() =>
      parseRawMemoryDocument(`<!-- FILE: private/preferences/user-short-prs.md -->
\`\`\`markdown
---
name: User prefers short PRs
description: User usually wants small reviewable pull requests
type: user
scope: private
source_session: session-006
---

Keep PRs narrowly scoped and easy to review.
\`\`\`
`),
    ).toThrow(/Invalid raw memory file path/);
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

    expect(index).toBe(
      '- [User prefers short PRs](user-short-prs.md) — Small, reviewable PRs are the default expectation.',
    );
    expect(index).toMatch(/^[^\n]+$/);
    expect(index).toMatch(/^- \[[^\]]+\]\([^)]+\.md\) — .+$/);
  });

  it('renders final memory documents with merged_from frontmatter', () => {
    const finalMemory = renderFinalMemoryDocument({
      filePath: 'private/user-short-prs.md',
      frontmatter: {
        name: 'User prefers short PRs',
        description: 'Canonical preference for small pull requests',
        type: 'user',
        scope: 'private',
        merged_from: ['session-001', 'session-004'],
      },
      body: 'Prefer small, reviewable pull requests by default.',
    });

    expect(finalMemory).toContain('name: User prefers short PRs');
    expect(finalMemory).toContain('merged_from: [session-001, session-004]');
    expect(finalMemory).toContain('Prefer small, reviewable pull requests by default.');
  });
});
