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
- user action endpoint for review/capture/share events
- discovery summary fields:
  - `evidence_count`
  - `best_trust_tier`
  - `reviewed_evidence_count`
  - `source_diversity_score`
- capture endpoint with review gating
- share token endpoint for captures
- recompute endpoint for signals, scores, and discoveries
- quality pipeline:
  - `npm run validate`
  - Playwright E2E
  - optional Postgres integration tests
  - GitHub CI, security, and repair workflows

## Changed

- runtime data access moved from direct seed array usage to repository-backed access
- server now supports both memory-backed and Postgres-backed execution depending on `DATABASE_URL`
- UI moved from no product surface to a working single-page analyst workflow
- score and discovery payloads are now visible in the UI rather than only tested at the library layer

## Fixed

- capture status now survives client rerender after a successful capture
- ingest form reset no longer breaks due to stale event references
- Playwright E2E now runs against a dedicated port instead of accidentally reusing unrelated services on `3000`
- Postgres discovery responses normalize numeric fields before the frontend renders them

## Known Gaps

- real authentication is not implemented
- only one detector, `BOB_RUBIN_TRADE`, has real logic
- entity timeline data is still synthetic/partial
- extraction review is raw JSON, not a structured analyst review surface
- Dimentria integration is not present
- local DB validation still depends on an available `DATABASE_URL`
