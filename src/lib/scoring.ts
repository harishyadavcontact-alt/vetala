import type { PatternType } from "./types.js";

export interface SignalInput {
  signal_type: string;
  value_numeric?: number;
}

export interface DetectorSignalInput {
  signal_type: string;
  value_numeric: number;
}

export interface DetectorEvidenceInput {
  evidence_ids: string[];
  evidence_tiers: number[];
  reviewed_evidence_ids: string[];
  challenged_evidence_ids: string[];
  signal_inputs: DetectorSignalInput[];
}

interface DetectorConfidenceInputs {
  avg_extraction_confidence?: number;
  source_diversity_score?: number;
  evidence_quality_score?: number;
  reviewed_extraction_ratio: number;
  review_cap: number;
}

const clamp100 = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

export function computeScoreFromSignals(scoreType: "SITG" | "ELI" | "FCS" | "II", signals: SignalInput[]): number {
  const weights: Record<string, number> = {
    insulated_role: 25,
    authority_level_high: 25,
    fixed_salary_only: 20,
    personal_exposure_present: -30,
    taxpayer_cost_mentioned: 35,
    shareholder_loss_large: 25,
    public_harm_policy: 20,
    bailout_or_subsidy: 25,
    moral_hazard_created: 25,
    increased_leverage: 25,
    concentrated_risk: 20,
    volatility_suppression: 15,
    intervention_backfire_documented: 40,
    unintended_consequences: 25,
    repeated_interventions_same_failure: 20,
  };
  const allowed: Record<string, string[]> = {
    SITG: ["insulated_role", "authority_level_high", "fixed_salary_only", "personal_exposure_present"],
    ELI: ["taxpayer_cost_mentioned", "shareholder_loss_large", "public_harm_policy", "bailout_or_subsidy"],
    FCS: ["moral_hazard_created", "increased_leverage", "concentrated_risk", "volatility_suppression"],
    II: ["intervention_backfire_documented", "unintended_consequences", "repeated_interventions_same_failure"],
  };

  const raw = signals
    .filter((signal) => allowed[scoreType].includes(signal.signal_type))
    .reduce((sum, signal) => sum + (weights[signal.signal_type] ?? 0) * (signal.value_numeric ?? 1), 0);

  return clamp100(raw);
}

export function computeFs(sitg: number, eli: number, fcs: number, ii: number, persistenceBonus = 0): number {
  return clamp100(0.3 * sitg + 0.3 * eli + 0.25 * fcs + 0.15 * ii + Math.min(10, persistenceBonus));
}

function confidenceCapReason(reviewedExtractionRatio: number): string {
  if (reviewedExtractionRatio >= 0.67) {
    return "Review coverage is strong enough that source quality, not analyst caution, sets the ceiling.";
  }
  if (reviewedExtractionRatio > 0) {
    return "Only part of the extraction set has been reviewed, so confidence is capped below the raw detector signal.";
  }
  return "No reviewed extraction supports this detector yet, so confidence stays in detector-hit territory only.";
}

function buildConfidenceCalc(input: DetectorConfidenceInputs) {
  const components = [
    input.avg_extraction_confidence,
    input.source_diversity_score,
    input.evidence_quality_score,
    input.review_cap,
  ].filter((value): value is number => typeof value === "number");
  const confidence = Math.min(...components);

  return {
    confidence,
    explanation: {
      inputs: {
        avg_extraction_confidence: input.avg_extraction_confidence ?? null,
        source_diversity_score: input.source_diversity_score ?? null,
        evidence_quality_score: input.evidence_quality_score ?? null,
        reviewed_extraction_ratio: input.reviewed_extraction_ratio,
        review_cap: input.review_cap,
      },
      confidence,
      capped_by: input.review_cap,
      cap_reason: confidenceCapReason(input.reviewed_extraction_ratio),
    },
  };
}

function buildDetectorEvidence(input: DetectorEvidenceInput) {
  return {
    evidence_ids: input.evidence_ids,
    reviewed_evidence_ids: input.reviewed_evidence_ids,
    challenged_evidence_ids: input.challenged_evidence_ids,
    signals_used: input.signal_inputs,
  };
}

export interface BobRubinInputs extends DetectorEvidenceInput {
  authority_level_proxy: number;
  externalized_loss_proxy: number;
  sitg_gap_proxy: number;
  persistence_proxy: number;
  avg_extraction_confidence: number;
  source_diversity_score: number;
  evidence_quality_score: number;
  reviewed_extraction_ratio: number;
}

export function detectBobRubinTrade(input: BobRubinInputs): null | {
  pattern_type: PatternType;
  severity_score: number;
  confidence: number;
  explanation_json: Record<string, unknown>;
} {
  const tierOk = input.evidence_tiers.some((tier) => tier <= 2);
  const countOk = input.evidence_ids.length >= 2;
  const thresholdPass =
    input.authority_level_proxy >= 0.7 &&
    input.externalized_loss_proxy >= 0.6 &&
    input.sitg_gap_proxy >= 0.6 &&
    tierOk &&
    countOk;

  if (!thresholdPass) {
    return null;
  }

  const severityScore = clamp100(
    Math.round(
      (0.35 * input.externalized_loss_proxy +
        0.25 * input.sitg_gap_proxy +
        0.2 * input.authority_level_proxy +
        0.2 * input.persistence_proxy) *
        100,
    ),
  );
  const confidenceCalc = buildConfidenceCalc({
    avg_extraction_confidence: input.avg_extraction_confidence,
    source_diversity_score: input.source_diversity_score,
    evidence_quality_score: input.evidence_quality_score,
    reviewed_extraction_ratio: input.reviewed_extraction_ratio,
    review_cap: input.reviewed_extraction_ratio >= 0.67 ? 1 : input.reviewed_extraction_ratio > 0 ? 0.72 : 0.58,
  });

  return {
    pattern_type: "BOB_RUBIN_TRADE",
    severity_score: severityScore,
    confidence: confidenceCalc.confidence,
    explanation_json: {
      detector_version: "bob_rubin_trade_v1",
      pattern_type: "BOB_RUBIN_TRADE",
      pattern_label: "Rubin trade detected",
      triggered_rules: [
        {
          rule_id: "bob_rubin_trade_v1",
          description: "Authority, externalized loss, and SITG gap thresholds with minimum evidence quality.",
          passed: true,
          inputs: {
            authority_level_proxy: input.authority_level_proxy,
            externalized_loss_proxy: input.externalized_loss_proxy,
            sitg_gap_proxy: input.sitg_gap_proxy,
            persistence_proxy: input.persistence_proxy,
          },
          thresholds: {
            authority_level_proxy: 0.7,
            externalized_loss_proxy: 0.6,
            sitg_gap_proxy: 0.6,
          },
          detector_inputs: buildDetectorEvidence(input),
        },
      ],
      severity_calc: {
        formula:
          "round((0.35*externalized_loss_proxy + 0.25*sitg_gap_proxy + 0.20*authority_level_proxy + 0.20*persistence_proxy) * 100)",
        inputs: {
          authority_level_proxy: input.authority_level_proxy,
          externalized_loss_proxy: input.externalized_loss_proxy,
          sitg_gap_proxy: input.sitg_gap_proxy,
          persistence_proxy: input.persistence_proxy,
        },
        severity_score: severityScore,
      },
      confidence_calc: confidenceCalc.explanation,
    },
  };
}

export interface RevolvingDoorInputs extends DetectorEvidenceInput {
  authority_level_proxy: number;
  role_switch_proxy: number;
  regulatory_overlap_proxy: number;
  source_diversity_score: number;
  reviewed_extraction_ratio: number;
}

export function detectRevolvingDoor(input: RevolvingDoorInputs): null | {
  pattern_type: PatternType;
  severity_score: number;
  confidence: number;
  explanation_json: Record<string, unknown>;
} {
  const thresholdPass =
    input.authority_level_proxy >= 0.6 &&
    input.role_switch_proxy >= 0.6 &&
    input.regulatory_overlap_proxy >= 0.5 &&
    input.evidence_ids.length >= 2 &&
    input.evidence_tiers.some((tier) => tier <= 2);

  if (!thresholdPass) {
    return null;
  }

  const severityScore = clamp100(
    Math.round((0.4 * input.role_switch_proxy + 0.35 * input.regulatory_overlap_proxy + 0.25 * input.authority_level_proxy) * 100),
  );
  const confidenceCalc = buildConfidenceCalc({
    source_diversity_score: input.source_diversity_score,
    evidence_quality_score: input.evidence_tiers.some((tier) => tier === 1) ? 0.85 : 0.7,
    reviewed_extraction_ratio: input.reviewed_extraction_ratio,
    review_cap: input.reviewed_extraction_ratio >= 0.67 ? 0.85 : input.reviewed_extraction_ratio > 0 ? 0.68 : 0.52,
  });

  return {
    pattern_type: "REVOLVING_DOOR",
    severity_score: severityScore,
    confidence: confidenceCalc.confidence,
    explanation_json: {
      detector_version: "revolving_door_v1",
      pattern_type: "REVOLVING_DOOR",
      pattern_label: "Revolving door exposure detected",
      thresholds: {
        authority_level_proxy: 0.6,
        role_switch_proxy: 0.6,
        regulatory_overlap_proxy: 0.5,
      },
      inputs: {
        authority_level_proxy: input.authority_level_proxy,
        role_switch_proxy: input.role_switch_proxy,
        regulatory_overlap_proxy: input.regulatory_overlap_proxy,
      },
      detector_inputs: buildDetectorEvidence(input),
      confidence_calc: confidenceCalc.explanation,
    },
  };
}

export interface IatrogenicInterventionInputs extends DetectorEvidenceInput {
  intervention_backfire_proxy: number;
  repeated_failure_proxy: number;
  public_harm_proxy: number;
  avg_extraction_confidence: number;
  reviewed_extraction_ratio: number;
}

export function detectIatrogenicIntervention(input: IatrogenicInterventionInputs): null | {
  pattern_type: PatternType;
  severity_score: number;
  confidence: number;
  explanation_json: Record<string, unknown>;
} {
  const thresholdPass =
    input.intervention_backfire_proxy >= 0.6 &&
    input.public_harm_proxy >= 0.5 &&
    input.evidence_ids.length >= 2 &&
    input.evidence_tiers.some((tier) => tier <= 2);

  if (!thresholdPass) {
    return null;
  }

  const severityScore = clamp100(
    Math.round((0.45 * input.intervention_backfire_proxy + 0.3 * input.public_harm_proxy + 0.25 * input.repeated_failure_proxy) * 100),
  );
  const confidenceCalc = buildConfidenceCalc({
    avg_extraction_confidence: input.avg_extraction_confidence,
    evidence_quality_score: input.repeated_failure_proxy >= 0.6 ? 0.85 : 0.72,
    reviewed_extraction_ratio: input.reviewed_extraction_ratio,
    review_cap: input.reviewed_extraction_ratio >= 0.67 ? 0.85 : input.reviewed_extraction_ratio > 0 ? 0.7 : 0.55,
  });

  return {
    pattern_type: "IATROGENIC_INTERVENTION",
    severity_score: severityScore,
    confidence: confidenceCalc.confidence,
    explanation_json: {
      detector_version: "iatrogenic_intervention_v1",
      pattern_type: "IATROGENIC_INTERVENTION",
      pattern_label: "Iatrogenic intervention pattern detected",
      thresholds: {
        intervention_backfire_proxy: 0.6,
        public_harm_proxy: 0.5,
      },
      inputs: {
        intervention_backfire_proxy: input.intervention_backfire_proxy,
        repeated_failure_proxy: input.repeated_failure_proxy,
        public_harm_proxy: input.public_harm_proxy,
      },
      detector_inputs: buildDetectorEvidence(input),
      confidence_calc: confidenceCalc.explanation,
    },
  };
}

export interface BailoutToBoardroomInputs extends DetectorEvidenceInput {
  bailout_proxy: number;
  shareholder_loss_proxy: number;
  authority_level_proxy: number;
  source_diversity_score: number;
  reviewed_extraction_ratio: number;
}

export function detectBailoutToBoardroom(input: BailoutToBoardroomInputs): null | {
  pattern_type: PatternType;
  severity_score: number;
  confidence: number;
  explanation_json: Record<string, unknown>;
} {
  const thresholdPass =
    input.bailout_proxy >= 0.6 &&
    input.shareholder_loss_proxy >= 0.5 &&
    input.authority_level_proxy >= 0.5 &&
    input.evidence_ids.length >= 2 &&
    input.evidence_tiers.some((tier) => tier <= 2);

  if (!thresholdPass) {
    return null;
  }

  const severityScore = clamp100(
    Math.round((0.45 * input.bailout_proxy + 0.3 * input.shareholder_loss_proxy + 0.25 * input.authority_level_proxy) * 100),
  );
  const confidenceCalc = buildConfidenceCalc({
    source_diversity_score: input.source_diversity_score,
    evidence_quality_score: 0.82,
    reviewed_extraction_ratio: input.reviewed_extraction_ratio,
    review_cap: input.reviewed_extraction_ratio >= 0.67 ? 0.82 : input.reviewed_extraction_ratio > 0 ? 0.68 : 0.53,
  });

  return {
    pattern_type: "BAILOUT_TO_BOARDROOM",
    severity_score: severityScore,
    confidence: confidenceCalc.confidence,
    explanation_json: {
      detector_version: "bailout_to_boardroom_v1",
      pattern_type: "BAILOUT_TO_BOARDROOM",
      pattern_label: "Bailout-to-boardroom pattern detected",
      thresholds: {
        bailout_proxy: 0.6,
        shareholder_loss_proxy: 0.5,
        authority_level_proxy: 0.5,
      },
      inputs: {
        bailout_proxy: input.bailout_proxy,
        shareholder_loss_proxy: input.shareholder_loss_proxy,
        authority_level_proxy: input.authority_level_proxy,
      },
      detector_inputs: buildDetectorEvidence(input),
      confidence_calc: confidenceCalc.explanation,
    },
  };
}
