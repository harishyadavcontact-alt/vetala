# Changelog

## Added

- repository abstraction with memory and Postgres adapters
- static frontend at `/app` with:
  - Evidence Inbox
  - Evidence Reader
  - Discovery Queue
  - Entity Profile
  - Capture Workspace
- evidence ingest endpoint with `content_hash` dedupe
- extraction creation endpoint
- extraction review endpoint with review notes and analyst state
- reviewed thesis endpoint tied to discoveries
- user action endpoint for review/capture/share events
- fragility summary fields on entity profiles:
  - `skin_in_the_game_gap`
  - `externalized_loss_risk`
  - `iatrogenic_risk`
  - `fragility_score`
  - `top_patterns`
  - `recent_evidence`
- discovery summary fields:
  - `evidence_count`
  - `best_trust_tier`
  - `reviewed_evidence_count`
  - `source_diversity_score`
  - `extraction_count`
  - `reviewed_extraction_count`
  - `challenged_extraction_count`
  - `extraction_review_ratio`
- cautious discovery framing:
  - `detector_hit`
  - `reviewed_thesis`
- reviewed thesis persistence with:
  - `thesis_statement`
  - `supporting_evidence_ids`
  - `supporting_extraction_ids`
  - `confidence_label`
  - `analyst_note`
- capture endpoint with review gating
- share token endpoint for captures
- recompute endpoint for signals, scores, and discoveries
- real detector implementations for:
  - `REVOLVING_DOOR`
  - `IATROGENIC_INTERVENTION`
  - `BAILOUT_TO_BOARDROOM`
- quality pipeline:
  - `npm run validate`
  - Playwright E2E
  - optional Postgres integration tests
  - GitHub CI, security, and repair workflows
- semantic seed subjects, institutions, and events aligned to the fragility thesis
- discovery subject labels and intervention timelines in the UI
- radar tracking for discoveries using flagged user actions
- subject and pattern leaderboards derived from current discovery severity

## Changed

- runtime data access moved from direct seed array usage to repository-backed access
- server now supports both memory-backed and Postgres-backed execution depending on `DATABASE_URL`
- UI moved from no product surface to a working single-page analyst workflow
- score and discovery payloads are now visible in the UI rather than only tested at the library layer
- extraction rows now carry mutable review metadata in both memory and Postgres repositories
- detector confidence now drops when extraction review coverage is weak
- Evidence Reader now renders all extractions and puts structured fragility assessment above raw JSON
- Entity Profile now separates reviewed theses from detector hits
- Capture Workspace now lets analysts save an explicit reviewed thesis instead of inferring it from extraction review state

## Fixed

- capture status now survives client rerender after a successful capture
- ingest form reset no longer breaks due to stale event references
- Playwright E2E now runs against a dedicated port instead of accidentally reusing unrelated services on `3000`
- Postgres discovery responses normalize numeric fields before the frontend renders them
- seed and SQL seed paths now stay aligned on extraction review metadata

## Known Gaps

- real authentication is not implemented
- detector coverage is still incomplete beyond the initial fragility-focused set
- entity timeline data is still synthetic/partial
- extraction review is still mutable row state, not an append-only review ledger
- reviewed thesis state is currently upserted, not historical
- there is no live market, alerting, or monitoring integration
- local DB validation still depends on an available `DATABASE_URL`
