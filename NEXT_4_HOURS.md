# Next 4 Hours

## Goal

Use the next build window to turn the current fragility radar into a more usable subject-analysis product without widening scope.

## Current Constraint

The app is now coherent, but three things are still thin:

- subject pages still rely on synthetic timeline and summary composition
- install/run docs are workable for developers but not yet robust for first-time operators
- detector fixtures are still too light for a growing detector library

## Work Plan

### 1. Make reviewed thesis explicit

Status:
- completed

Delivered:
- reviewed-thesis record separated from extraction review
- discovery-level thesis save API
- analyst thesis form in the capture workspace
- subject profile thesis ledger

Follow-up:
- convert reviewed theses from mutable upsert state into append-only history

### 2. Improve subject pages

Implement:
- a dedicated "upside captured / downside externalized / intervention record" section
- better ordering of evidence and discoveries
- hide raw score JSON behind an expandable inspector

Why now:
- the subject page should answer the core thesis faster than the current mixed-detail layout

Acceptance:
- a user can open a subject and immediately understand why Vetal thinks the subject is fragile

### 3. Tighten install and operator path

Implement:
- clearer `README.md`
- Postgres bootstrap instructions
- one documented local no-DB mode
- one documented serious mode with Postgres

Why now:
- the app is only expeditious if new users can run it in minutes without repo archaeology

Acceptance:
- a technical user can install, seed, validate, and run the app from docs alone

### 4. Strengthen detector fixtures

Implement:
- named regression fixtures for each detector
- one negative fixture per detector
- stable explanation assertions

Why now:
- detector drift will become the highest hidden risk as the library grows

Acceptance:
- every real detector has a positive and negative regression test

## Commit Rhythm

Target commits:

1. `feat: add reviewed thesis model`
2. `feat: improve subject fragility pages`
3. `docs: tighten install and operator runbook`
4. `test: add detector regression fixtures`

Rule:
- commit only after `npm run validate` is green for the changed slice

## Out Of Scope For This Window

- new leaderboard mechanics
- collaboration
- auth build
- deployment platform work
- trade recommendation features
