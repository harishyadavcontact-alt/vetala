import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { PostgresRepository } from "../src/lib/postgres-repository.js";
import { createApp } from "../src/server.js";

const describeIfDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeIfDatabase("postgres integration", () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const repository = new PostgresRepository(pool);
  const app = createApp(repository);

  beforeAll(async () => {
    await pool.query("SELECT 1");
  });

  afterAll(async () => {
    await pool.end();
  });

  it("serves seeded evidence and discovery workflow from Postgres", async () => {
    const evidence = await request(app).get("/api/v1/evidence");
    expect(evidence.status).toBe(200);
    expect(evidence.body.length).toBeGreaterThan(0);

    const discoveries = await request(app).get("/api/v1/discoveries?status=suggested");
    expect(discoveries.status).toBe(200);
    expect(discoveries.body.length).toBeGreaterThan(0);
    expect(discoveries.body[0]).toHaveProperty("summary");
  });

  it("enforces capture gating in Postgres and allows capture after review", async () => {
    const discoveries = await request(app).get("/api/v1/discoveries?status=suggested");
    const target = discoveries.body.find((item: { summary: { reviewed_evidence_count: number } }) => item.summary.reviewed_evidence_count === 0);

    const blocked = await request(app).post(`/api/v1/discoveries/${target.id}/capture`).send({ note: "blocked" });
    expect(blocked.status).toBe(400);

    const action = await request(app).post("/api/v1/user-actions").send({
      action_type: "viewed_evidence",
      entity_type: "evidence",
      entity_id: target.evidence[0].id,
    });
    expect(action.status).toBe(201);

    const allowed = await request(app).post(`/api/v1/discoveries/${target.id}/capture`).send({ note: "allowed" });
    expect(allowed.status).toBe(201);
  });
});
