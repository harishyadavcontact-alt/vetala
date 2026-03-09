import { describe, expect, it } from "vitest";
import { createFixtureState } from "../src/lib/data.js";
import { MemoryRepository } from "../src/lib/memory-repository.js";

describe("memory repository", () => {
  it("dedupes evidence by content hash", async () => {
    const repository = new MemoryRepository(createFixtureState());
    const first = await repository.createEvidence({
      source_type: "news",
      publisher: "Publisher",
      title: "Title",
      url: "https://example.org/item",
      accessed_at: new Date().toISOString(),
      trust_tier: 2,
      content_hash: "same-hash",
      raw_storage_path: "/raw/one.html",
      extracted_text_path: "/extracted/one.txt",
      license_notes: null,
    });
    const second = await repository.createEvidence({
      source_type: "news",
      publisher: "Publisher",
      title: "Title",
      url: "https://example.org/item",
      accessed_at: new Date().toISOString(),
      trust_tier: 2,
      content_hash: "same-hash",
      raw_storage_path: "/raw/one.html",
      extracted_text_path: "/extracted/one.txt",
      license_notes: null,
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.evidence.id).toBe(first.evidence.id);
  });

  it("creates ranked discoveries with linked evidence summaries", async () => {
    const repository = new MemoryRepository(createFixtureState());
    const user = await repository.getDefaultUser();
    const discoveries = await repository.listDiscoveries(user.id, { min_confidence: 0.5 });
    expect(discoveries.length).toBeGreaterThan(0);
    expect(discoveries[0].evidence.length).toBeGreaterThan(0);
    expect(discoveries[0].summary.evidence_count).toBe(discoveries[0].evidence.length);
  });

  it("builds fragility summaries on entity profiles", async () => {
    const repository = new MemoryRepository(createFixtureState());
    const user = await repository.getDefaultUser();
    const results = await repository.search("", "people");
    const profile = await repository.getEntityProfile("person", results.people[0].id, user.id);

    expect(profile?.fragility_summary.fragility_score).toBeGreaterThanOrEqual(0);
    expect(profile?.fragility_summary.top_patterns.length).toBeGreaterThan(0);
    expect(profile?.recent_evidence.length).toBeGreaterThan(0);
  });

  it("persists extraction review metadata and returns extractions in stable order", async () => {
    const repository = new MemoryRepository(createFixtureState());
    const user = await repository.getDefaultUser();
    const evidence = await repository.listEvidence(user.id);
    const detail = await repository.getEvidenceById(evidence[0].id, user.id);
    const target = detail?.extractions.find((extraction) => extraction.review_status === "pending") ?? detail?.extractions[0];
    expect(target).toBeDefined();
    if (!target) {
      return;
    }

    await repository.reviewExtraction(target.id, {
      review_status: "reviewed",
      review_note: "Repository test review.",
      reviewed_by: user.id,
    });

    const updated = await repository.getEvidenceById(evidence[0].id, user.id);
    expect(updated?.extractions[0].id).toBe(target.id);
    expect(updated?.extractions[0]).toMatchObject({
      review_status: "reviewed",
      review_note: "Repository test review.",
      reviewed_by: user.id,
    });
  });

  it("marks discoveries as detector hits when extraction review support is weak", async () => {
    const repository = new MemoryRepository(createFixtureState());
    const user = await repository.getDefaultUser();
    const discoveries = await repository.listDiscoveries(user.id, { min_confidence: 0.5 });

    expect(discoveries.some((discovery) => discovery.review_status === "detector_hit")).toBe(true);
    expect(discoveries[0].summary).toHaveProperty("reviewed_extraction_count");
    expect(discoveries[0].summary).toHaveProperty("extraction_review_ratio");
  });

  it("saves reviewed theses separately from extraction review state", async () => {
    const state = createFixtureState();
    const repository = new MemoryRepository(state);
    const user = await repository.getDefaultUser();
    const discoveries = await repository.listDiscoveries(user.id, { status: "suggested" });
    const target = discoveries.find((discovery) => discovery.review_status === "detector_hit") ?? discoveries[0];

    const thesis = await repository.saveReviewedThesis(user.id, {
      discovery_id: target.id,
      thesis_statement: "Repository-backed thesis about asymmetric upside and delayed systemic downside.",
      supporting_evidence_ids: target.evidence.map((item) => item.id),
      supporting_extraction_ids: state.extractions
        .filter((extraction) => target.evidence.some((item) => item.id === extraction.evidence_id))
        .slice(0, 1)
        .map((extraction) => extraction.id),
      confidence_label: "watch",
      analyst_note: "Repository test thesis.",
    });

    expect(thesis.discovery_id).toBe(target.id);

    const updated = await repository.getDiscoveryById(target.id, user.id);
    expect(updated?.review_status).toBe("reviewed_thesis");
    expect(updated?.reviewed_thesis?.thesis_statement).toContain("asymmetric upside");
  });
});
