import { describe, expect, it } from "vitest";
import { computeFs, computeScoreFromSignals, detectBailoutToBoardroom, detectBobRubinTrade, detectIatrogenicIntervention, detectRevolvingDoor } from "../src/lib/scoring.js";

describe("scoring", () => {
  it("computes SITG score deterministically", () => {
    const score = computeScoreFromSignals("SITG", [
      { signal_type: "insulated_role", value_numeric: 1 },
      { signal_type: "authority_level_high", value_numeric: 1 },
      { signal_type: "personal_exposure_present", value_numeric: 1 },
    ]);
    expect(score).toBe(20);
  });

  it("computes FS composite with persistence bonus", () => {
    expect(computeFs(80, 70, 60, 40, 10)).toBe(76);
  });

  it("detects Bob Rubin trade with required thresholds and source tier", () => {
    const result = detectBobRubinTrade({
      authority_level_proxy: 0.75,
      externalized_loss_proxy: 0.9,
      sitg_gap_proxy: 0.7,
      persistence_proxy: 0.5,
      evidence_tiers: [2, 3],
      evidence_ids: ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"],
      reviewed_evidence_ids: ["00000000-0000-4000-8000-000000000001"],
      challenged_evidence_ids: [],
      signal_inputs: [{ signal_type: "authority_level_high", value_numeric: 0.75 }],
      avg_extraction_confidence: 0.9,
      source_diversity_score: 0.8,
      evidence_quality_score: 0.7,
      reviewed_extraction_ratio: 1,
    });

    expect(result?.pattern_type).toBe("BOB_RUBIN_TRADE");
    expect(result?.severity_score).toBeGreaterThan(0);
    expect(result?.confidence).toBe(0.7);
    expect(result?.explanation_json.confidence_calc).toMatchObject({
      capped_by: 1,
    });
  });

  it("detects revolving door patterns", () => {
    const result = detectRevolvingDoor({
      authority_level_proxy: 0.7,
      role_switch_proxy: 0.8,
      regulatory_overlap_proxy: 0.7,
      evidence_tiers: [1, 3],
      evidence_ids: ["a", "b"],
      source_diversity_score: 0.8,
      reviewed_evidence_ids: ["a"],
      challenged_evidence_ids: [],
      signal_inputs: [{ signal_type: "revolving_door_role_change", value_numeric: 0.8 }],
      reviewed_extraction_ratio: 0.5,
    });

    expect(result?.pattern_type).toBe("REVOLVING_DOOR");
    expect(result?.confidence).toBeGreaterThan(0);
  });

  it("detects iatrogenic intervention patterns", () => {
    const result = detectIatrogenicIntervention({
      intervention_backfire_proxy: 0.8,
      repeated_failure_proxy: 0.7,
      public_harm_proxy: 0.75,
      evidence_tiers: [2, 4],
      evidence_ids: ["a", "b"],
      avg_extraction_confidence: 0.81,
      reviewed_evidence_ids: ["a"],
      challenged_evidence_ids: [],
      signal_inputs: [{ signal_type: "intervention_backfire_documented", value_numeric: 0.8 }],
      reviewed_extraction_ratio: 0.5,
    });

    expect(result?.pattern_type).toBe("IATROGENIC_INTERVENTION");
    expect(result?.severity_score).toBeGreaterThan(0);
  });

  it("detects bailout to boardroom patterns", () => {
    const result = detectBailoutToBoardroom({
      bailout_proxy: 0.85,
      shareholder_loss_proxy: 0.65,
      authority_level_proxy: 0.7,
      evidence_tiers: [1, 2],
      evidence_ids: ["a", "b"],
      source_diversity_score: 0.76,
      reviewed_evidence_ids: ["a"],
      challenged_evidence_ids: [],
      signal_inputs: [{ signal_type: "bailout_or_subsidy", value_numeric: 0.85 }],
      reviewed_extraction_ratio: 0.5,
    });

    expect(result?.pattern_type).toBe("BAILOUT_TO_BOARDROOM");
    expect(result?.confidence).toBeGreaterThan(0);
  });

  it("caps detector confidence when extraction review is absent", () => {
    const result = detectBobRubinTrade({
      authority_level_proxy: 0.8,
      externalized_loss_proxy: 0.8,
      sitg_gap_proxy: 0.8,
      persistence_proxy: 0.7,
      evidence_tiers: [1, 2],
      evidence_ids: ["a", "b"],
      reviewed_evidence_ids: [],
      challenged_evidence_ids: [],
      signal_inputs: [{ signal_type: "authority_level_high", value_numeric: 0.8 }],
      avg_extraction_confidence: 0.95,
      source_diversity_score: 0.9,
      evidence_quality_score: 0.9,
      reviewed_extraction_ratio: 0,
    });

    expect(result?.confidence).toBe(0.58);
    expect(result?.explanation_json.confidence_calc).toMatchObject({
      capped_by: 0.58,
    });
  });
});
