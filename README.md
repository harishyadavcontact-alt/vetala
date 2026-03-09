# Vetala

Vetala is an evidence-first research workstation for power users. The app turns raw sources into explainable discoveries, gated captures, and reusable dossiers.

## What is implemented

- Repository-driven API with a Postgres adapter and an in-memory adapter for tests and no-DB development.
- Evidence workflow endpoints for ingestion, extraction recording, review actions, discovery listing, capture gating, sharing, and score recomputation.
- Structured request logging, audit logging for ingest and recompute events, and centralized error handling.
- Static web client served at `/app` with:
  - Evidence Inbox
  - Evidence Reader
  - Discovery Queue
  - Entity Profile
  - Capture Workspace
- Expanded fixtures for evidence, extractions, signals, scores, discoveries, captures, and user actions.
- Tests for scoring, repository behavior, capture gating, dedupe, sharing, and recomputation.

## Run

```bash
npm install
npm run test
npm run dev
```

App URLs:

- UI: `http://localhost:3000/app`
- API: `http://localhost:3000/api/v1`

## Validation

```bash
npm run validate
```

This runs the local quality ladder:

- typecheck
- unit and API tests
- build
- high-severity dependency audit
- Playwright E2E
- Postgres integration tests when `DATABASE_URL` is set

One-time browser setup for local E2E:

```bash
npm run playwright:install
```

## Persistence

- If `DATABASE_URL` is set, the server uses Postgres through `pg`.
- If `DATABASE_URL` is not set, the server uses the in-memory fixture repository.

Apply the schema from [db/schema.sql](/E:/vetala/db/schema.sql) before using Postgres.

## Seed

```bash
npm run seed
```

- Without `DATABASE_URL`, this prints fixture counts.
- With `DATABASE_URL`, it inserts the demo workspace into Postgres.

## Quality Contract

Repo-specific quality rules live in [quality/contract.md](/E:/vetala/quality/contract.md) and [quality/critical-flows.md](/E:/vetala/quality/critical-flows.md).
