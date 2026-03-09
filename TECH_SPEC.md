# Tech Spec

## Architecture Context

Vetala is a single-process Node/TypeScript application with:

- Express HTTP server in `src/server.ts`
- repository abstraction in `src/lib/repository.ts`
- two repository implementations:
  - `src/lib/memory-repository.ts`
  - `src/lib/postgres-repository.ts`
- static frontend assets in `web/`
- Postgres schema in `db/schema.sql`

Repository selection is runtime-configured:

- if `DATABASE_URL` is set, `src/lib/data.ts` creates `PostgresRepository`
- otherwise it creates `MemoryRepository` seeded from `src/lib/seed.ts`

This is a deliberate tradeoff:

- good for local development and tests
- not enough for production correctness unless Postgres is used

## Impacted Services / Modules / Files

Core server and composition:

- `src/server.ts`
- `src/lib/data.ts`
- `src/lib/http.ts`

Domain and repository logic:

- `src/lib/repository.ts`
- `src/lib/memory-repository.ts`
- `src/lib/postgres-repository.ts`
- `src/lib/domain.ts`
- `src/lib/types.ts`
- `src/lib/scoring.ts`
- `src/lib/schemas.ts`

Seed and database:

- `src/lib/seed.ts`
- `db/schema.sql`
- `scripts/db-reset.ts`
- `scripts/seed.ts`

Frontend:

- `web/index.html`
- `web/app.js`
- `web/app.css`

Tests and validation:

- `tests/scoring.test.ts`
- `tests/repository.test.ts`
- `tests/api.test.ts`
- `tests/postgres.integration.test.ts`
- `tests/e2e/app.spec.ts`
- `playwright.config.ts`
- `scripts/validate.ts`

## Data Model

Primary domain types are defined in `src/lib/types.ts`.

### Evidence

Fields:

- `id`
- `source_type`
- `publisher`
- `title`
- `url`
- `accessed_at`
- `trust_tier`
- `content_hash`
- `raw_storage_path`
- `extracted_text_path`
- `license_notes`

Derived UI/API fields:

- `reviewed`
- `duplicate_count`
- `extraction_count`
- `claim_count`

### Extraction

Fields:

- `evidence_id`
- `extractor_version`
- `model_name`
- `schema_version`
- `json_output`
- `confidence`

`json_output` is validated against `extractionOutputSchema` in `src/lib/schemas.ts`.

### Signal

Signals are subject-scoped facts that feed the scoring and detection logic.

Fields:

- `subject_type`
- `subject_id`
- `signal_type`
- `value_numeric`
- `value_text`
- `evidence_id`

### Score

Fields:

- `score_type`: `SITG | ELI | FCS | II | FS`
- `score_value`
- `score_version`
- `explanation_json`

### Discovery

Fields:

- `pattern_type`
- `pattern_label`
- `severity_score`
- `confidence`
- `status`
- `evidence_ids`
- `detector_version`

Derived summary fields on ranked responses:

- `evidence_count`
- `best_trust_tier`
- `reviewed_evidence_count`
- `source_diversity_score`

### Capture

Fields:

- `discovery_id`
- `captured_at`
- `note`
- `verification_level`
- `share_token`

### UserAction

Current action types:

- `viewed_evidence`
- `captured`
- `shared`
- `flagged`

Current entity types:

- `evidence`
- `discovery`
- `capture`

## API Contracts

All routes live under `/api/v1`.

### Search

- `GET /search?q=&type=`
- `type`: `all | people | orgs | events`
- returns `SearchResults`

### Evidence

- `GET /evidence`
  - optional query: `reviewed=true|false`
  - returns `EvidenceListItem[]`

- `POST /evidence`
  - body validated by `createEvidenceSchema`
  - returns `{ created: boolean, evidence: Evidence }`
  - dedupes on `content_hash`

- `GET /evidence/:id`
  - returns `EvidenceDetail`

### Extractions

- `POST /extractions`
  - body validated by `createExtractionSchema`
  - returns `Extraction`

### User Actions

- `POST /user-actions`
  - body validated by `createUserActionSchema`
  - current UI uses this for `viewed_evidence`

### Discoveries

- `GET /discoveries`
  - filters:
    - `subject_type`
    - `subject_id`
    - `status`
    - `min_confidence`
  - returns `RankedDiscovery[]`

- `GET /discoveries/:id`
  - returns `RankedDiscovery`

- `GET /discoveries/:id/explanation`
  - returns `discovery.explanation_json`

- `POST /discoveries/:id/capture`
  - body: `{ note?: string | null }`
  - returns `Capture`
  - fails with `400` if no linked evidence has been reviewed by the current user

### Captures

- `POST /captures`
  - legacy/general capture route
  - body validated by `createCaptureSchema`

- `GET /me/captures`
  - returns current user captures

- `POST /captures/:id/share`
  - returns `Capture` with `share_token`

### Subject Profiles And Scores

- `GET /people/:id`
- `GET /organizations/:id`
- `GET /events/:id`
  - all return `EntityProfile`

- `GET /scores/:subjectType/:subjectId`
  - returns `Score[]`

### Recompute

- `POST /signals/recompute`
  - body validated by `recomputeSignalsSchema`
  - returns:
    - `signals`
    - `scores`
    - `discoveries`

## Scoring Or Simulation Logic

Scoring is deterministic. It lives in `src/lib/scoring.ts` and `src/lib/domain.ts`.

Implemented score families:

- `SITG`
- `ELI`
- `FCS`
- `II`
- `FS`

Mechanics:

- `computeScoreFromSignals` applies fixed weights to allowed signal types per score family
- values are clamped to `0..100`
- `FS` is a weighted composite:
  - `0.3 * SITG`
  - `0.3 * ELI`
  - `0.25 * FCS`
  - `0.15 * II`
  - optional persistence bonus capped at `10`

Implemented detector:

- `detectBobRubinTrade`

Thresholds:

- `authority_level_proxy >= 0.7`
- `externalized_loss_proxy >= 0.6`
- `sitg_gap_proxy >= 0.6`
- at least one evidence item with `trust_tier <= 2`
- at least two evidence IDs

Confidence is the minimum of:

- `avg_extraction_confidence`
- `source_diversity_score`
- `evidence_quality_score`

Reality constraint:

- only `BOB_RUBIN_TRADE` has implemented detection logic
- other pattern names are type-level placeholders and seed labels

## Rendering Logic

Rendering is plain DOM mutation in `web/app.js`.

Client state:

- `state.evidence`
- `state.discoveries`
- `state.selectedEvidenceId`
- `state.selectedDiscoveryId`

Key rendering functions:

- `renderEvidenceList()`
- `renderDiscoveryList()`
- `loadEvidenceDetail(id)`
- `loadEntityProfile(subjectType, subjectId)`
- `loadCaptureWorkspace(id, statusMessage?)`
- `loadAll()`

Important implications:

- there is no client router
- there is no normalized cache
- reload behavior is fetch-and-rerender
- user feedback is inline text, not toast/notification infrastructure

## State Management Implications

- state is page-local and transient
- after each mutation, the UI refreshes from the server instead of patching client state deeply
- this keeps the client simple but causes extra round-trips and rerenders
- selection state is kept only by local IDs and is not URL-addressable

## Caching / Persistence Implications

Persistence:

- Postgres is the only durable store
- memory mode is seeded and mutable for a single process lifetime

Caching:

- no explicit HTTP caching
- no client-side cache other than current in-memory arrays
- no job queue or recompute cache

Operational consequence:

- current recompute path is synchronous and suitable for small datasets only

## Testing Strategy

Unit and contract tests:

- `tests/scoring.test.ts`
- `tests/repository.test.ts`
- `tests/api.test.ts`

Browser E2E:

- `tests/e2e/app.spec.ts`
- covers:
  - ingest evidence
  - blocked capture before review
  - review evidence
  - successful capture
  - share token generation

Postgres integration:

- `tests/postgres.integration.test.ts`
- runs only when `DATABASE_URL` is present

Validation entrypoint:

- `npm run validate`

Validation order:

1. `lint`
2. `test:unit`
3. `build`
4. `security`
5. `test:e2e`
6. `db:reset + seed + test:db` when `DATABASE_URL` exists

## Open Questions

- What should Dimentria-level identity and authorization look like beyond `x-user-id`?
- Should evidence review require all linked evidence or only one linked evidence before capture?
- Should recompute replace prior discoveries or version them historically?
- How should extraction review evolve beyond raw JSON display?
- Which of the placeholder pattern types are intended to become real detectors next?
- Should source diversity remain a simple unique-publisher ratio or become a stronger provenance metric?
- Is in-memory mode meant to survive long-term as a demo mode, or should it become test-only?
