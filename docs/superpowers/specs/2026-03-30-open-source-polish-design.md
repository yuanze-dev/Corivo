# Corivo Open Source Polish Design

## Goal

Turn Corivo from a fast-moving personal codebase into an elegant open source project that feels credible to first-time visitors and approachable to contributors, without doing a large architectural refactor.

## Problem Statement

Corivo already has a differentiated product idea, a recognizable design direction, and substantial implementation work. The gap is presentation and trust:

- The repository's public story is stronger than its contributor experience.
- Root documentation and actual repository structure are not fully aligned.
- Some package-level entry points promised by root docs do not exist.
- The project has the ingredients of a polished open source repo, but not yet a consistently maintained surface.

This creates a sharp first impression followed by uncertainty, which is exactly where open source adoption and contribution intent drop off.

## Success Criteria

A new visitor should be able to:

1. Understand what Corivo is, who it is for, and why it is interesting within 2 minutes.
2. Understand the current supported platforms, install path, and development status without guessing.
3. Find the right package or doc entry point for development within 5 minutes.
4. Trust that the repository is actively maintained and has clear contribution boundaries.

A new contributor should be able to:

1. Clone the repo and identify the correct local dev commands quickly.
2. Understand package responsibilities and current maturity.
3. Know where to report bugs, propose features, and what kinds of contributions are welcome.

## Non-Goals

- No large code or architecture refactor.
- No redesign of the product itself.
- No new dashboard or marketing site implementation.
- No attempt to rewrite every historical release note or resolve every old version inconsistency.
- No deep package reorganization unless required to remove major confusion.

## User Segments

### 1. Curious Open Source Visitor

They arrive from GitHub, npm, a recommendation, or a social post. They need a crisp explanation, confidence signals, and an honest picture of what works today.

### 2. Potential Contributor

They are willing to read docs and run commands, but they should not have to reverse-engineer the repo layout or guess which package is authoritative.

### 3. Future Maintainer

They need repository-level conventions that reduce drift between docs and reality.

## Recommended Approach

Use an "open source polish" pass rather than either a pure README rewrite or a deep repo refactor.

This approach combines:

- public-facing clarity
- contributor-facing usability
- minimal structural corrections where trust would otherwise break

It preserves momentum while fixing the most visible seams.

## Alternatives Considered

### Option A: README-first facelift

Pros:

- Fastest visible improvement
- Best short-term optics

Cons:

- Risks overpromising if package docs and repo structure remain inconsistent

### Option B: Internal cleanup first

Pros:

- Stronger engineering foundation
- Better long-term contributor experience

Cons:

- Slower to improve first impression
- Less leverage for external adoption now

### Option C: Balanced open source polish

Pros:

- Improves first impression and contributor confidence together
- Fixes trust-breaking inconsistencies without broad refactors
- Best fit for the repository's current maturity

Cons:

- Requires more editorial judgment than a pure docs rewrite

Recommendation: Option C.

## Scope of Changes

### Repository Front Door

Improve the root repository experience so the homepage reads like a maintained open source project instead of a moving internal snapshot.

Expected work:

- Rewrite `README.md` for sharper positioning, honest support matrix, cleaner information hierarchy, and more trustworthy quick start guidance.
- Align `README.zh.md` with the same structure and maturity signals.
- Make package and plugin references match the actual repo layout.
- Tighten roadmap and beta messaging so it reflects the current state clearly.

### Contributor Experience

Add the minimum set of contributor-facing artifacts expected in a serious open source project.

Expected work:

- Refresh `CONTRIBUTING.md` so it reflects real workspace commands and repository conventions.
- Add `CODE_OF_CONDUCT.md`.
- Consider a lightweight `SECURITY.md` if the repo currently lacks a security disclosure path.
- Ensure issue templates and contribution docs feel consistent with the project's voice and boundaries.

### Repository Truthfulness

Reduce the mismatch between stated structure and actual structure.

Expected work:

- Update root docs that mention package docs or paths that do not exist.
- Add missing package-level README files where a package is a meaningful public entry point.
- Clarify support status for packages or integrations that exist in the tree but are not yet equal in maturity.

### Maintenance Signals

Strengthen the cues that tell outsiders this repo is understandable and maintainable.

Expected work:

- Normalize project references to current versioning language where necessary.
- Check for tracked editor noise or local-only repository artifacts that weaken the public surface.
- Improve top-level doc linking so readers can navigate architecture, changelog, contributing, and package docs naturally.

## Content Strategy

### Tone

The open source voice should feel calm, sharp, and trustworthy:

- warm, not hype-heavy
- ambitious, but explicit about current limitations
- opinionated, but clear about what is beta versus stable

### README Narrative Order

Recommended narrative:

1. What Corivo is
2. Why it exists
3. What works today
4. Quick start
5. How it works
6. Repository/package map
7. Privacy and local-first guarantees
8. Development and contribution entry points

### Truth-over-Gloss Rule

If a feature is experimental, macOS-only, partial, or plugin-specific, the docs should say so plainly. Elegant open source projects feel polished because they are precise, not because they sound bigger than they are.

## Information Architecture

### Root Documents

- `README.md`: external-facing canonical entry point
- `README.zh.md`: Chinese mirror of the core narrative
- `CONTRIBUTING.md`: contribution workflow and expectations
- `CODE_OF_CONDUCT.md`: community behavior standard
- `CHANGELOG.md`: release history
- `LICENSE`: licensing
- optional `SECURITY.md`: vulnerability reporting guidance

### Package Entry Points

Each meaningful package should either:

- have a README that explains its purpose and usage, or
- be intentionally treated as internal and only referenced briefly from root docs

The key principle is no implied documentation that does not exist.

## Implementation Constraints

- Follow the repository's existing design language and positioning.
- Preserve bilingual friendliness where practical.
- Avoid claiming support for paths that are not currently verified in the repo.
- Prefer documentation and metadata fixes over code movement.
- Keep the public surface elegant, but do not hide beta reality.

## Risks

### Risk: Polished docs overstate reality

Mitigation:

- Audit every key claim against the actual repo structure and scripts before publishing changes.

### Risk: Cleanup expands into refactor work

Mitigation:

- Constrain this pass to repository presentation, contributor UX, and small consistency fixes.

### Risk: Bilingual docs drift again

Mitigation:

- Mirror structure across English and Chinese README files so future updates are easier to keep in sync.

## Deliverables

- Refreshed root `README.md`
- Refreshed root `README.zh.md`
- Updated `CONTRIBUTING.md`
- New `CODE_OF_CONDUCT.md`
- Optional `SECURITY.md` if the repo needs a clear reporting path
- Added or refreshed package READMEs for public-facing packages
- Small documentation consistency fixes elsewhere as needed

## Acceptance Check

This design is successful if, after the pass:

- the root docs no longer reference missing package docs as primary entry points
- an outsider can tell which packages matter and what each one does
- the project reads as intentional, calm, and credible
- contributors can start without guessing the workflow
- the repository feels more elegant without pretending to be more mature than it is
