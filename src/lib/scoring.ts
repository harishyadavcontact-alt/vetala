import type { PatternType } from "./types.js";

export interface SignalInput {
  signal_type: string;
  value_numeric?: number;
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
    .filter((s) => allowed[scoreType].includes(s.signal_type))
    .reduce((acc, s) => acc + (weights[s.signal_type] ?? 0) * (s.value_numeric ?? 1), 0);

  return clamp100(raw);
}

export function computeFs(sitg: number, eli: number, fcs: number, ii: number, persistenceBonus = 0): number {
  return clamp100(0.3 * sitg + 0.3 * eli + 0.25 * fcs + 0.15 * ii + Math.min(10, persistenceBonus));
}

export interface BobRubinInputs {
  authority_level_proxy: number;
  externalized_loss_proxy: number;
  sitg_gap_proxy: number;
  persistence_proxy: number;
  evidence_tiers: number[];
  evidence_ids: string[];
  avg_extraction_confidence: number;
  source_diversity_score: number;
  evidence_quality_score: number;
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
  const confidence = Math.min(
    input.avg_extraction_confidence,
    input.source_diversity_score,
    input.evidence_quality_score,
  );

  return {
    pattern_type: "BOB_RUBIN_TRADE",
    severity_score: severityScore,
    confidence,
    explanation_json: {
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
          evidence_ids: input.evidence_ids,
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
      confidence_calc: {
        inputs: {
          avg_extraction_confidence: input.avg_extraction_confidence,
          source_diversity_score: input.source_diversity_score,
          evidence_quality_score: input.evidence_quality_score,
        },
        confidence,
      },
    },
  };
}

export interface RevolvingDoorInputs {
  authority_level_proxy: number;
  role_switch_proxy: number;
  regulatory_overlap_proxy: number;
  evidence_tiers: number[];
  evidence_ids: string[];
  source_diversity_score: number;
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
  const confidence = Math.min(input.source_diversity_score, input.evidence_tiers.some((tier) => tier === 1) ? 0.85 : 0.7);

  return {
    pattern_type: "REVOLVING_DOOR",
    severity_score: severityScore,
    confidence,
    explanation_json: {
      detector_version: "revolving_door_v1",
      pattern_type: "REVOLVING_DOOR",
      pattern_label: "Revolving door exposure detected",
      thresholds: {
        authority_level_proxy: 0.6,
        role_switch_proxy: 0.6,
        regulatory_overlap_proxy: 0.5,
      },
      inputs: input,
    },
  };
}

export interface IatrogenicInterventionInputs {
  intervention_backfire_proxy: number;
  repeated_failure_proxy: number;
  public_harm_proxy: number;
  evidence_tiers: number[];
  evidence_ids: string[];
  avg_extraction_confidence: number;
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
  const confidence = Math.min(input.avg_extraction_confidence, input.repeated_failure_proxy >= 0.6 ? 0.85 : 0.72);

  return {
    pattern_type: "IATROGENIC_INTERVENTION",
    severity_score: severityScore,
    confidence,
    explanation_json: {
      detector_version: "iatrogenic_intervention_v1",
      pattern_type: "IATROGENIC_INTERVENTION",
      pattern_label: "Iatrogenic intervention pattern detected",
      thresholds: {
        intervention_backfire_proxy: 0.6,
        public_harm_proxy: 0.5,
      },
      inputs: input,
    },
  };
}

export interface BailoutToBoardroomInputs {
  bailout_proxy: number;
  shareholder_loss_proxy: number;
  authority_level_proxy: number;
  evidence_tiers: number[];
  evidence_ids: string[];
  source_diversity_score: number;
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
  const confidence = Math.min(input.source_diversity_score, 0.82);

  return {
    pattern_type: "BAILOUT_TO_BOARDROOM",
    severity_score: severityScore,
    confidence,
    explanation_json: {
      detector_version: "bailout_to_boardroom_v1",
      pattern_type: "BAILOUT_TO_BOARDROOM",
      pattern_label: "Bailout-to-boardroom pattern detected",
      thresholds: {
        bailout_proxy: 0.6,
        shareholder_loss_proxy: 0.5,
        authority_level_proxy: 0.5,
      },
      inputs: input,
    },
  };
}
