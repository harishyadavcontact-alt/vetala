# Evidence To Capture Spec

## Scope

This spec describes the current end-to-end implementation of Vetala's evidence-to-capture workflow, from source ingest to capture sharing.

It is intentionally tied to the code that exists now. It does not describe future-state architecture beyond short extension notes.

## Product Intent

The workflow exists to prevent unsupported findings from becoming durable analyst output.

The product choice is explicit:

- evidence is a first-class object
- discovery is not enough on its own
- capture is a promoted state, not just a bookmark

That is why the workflow includes a hard transition:

- discovery can be viewed freely
- capture requires prior evidence review

## End-To-End Flow

### 1. Source ingest

Entry points:

- UI sidebar form in `web/index.html`
- `POST /api/v1/evidence`

Implementation:

- UI collects `title`, `publisher`, `url`, `source_type`, and `trust_tier`
- client derives:
  - `accessed_at`
  - `content_hash` from the URL via `btoa(url)`
  - storage paths for raw and extracted content
- server validates request via `createEvidenceSchema`
- repository dedupes on `content_hash`

Tradeoff:

- simple and deterministic for the current build
- too weak for production because URL-derived hashes do not represent full content identity

### 2. Evidence inbox rendering

Entry point:

- `GET /api/v1/evidence`

Rendered fields per card:

- title
- publisher
- trust tier
- reviewed or unreviewed
- extraction count
- claim count
- duplicate count

Implementation detail:

- the repository computes derived fields
- the client just renders returned values

### 3. Evidence inspection

Entry point:

- `GET /api/v1/evidence/:id`

Rendered detail:

- source metadata
- trust tier
- duplicate count
- extraction count
- reviewed state
- first extraction payload as raw JSON

Review action:

- button triggers `POST /api/v1/user-actions`
- payload:
  - `action_type: viewed_evidence`
  - `entity_type: evidence`
  - `entity_id: <evidence-id>`

Tradeoff:

- review is explicit and auditable
- UI only shows the first extraction; there is no extraction diffing or approval state

### 4. Discovery queue

Entry point:

- `GET /api/v1/discoveries?min_confidence=...`

Rendered fields:

- `pattern_label`
- `pattern_type`
- `severity_score`
- `confidence`
- `summary.evidence_count`
- `summary.best_trust_tier`
- `summary.reviewed_evidence_count`

Ranking behavior:

- list is sorted by `severity_score` descending, then `detected_at` descending
- linked evidence inside each discovery is sorted by:
  - lowest `trust_tier`
  - newest `accessed_at`
  - publisher name tie-break

Tradeoff:

- deterministic and inspectable
- no weighting for analyst intent, saved views, or recency at list level beyond the simple tie-break

### 5. Entity inspection

Entry points:

- `GET /api/v1/people/:id`
- `GET /api/v1/organizations/:id`
- `GET /api/v1/events/:id`

Rendered fields:

- subject identity
- subject type
- current scores
- one score explanation payload

Reality note:

- person profiles are the most meaningful current path
- org and event profiles exist structurally but are much thinner

### 6. Capture gating

Entry points:

- `POST /api/v1/discoveries/:id/capture`
- `POST /api/v1/captures`

Rule:

- capture is rejected unless the current user has at least one `viewed_evidence` action on one linked evidence item

Implementation:

- memory path checks `userActions`
- Postgres path computes `reviewed_evidence_count` and blocks when it is `0`

Response on failure:

- HTTP `400`
- message indicating capture is blocked until evidence is reviewed

Response on success:

- HTTP `201`
- capture with:
  - `captured_at`
  - `note`
  - `verification_level: viewed_evidence`
  - `share_token: null` initially

### 7. Share flow

Entry points:

- `GET /api/v1/me/captures`
- `POST /api/v1/captures/:id/share`

Behavior:

- client finds the latest capture for the current discovery
- share endpoint returns existing token or creates one if absent

Tradeoff:

- simple and testable
- share token has no expiry, permission model, or consumption flow yet

## Implementation Mapping

### Server

- `src/server.ts`
  - route definitions
  - user resolution
  - error mapping
  - static asset serving

### Domain logic

- `src/lib/domain.ts`
  - score construction
  - discovery construction
  - source diversity summary
  - evidence ranking

- `src/lib/scoring.ts`
  - signal weights
  - score formulas
  - Bob Rubin detector

### Persistence

- `src/lib/repository.ts`
  - runtime contract

- `src/lib/memory-repository.ts`
  - mutable seeded mode

- `src/lib/postgres-repository.ts`
  - SQL-backed mode

- `db/schema.sql`
  - durable schema

### Frontend

- `web/index.html`
  - layout and surface definitions

- `web/app.js`
  - fetch and render loop
  - state refresh after every mutation

- `web/app.css`
  - layout and density rules

## Current Placeholder Boundaries

- evidence ingestion is manual; no crawler or import pipeline exists
- extraction is write-only from the API; the UI does not create extractions
- detector coverage is mostly placeholder names plus one real detector
- the frontend is a thin operator console, not a complete product shell
- no background processing, auth, tenanting, or collaboration exists

## Test Coverage For This Flow

- `tests/api.test.ts`
  - capture gating
  - evidence dedupe
  - discovery summary fields
  - share token
  - recompute

- `tests/e2e/app.spec.ts`
  - blocked capture before review
  - review evidence
  - successful capture
  - share
  - ingest update in UI

- `tests/postgres.integration.test.ts`
  - discovery workflow against the SQL-backed adapter

## What Would Break This First

- moving capture gating into client-side checks only
- allowing discovery creation without explanation payloads
- replacing `content_hash` dedupe without updating seed, repository, and tests together
- adding new detector types without versioning or test coverage
- making UI changes that stop refreshing server state after mutation

## Near-Term Extension Path

- add extraction review status beyond raw display
- show multiple extractions and multiple explanations, not just first item
- move recompute to job execution for heavier datasets
- add richer graph traversal once entity relationships are no longer mostly seed-derived
