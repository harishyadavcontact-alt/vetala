import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createFixtureState } from "../src/lib/data.js";
import { MemoryRepository } from "../src/lib/memory-repository.js";
import { createApp } from "../src/server.js";

describe("workflow api", () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp(new MemoryRepository(createFixtureState()));
  });

  it("blocks capture until evidence is reviewed", async () => {
    const list = await request(app).get("/api/v1/discoveries?status=suggested");
    const discovery = list.body.find((item: { summary: { reviewed_evidence_count: number } }) => item.summary.reviewed_evidence_count === 0);

    const blocked = await request(app).post(`/api/v1/discoveries/${discovery.id}/capture`).send({ note: "premature" });
    expect(blocked.status).toBe(400);

    await request(app).post("/api/v1/user-actions").send({
      action_type: "viewed_evidence",
      entity_type: "evidence",
      entity_id: discovery.evidence[0].id,
    });

    const allowed = await request(app).post(`/api/v1/discoveries/${discovery.id}/capture`).send({ note: "ready" });
    expect(allowed.status).toBe(201);
    expect(allowed.body.verification_level).toBe("viewed_evidence");
  });

  it("dedupes evidence by content hash", async () => {
    const payload = {
      source_type: "news",
      publisher: "Test Publisher",
      title: "Repeatable evidence",
      url: "https://example.org/test-evidence",
      accessed_at: new Date().toISOString(),
      trust_tier: 2,
      content_hash: "fixed-hash",
      raw_storage_path: "/raw/test-evidence.html",
      extracted_text_path: "/extracted/test-evidence.txt",
      license_notes: null,
    };

    const first = await request(app).post("/api/v1/evidence").send(payload);
    const second = await request(app).post("/api/v1/evidence").send(payload);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.created).toBe(false);
    expect(second.body.evidence.id).toBe(first.body.evidence.id);
  });

  it("filters discoveries by min confidence and exposes summary fields", async () => {
    const response = await request(app).get("/api/v1/discoveries?min_confidence=0.7");
    expect(response.status).toBe(200);
    expect(response.body.length).toBeGreaterThan(0);
    expect(response.body.every((item: { confidence: number }) => item.confidence >= 0.7)).toBe(true);
    expect(response.body[0].summary).toMatchObject({
      evidence_count: expect.any(Number),
      reviewed_evidence_count: expect.any(Number),
      source_diversity_score: expect.any(Number),
    });
  });

  it("shares a capture with a stable token", async () => {
    const captures = await request(app).get("/api/v1/me/captures");
    const target = captures.body[0];

    const response = await request(app).post(`/api/v1/captures/${target.id}/share`);
    expect(response.status).toBe(200);
    expect(response.body.share_token).toBeTruthy();
  });

  it("recomputes signals for a subject and returns score and discovery payloads", async () => {
    const people = await request(app).get("/api/v1/search?q=&type=people");
    const subjectId = people.body.people[0].id;

    const response = await request(app).post("/api/v1/signals/recompute").send({
      subject_type: "person",
      subject_id: subjectId,
    });

    expect(response.status).toBe(200);
    expect(response.body.scores.length).toBe(5);
    expect(response.body).toHaveProperty("signals");
    expect(Array.isArray(response.body.discoveries)).toBe(true);
    expect(response.body.discoveries.length).toBeGreaterThan(1);
  });

  it("returns fragility summaries on entity profiles", async () => {
    const people = await request(app).get("/api/v1/search?q=&type=people");
    const subjectId = people.body.people[0].id;

    const response = await request(app).get(`/api/v1/people/${subjectId}`);

    expect(response.status).toBe(200);
    expect(response.body.fragility_summary).toMatchObject({
      skin_in_the_game_gap: expect.any(Number),
      externalized_loss_risk: expect.any(Number),
      iatrogenic_risk: expect.any(Number),
      fragility_score: expect.any(Number),
      thesis: expect.any(String),
    });
    expect(Array.isArray(response.body.recent_evidence)).toBe(true);
  });
});
