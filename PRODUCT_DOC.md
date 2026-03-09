# Product Doc

## Feature / Module Name

Vetala Evidence-to-Capture Workflow

## One-Line Definition

An evidence-first research workflow that turns source records into explainable discoveries and blocks capture until a user has reviewed the linked evidence.

## Problem Solved

Analytical tools often let users jump from a claim to a saved insight without forcing a source check. That creates two failure modes:

- weak findings get promoted into durable records
- later reviewers cannot tell whether a conclusion was source-grounded or just asserted

Vetala addresses that by making evidence, extraction, discovery, and capture separate states with an explicit review gate between discovery and capture.

## Why It Matters

Vetala only makes sense if it helps users identify people and trades with hidden downside transfer. The point is not generic investigation. The point is to surface fragilistas: actors who benefit from small visible upside while pushing rare, severe, or delayed losses onto others.

In that frame, the current evidence-review and capture-gating model matters because it forces the user to distinguish between:

- a strong narrative
- a source-backed fragility thesis

That distinction is the difference between gossip about elites and a usable fragility radar.

## Core User Outcomes

- Add a source record with enough metadata to track provenance.
- See whether a source has extraction data, duplicates, and prior discovery links.
- Review a discovery with ranked evidence and explanation payloads.
- Open an entity profile and inspect scores tied to that subject.
- Capture a discovery into a dossier only after at least one linked evidence item has been reviewed.
- Generate a share token for an existing capture.

## UI / UX Behavior

Current UI is a single static web client served at `/app`.

Primary surfaces:

- Evidence Inbox
  - lists evidence cards with trust tier, review state, extraction count, claim count, and duplicate count
  - supports manual ingest through the sidebar form
- Discovery Queue
  - lists ranked discoveries with severity, confidence, evidence count, best trust tier, and reviewed evidence count
  - supports a min-confidence slider filter
- Evidence Reader
  - shows source metadata and the first extraction payload
  - exposes `Mark reviewed`
- Entity Profile
  - shows subject identity, fragility summary metrics, top detector patterns, recent evidence, and full score payloads
- Capture Workspace
  - shows discovery details and explanation JSON
  - allows capture and share after selection

Interaction model:

- clicking an evidence card loads detail inline; there is no route change
- clicking a discovery card loads both the capture workspace and the related entity profile
- ingest, review, capture, and share all mutate state through API calls and then refresh client state

## States And Flows

### Evidence lifecycle

1. User submits the ingest form or calls `POST /api/v1/evidence`
2. Server dedupes on `content_hash`
3. Evidence appears in the inbox with duplicate and extraction metadata

Evidence states visible in UI:

- unreviewed
- reviewed
- duplicate count `0+`
- extraction count `0+`

### Discovery lifecycle

1. Discovery exists in seed data or is produced by `POST /api/v1/signals/recompute`
2. Discovery is listed with ranked evidence summary
3. User opens the discovery in the queue
4. User reviews at least one linked evidence item
5. User captures the discovery through `POST /api/v1/discoveries/:id/capture`
6. User may generate a share token through `POST /api/v1/captures/:id/share`

Discovery states currently implemented:

- `suggested`
- `captured`
- `dismissed`
- `flagged_for_review`

Only `suggested` and `captured` are meaningfully exercised in the current UI and tests.

### Failure states

- duplicate evidence returns existing evidence instead of creating a new row
- capture attempt without reviewed evidence returns `400`
- invalid payloads fail Zod validation
- unknown entities return `404`
- UI currently surfaces errors as plain text messages, not dedicated error views

## Design Principles Applied

- Evidence before conclusion
  - capture is blocked until evidence review is recorded
- Explainability over opaque scoring
  - scores and discoveries expose explanation payloads
- Dense analyst workflow over marketing UI
  - the UI is card-heavy and information-dense rather than route-heavy
- Deterministic ranking over hidden heuristics
  - evidence is sorted by trust tier, then recency, then publisher tie-break
- Development pragmatism
  - the app runs with an in-memory repository when `DATABASE_URL` is absent

## Acceptance Criteria

- A user can create evidence through the UI and `POST /api/v1/evidence`.
- Evidence creation is idempotent by `content_hash`.
- A user can view evidence detail and mark an evidence item reviewed.
- Discovery list responses include `summary.evidence_count`, `summary.best_trust_tier`, `summary.reviewed_evidence_count`, and `summary.source_diversity_score`.
- A user cannot capture a discovery unless at least one linked evidence item has been reviewed by that user.
- A successful capture returns a persisted capture record with `verification_level: viewed_evidence`.
- A user can request a share token for a capture.
- Entity profile responses include subject info and score payloads.
- Entity profiles expose `fragility_summary` and `recent_evidence`.
- `npm run validate` passes for the non-DB path.

## Known Limitations

- There is no real auth flow. User resolution is `x-user-id` or first user in the repository.
- The frontend is plain JavaScript with in-memory page state. There is no route-level state, undo, or offline behavior.
- The UI shows the first extraction's fragility assessment and dumps the full score array as JSON.
- Search is basic text matching, not full investigative search.
- There is no background processing. Recompute runs inline in the request cycle.
- Real detector logic now exists for `BOB_RUBIN_TRADE`, `REVOLVING_DOOR`, `IATROGENIC_INTERVENTION`, and `BAILOUT_TO_BOARDROOM`.
- `COMPLEXITY_ARBITRAGE` and `POSTDICTING_STIGLITZ` still exist only as type/seed placeholders.
- In-memory mode is useful for dev and tests, not as production storage.
- There is no integration with any larger platform. Vetala stands alone in this repo.

## Next Extensions

- Real auth and workspace ownership
- asynchronous extraction and recompute jobs
- more detectors beyond `BOB_RUBIN_TRADE`
- richer entity timelines instead of current placeholder event lists
- saved filters and analyst views
- explicit extraction review UI instead of raw JSON dumps
- export formats beyond share token generation
- notification and watchlist mechanics for fragilistas and Rubin-trade candidates

## Reality Check

### What exists now

- Express API with repository abstraction
- Postgres adapter and in-memory adapter
- static web client at `/app`
- evidence ingest, extraction creation, review action, discovery listing, capture gating, share, and recompute
- unit, API, browser E2E, and optional Postgres integration tests

### What is still placeholder

- seed data stands in for real investigative content
- entity profiles are partial and rely on seeded scores and synthetic timelines
- multiple detectors exist, but the pattern library is still small
- extraction review is raw JSON, not a curated analyst UI
- there is no live market, alerting, or monitoring integration yet

### What must come later

- production auth and authorization
- ingestion pipelines beyond manual POSTs
- background jobs and operational controls
- richer graph navigation and cross-entity reasoning
- stronger export, collaboration, and publication flows
