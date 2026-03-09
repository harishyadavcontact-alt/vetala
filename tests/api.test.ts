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

  it("tracks discoveries on the radar and returns leaderboards", async () => {
    const list = await request(app).get("/api/v1/discoveries?status=suggested");
    const discovery = list.body[0];

    const flag = await request(app).post("/api/v1/user-actions").send({
      action_type: "flagged",
      entity_type: "discovery",
      entity_id: discovery.id,
    });
    expect(flag.status).toBe(201);

    const watchlist = await request(app).get("/api/v1/watchlist");
    expect(watchlist.status).toBe(200);
    expect(watchlist.body.some((item: { id: string }) => item.id === discovery.id)).toBe(true);

    const leaderboards = await request(app).get("/api/v1/leaderboards");
    expect(leaderboards.status).toBe(200);
    expect(Array.isArray(leaderboards.body.subjects)).toBe(true);
    expect(Array.isArray(leaderboards.body.patterns)).toBe(true);
    expect(leaderboards.body.subjects.length).toBeGreaterThan(0);
  });

  it("reviews an extraction and returns review metadata on evidence detail", async () => {
    const evidence = await request(app).get("/api/v1/evidence");
    const detail = await request(app).get(`/api/v1/evidence/${evidence.body[0].id}`);
    const target = detail.body.extractions.find((extraction: { review_status: string }) => extraction.review_status === "pending") ?? detail.body.extractions[0];

    const review = await request(app).post(`/api/v1/extractions/${target.id}/review`).send({
      review_status: "reviewed",
      review_note: "API test review.",
    });
    expect(review.status).toBe(200);
    expect(review.body.review_status).toBe("reviewed");

    const updated = await request(app).get(`/api/v1/evidence/${evidence.body[0].id}`);
    expect(updated.body.extractions.some((extraction: { id: string; review_status: string; review_note: string }) => extraction.id === target.id && extraction.review_status === "reviewed" && extraction.review_note === "API test review.")).toBe(true);
  });

  it("exposes cautious discovery framing when extraction review is weak", async () => {
    const response = await request(app).get("/api/v1/discoveries?min_confidence=0.5");
    expect(response.status).toBe(200);
    expect(response.body[0]).toHaveProperty("review_status");
    expect(response.body[0].summary).toMatchObject({
      extraction_count: expect.any(Number),
      reviewed_extraction_count: expect.any(Number),
      extraction_review_ratio: expect.any(Number),
    });
  });

  it("saves a reviewed thesis and returns it on discovery and subject profile", async () => {
    const discoveries = await request(app).get("/api/v1/discoveries?status=suggested");
    const target = discoveries.body.find((item: { evidence: Array<{ id: string }> }) => item.evidence.length > 0);
    const evidenceDetail = await request(app).get(`/api/v1/evidence/${target.evidence[0].id}`);
    const extractionId = evidenceDetail.body.extractions[0].id;

    const save = await request(app).post(`/api/v1/discoveries/${target.id}/reviewed-thesis`).send({
      thesis_statement: "The subject repeatedly captures upside while public downside accumulates off balance sheet.",
      supporting_evidence_ids: target.evidence.map((item: { id: string }) => item.id),
      supporting_extraction_ids: [extractionId],
      confidence_label: "conviction",
      analyst_note: "API thesis save test.",
    });
    expect(save.status).toBe(201);

    const updatedDiscovery = await request(app).get(`/api/v1/discoveries/${target.id}`);
    expect(updatedDiscovery.body.review_status).toBe("reviewed_thesis");
    expect(updatedDiscovery.body.reviewed_thesis).toMatchObject({
      thesis_statement: "The subject repeatedly captures upside while public downside accumulates off balance sheet.",
      confidence_label: "conviction",
    });

    const profile = await request(app).get(`/api/v1/people/${target.subject_id}`);
    expect(profile.body.reviewed_theses.some((thesis: { discovery_id: string }) => thesis.discovery_id === target.id)).toBe(true);
  });
});
