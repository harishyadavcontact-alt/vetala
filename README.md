# Vetal

Vetal is a fragility-tracking research app. It helps analysts identify fragilistas: people and institutions that internalize upside, externalize downside, and create hidden exposure to ruin.

## What is implemented

- Repository-driven API with a Postgres adapter and an in-memory adapter for tests and no-DB development.
- Evidence workflow endpoints for ingestion, extraction recording, extraction review, evidence-view actions, discovery listing, capture gating, sharing, and score recomputation.
- Structured request logging, audit logging for ingest and recompute events, and centralized error handling.
- Static web client served at `/app` with:
  - Evidence Inbox
  - Evidence Reader
  - Discovery Queue
  - Entity Profile
  - Capture Workspace
- Expanded fixtures for evidence, extractions, signals, scores, discoveries, captures, and user actions.
- Tests for scoring, repository behavior, capture gating, dedupe, sharing, and recomputation.

## What is real versus placeholder

Real now:

- working evidence-to-capture loop
- extraction review states
- reviewed thesis workflow
- cautious detector confidence
- live detector explanations
- memory and Postgres repository paths
- browser, API, and unit validation

Still placeholder:

- seed data instead of live investigative data
- synthetic parts of subject timelines
- small detector library
- lightweight identity model
- no background ingestion or alerting pipeline

## Quick Start

### Option A: no database

Use this for local evaluation and UI work.

```bash
npm install
npm run validate
npm run dev
```

App URLs:

- UI: `http://localhost:3000/app`
- API: `http://localhost:3000/api/v1`

### Option B: Postgres-backed mode

Use this for serious local development.

1. Create a Postgres database.
2. Apply [db/schema.sql](/E:/vetala/db/schema.sql).
3. Set `DATABASE_URL`.
4. Seed the demo workspace.

PowerShell example:

```powershell
$env:DATABASE_URL="postgres://postgres:postgres@localhost:5432/vetal"
Get-Content db/schema.sql | psql $env:DATABASE_URL
npm install
npm run seed
npm run validate
npm run dev
```

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

## Scripts

- `npm run dev` starts the API and UI in development mode
- `npm run build` compiles TypeScript
- `npm run start` runs the compiled server
- `npm run validate` runs the local quality ladder
- `npm run test:unit` runs scoring, repository, and API tests
- `npm run test:e2e` runs Playwright browser tests
- `npm run test:db` runs Postgres integration tests when `DATABASE_URL` is set
- `npm run seed` seeds the demo workspace
- `npm run db:reset` resets the Postgres test database

## Product Docs

- [PRODUCT_DOC.md](/E:/vetala/PRODUCT_DOC.md)
- [TECH_SPEC.md](/E:/vetala/TECH_SPEC.md)
- [CHANGELOG.md](/E:/vetala/CHANGELOG.md)
- [ROADMAP.md](/E:/vetala/ROADMAP.md)
- [NEXT_4_HOURS.md](/E:/vetala/NEXT_4_HOURS.md)

## Quality Contract

Repo-specific quality rules live in [quality/contract.md](/E:/vetala/quality/contract.md) and [quality/critical-flows.md](/E:/vetala/quality/critical-flows.md).
