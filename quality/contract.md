# Vetala Quality Contract

This repository is governed by a closed validation loop. No change is considered complete unless it passes the relevant gates below.

## Critical Invariants

- Evidence is deduped by `content_hash`.
- A discovery cannot be captured unless the user has reviewed linked evidence.
- Discovery responses must include ranked evidence and summary fields.
- Every score and discovery must expose an explanation payload.
- The Postgres adapter must preserve the same core workflow behavior as the in-memory adapter.
- Security regressions, leaked secrets, and broken CI are treated as release blockers.

## Validation Ladder

Run these in order through `npm run validate`:

1. `npm run lint`
2. `npm run test:unit`
3. `npm run build`
4. `npm run security`
5. `npm run test:e2e`
6. `npm run db:reset` + `npm run seed` + `npm run test:db` when `DATABASE_URL` is set

## Required Tests By Change Type

- Domain logic changes: update unit tests and explanation snapshots.
- API changes: update API tests and, when user-visible, E2E coverage.
- Persistence changes: update Postgres integration tests and schema reset/seed flow.
- UI workflow changes: update Playwright tests for the affected critical path.
- Security-sensitive changes: re-run security gates and document the threat surface touched.

## Release Rule

No PR should merge unless:

- CI is green
- Security workflow is green
- New behavior has tests
- Any skipped validation is explicitly documented in the PR
