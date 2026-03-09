import { Pool } from "pg";
import { MemoryRepository } from "./memory-repository.js";
import { PostgresRepository } from "./postgres-repository.js";
import type { MemoryState } from "./memory-repository.js";
import type { Repository } from "./repository.js";
import { captures, demoUser, discoveries, events, evidence, extractions, organizations, people, scores, signals, userActions, users } from "./seed.js";

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function createFixtureState(): MemoryState {
  return {
    users: clone(users),
    people: clone(people),
    organizations: clone(organizations),
    events: clone(events),
    evidence: clone(evidence),
    extractions: clone(extractions),
    signals: clone(signals),
    scores: clone(scores),
    discoveries: clone(discoveries),
    captures: clone(captures),
    userActions: clone(userActions),
  };
}

export function createRepository(): Repository {
  if (process.env.DATABASE_URL) {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    return new PostgresRepository(pool);
  }

  return new MemoryRepository(createFixtureState());
}

export { demoUser };
