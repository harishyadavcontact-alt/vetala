# Critical Flows

## Evidence-to-Capture

1. Ingest evidence
2. Record extraction
3. Surface discovery
4. Review linked evidence
5. Capture discovery
6. Share capture

Failure modes:

- Duplicate evidence creates divergent truth
- Extraction payload is malformed
- Discovery ranking hides better evidence
- Capture bypasses review
- Share flow breaks after capture mutation

## Recompute Integrity

1. Load subject signals
2. Recompute scores
3. Recompute discoveries
4. Persist explanations

Failure modes:

- Score version drift
- Detector explanation missing or malformed
- Postgres adapter diverges from memory adapter
- Low-confidence discoveries bypass thresholds

## Safety Expectations

- No secrets committed
- No dependency issues above high severity
- CI failure produces a visible repair PR
- Browser workflow regressions are caught before merge
