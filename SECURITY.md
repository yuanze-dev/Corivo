# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please do not open a public GitHub issue.

Instead, report it privately through one of these paths:

- Open a GitHub Security Advisory draft in this repository, if available.
- If Security Advisories are not available, contact the maintainers privately before opening a public issue.

Please include:

- a clear description of the issue
- affected package(s) and version(s)
- reproduction steps or proof of concept
- potential impact
- any suggested mitigation

## Response Expectations

Corivo is a small team and response times may vary.

Our conservative target is:

- initial acknowledgement within 7 days
- status update as triage progresses
- fix and disclosure timeline based on severity and maintainability

## Disclosure

Please allow time for investigation and patching before public disclosure.

When a fix is ready, we will coordinate disclosure details and publish release notes when appropriate.

## Scope Notes

Security reports are most helpful when they focus on:

- vulnerabilities in `corivo` CLI behavior
- sync/auth behavior in `@corivo/solver`
- plugin integration points that could expose user data unexpectedly

Reports about unsupported custom forks or heavily modified local setups may be triaged as out of scope.
