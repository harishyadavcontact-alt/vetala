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
});
