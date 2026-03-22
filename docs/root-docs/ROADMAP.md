# Vetal Roadmap

## Product Thesis

Vetal exists to identify fragilistas: decision-makers and institutions that privatize upside, socialize downside, suppress visible volatility, and expose others to ruin.

The product is not a general intelligence workbench. It is a fragility-tracking system built around five questions:

- who captures the upside?
- who absorbs the downside?
- what intervention or structure hides convex loss?
- which person or institution is responsible?
- what evidence is strong enough to move a detector hit into a reviewed thesis?

## Two-Year Direction

### Year 1: Earn credibility

Goal:
- make Vetal useful for a serious solo analyst on one narrow loop

Ship in this order:
- stable ingestion, review, detector, capture workflow
- richer fragility-specific extraction schema
- reviewed-thesis model beyond mutable extraction review state
- subject timelines that show intervention, insulation, bailout, and failure sequences
- detector family focused on asymmetric downside transfer
- watchlists and alerts for recurring fragility subjects
- production-ready install/run path with Postgres as the default serious mode

Success condition:
- a user can run Vetal, ingest evidence, review extractions, inspect detector reasoning, and maintain a live radar of fragility subjects without touching raw code

### Year 2: Build compounding edge

Goal:
- turn Vetal from a research tool into an evidence network with durable information advantage

Ship in this order:
- append-only review and thesis history
- provenance graph across people, institutions, events, and recurring mechanisms
- stronger detector library:
  - fragilista
  - Rubin Trade
  - revolving door
  - iatrogenic intervention
  - bailout to boardroom
  - volatility suppression
  - hidden leverage
  - open secret clustering
- recurring recompute and alerting
- exportable dossiers and machine-readable feeds
- cross-subject ranking and monthly regime summaries

Success condition:
- Vetal becomes the place where fragility evidence compounds faster than public memory fades

## Strategic Principles

- Narrow before broad
  - own fragilista detection before adding adjacent intelligence features
- Evidence before branding
  - leaderboards and alerts only matter if the review layer is real
- Analysts need proof, not vibes
  - every high-conviction claim must point back to specific signals and evidence
- Strong left-tail discipline
  - avoid false confidence, silent detector drift, and weak provenance
- Expedite on the right tail
  - once a loop is defensible, automate the repetitive parts aggressively

## Product Tracks

### Track 1: Truth Layer

Build:
- append-only extraction reviews
- review history with analyst identity and timestamps
- reviewed-thesis records separate from raw extractions
- stronger provenance and source-link auditability

This matters because:
- the product fails if users cannot tell what is merely detected versus what has been reviewed

### Track 2: Detector Engine

Build:
- a canonical detector contract
- versioned thresholds
- explanation payloads that expose signal, evidence, and cap logic
- regression fixtures for every detector

This matters because:
- detector credibility is the core moat, not CRUD

### Track 3: Subject Intelligence

Build:
- person-centric and institution-centric pages
- intervention timelines
- role history
- upside/downside maps
- open-secret summaries

This matters because:
- Vetal should answer "why is this subject dangerous?" in one screen

### Track 4: Radar And Monitoring

Build:
- watchlists
- recurring recompute
- review-aware alerts
- weekly and monthly ranking views

This matters because:
- fragility signals matter most when they recur before rupture

### Track 5: Operating System

Build:
- one-command validation
- Postgres-backed test path
- deploy/run docs
- repair workflow
- release discipline on `main`

This matters because:
- the repo must stay shippable while the detector surface grows

## Decisions Already Made

- Single-user power-user workflow first
- Desktop web first
- Postgres as the serious persistence path
- In-memory mode remains for demo and tests
- Capture still requires viewed evidence today
- Extraction review affects confidence framing today
- Trade execution is out of scope

## Major Risks

- detector sprawl without evidence depth
- leaderboard mechanics outrunning review discipline
- mutable review state becoming too weak for audit needs
- placeholder seed world being mistaken for production capability
- confidence numbers being treated as investable certainty

## What Not To Build Yet

- collaboration
- comments
- social distribution
- prediction markets
- trade recommendation language
- mobile app

## Installation Standard

Short term:
- support `npm install`, `npm run validate`, `npm run dev`

Serious usage:
- support Postgres with schema applied from `db/schema.sql`
- support seeded demo workspace through `npm run seed`

Longer term:
- package a Docker path and a production runbook
