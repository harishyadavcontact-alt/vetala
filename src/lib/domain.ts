import { randomUUID } from "node:crypto";
import {
  computeFs,
  computeScoreFromSignals,
  detectBailoutToBoardroom,
  detectBobRubinTrade,
  detectIatrogenicIntervention,
  detectRevolvingDoor,
} from "./scoring.js";
import type {
  Discovery,
  DiscoverySummary,
  Evidence,
  EvidenceHeadline,
  Extraction,
  FragilitySummary,
  RankedDiscovery,
  Score,
  Signal,
  SubjectType,
  UserAction,
} from "./types.js";

export const SCORE_VERSION = "score_v1";
export const DETECTOR_VERSION = "bob_rubin_trade_v1";

export function createId(): string {
  return randomUUID();
}

export function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

export function scoreExplanation(scoreType: Score["score_type"], subjectSignals: Signal[], value: number): Record<string, unknown> {
  return {
    score_type: scoreType,
    score_version: SCORE_VERSION,
    signals: subjectSignals.map((signal) => ({
      signal_id: signal.id,
      signal_type: signal.signal_type,
      value_numeric: signal.value_numeric ?? 0,
      value_text: signal.value_text ?? "null",
      evidence_id: signal.evidence_id ?? "null",
      weight: 1,
    })),
    calculation: {
      raw_sum: value,
      clamped: value,
      notes: "null",
    },
  };
}

function toSignalInputs(subjectSignals: Signal[]) {
  return subjectSignals.map((signal) => ({
    signal_type: signal.signal_type,
    value_numeric: signal.value_numeric ?? undefined,
  }));
}

function detectorSignalInputs(subjectSignals: Signal[]) {
  return subjectSignals
    .filter((signal): signal is Signal & { value_numeric: number } => signal.value_numeric !== null)
    .map((signal) => ({
      signal_type: signal.signal_type,
      value_numeric: signal.value_numeric,
    }));
}

export function buildScores(subjectType: SubjectType, subjectId: string, subjectSignals: Signal[]): Score[] {
  const scoreInputs = toSignalInputs(subjectSignals);
  const sitg = computeScoreFromSignals("SITG", scoreInputs);
  const eli = computeScoreFromSignals("ELI", scoreInputs);
  const fcs = computeScoreFromSignals("FCS", scoreInputs);
  const ii = computeScoreFromSignals("II", scoreInputs);
  const fs = computeFs(sitg, eli, fcs, ii, 5);

  return ([
    ["SITG", sitg],
    ["ELI", eli],
    ["FCS", fcs],
    ["II", ii],
    ["FS", fs],
  ] as const).map(([score_type, score_value]) => ({
    id: createId(),
    subject_type: subjectType,
    subject_id: subjectId,
    score_type,
    score_value,
    score_version: SCORE_VERSION,
    explanation_json: scoreExplanation(score_type, subjectSignals, score_value),
    computed_at: new Date().toISOString(),
  }));
}

export function extractionReviewSummary(linkedExtractions: Extraction[]) {
  const extractionCount = linkedExtractions.length;
  const reviewedExtractions = linkedExtractions.filter((extraction) => extraction.review_status === "reviewed");
  const challengedExtractions = linkedExtractions.filter((extraction) => extraction.review_status === "challenged");
  const reviewedEvidenceIds = Array.from(new Set(reviewedExtractions.map((extraction) => extraction.evidence_id)));
  const challengedEvidenceIds = Array.from(new Set(challengedExtractions.map((extraction) => extraction.evidence_id)));

  return {
    extraction_count: extractionCount,
    reviewed_extraction_count: reviewedExtractions.length,
    challenged_extraction_count: challengedExtractions.length,
    extraction_review_ratio: extractionCount === 0 ? 0 : Number((reviewedExtractions.length / extractionCount).toFixed(2)),
    reviewed_evidence_ids: reviewedEvidenceIds,
    challenged_evidence_ids: challengedEvidenceIds,
  };
}

export function buildDiscovery(
  subjectType: SubjectType,
  subjectId: string,
  subjectSignals: Signal[],
  evidence: Evidence[],
  extractions: Extraction[],
): Discovery[] {
  const evidenceIds = Array.from(new Set(subjectSignals.map((signal) => signal.evidence_id).filter((value): value is string => Boolean(value))));
  if (evidenceIds.length < 2) {
    return [];
  }

  const linkedEvidence = evidence.filter((item) => evidenceIds.includes(item.id));
  const linkedExtractions = extractions.filter((extraction) => evidenceIds.includes(extraction.evidence_id));
  const reviewSummary = extractionReviewSummary(linkedExtractions);
  const signalInputs = detectorSignalInputs(subjectSignals);

  const commonDetectorInputs = {
    evidence_ids: evidenceIds,
    evidence_tiers: linkedEvidence.map((item) => item.trust_tier),
    reviewed_evidence_ids: reviewSummary.reviewed_evidence_ids,
    challenged_evidence_ids: reviewSummary.challenged_evidence_ids,
    signal_inputs: signalInputs,
    reviewed_extraction_ratio: reviewSummary.extraction_review_ratio,
  };

  const avgExtractionConfidence =
    linkedExtractions.length === 0 ? 0.5 : linkedExtractions.reduce((sum, extraction) => sum + extraction.confidence, 0) / linkedExtractions.length;

  const rubinTrade = detectBobRubinTrade({
    authority_level_proxy: Math.min(1, subjectSignals.find((signal) => signal.signal_type === "authority_level_high")?.value_numeric ?? 0),
    externalized_loss_proxy: Math.min(1, subjectSignals.find((signal) => signal.signal_type === "taxpayer_cost_mentioned")?.value_numeric ?? 0),
    sitg_gap_proxy: Math.min(1, subjectSignals.find((signal) => signal.signal_type === "insulated_role")?.value_numeric ?? 0.6),
    persistence_proxy: Math.min(1, subjectSignals.find((signal) => signal.signal_type === "intervention_backfire_documented")?.value_numeric ?? 0.3),
    avg_extraction_confidence: avgExtractionConfidence,
    source_diversity_score: sourceDiversityScore(linkedEvidence),
    evidence_quality_score: linkedEvidence.some((item) => item.trust_tier <= 2) ? 0.8 : 0.5,
    ...commonDetectorInputs,
  });

  const revolvingDoor = detectRevolvingDoor({
    authority_level_proxy: Math.min(1, subjectSignals.find((signal) => signal.signal_type === "authority_level_high")?.value_numeric ?? 0),
    role_switch_proxy: Math.min(1, subjectSignals.find((signal) => signal.signal_type === "revolving_door_role_change")?.value_numeric ?? 0),
    regulatory_overlap_proxy: Math.min(1, subjectSignals.find((signal) => signal.signal_type === "regulatory_overlap")?.value_numeric ?? 0),
    source_diversity_score: sourceDiversityScore(linkedEvidence),
    ...commonDetectorInputs,
  });

  const iatrogenicIntervention = detectIatrogenicIntervention({
    intervention_backfire_proxy: Math.min(
      1,
      subjectSignals.find((signal) => signal.signal_type === "intervention_backfire_documented")?.value_numeric ?? 0,
    ),
    repeated_failure_proxy: Math.min(
      1,
      subjectSignals.find((signal) => signal.signal_type === "repeated_interventions_same_failure")?.value_numeric ?? 0,
    ),
    public_harm_proxy: Math.min(1, subjectSignals.find((signal) => signal.signal_type === "public_harm_policy")?.value_numeric ?? 0),
    avg_extraction_confidence: avgExtractionConfidence,
    ...commonDetectorInputs,
  });

  const bailoutToBoardroom = detectBailoutToBoardroom({
    bailout_proxy: Math.min(1, subjectSignals.find((signal) => signal.signal_type === "bailout_or_subsidy")?.value_numeric ?? 0),
    shareholder_loss_proxy: Math.min(1, subjectSignals.find((signal) => signal.signal_type === "shareholder_loss_large")?.value_numeric ?? 0),
    authority_level_proxy: Math.min(1, subjectSignals.find((signal) => signal.signal_type === "authority_level_high")?.value_numeric ?? 0),
    source_diversity_score: sourceDiversityScore(linkedEvidence),
    ...commonDetectorInputs,
  });

  const detections = [rubinTrade, revolvingDoor, iatrogenicIntervention, bailoutToBoardroom].filter(
    (detection): detection is NonNullable<typeof detection> => Boolean(detection),
  );
  if (detections.length === 0) {
    return [];
  }

  return detections.map((detection) => ({
    id: createId(),
    subject_type: subjectType,
    subject_id: subjectId,
    pattern_type: detection.pattern_type,
    pattern_label: String(detection.explanation_json.pattern_label),
    severity_score: detection.severity_score,
    confidence: clampConfidence(detection.confidence),
    detected_at: new Date().toISOString(),
    explanation_json: detection.explanation_json,
    status: "suggested",
    evidence_ids: evidenceIds,
    detector_version: String(detection.explanation_json.detector_version ?? DETECTOR_VERSION),
  }));
}

export function sourceDiversityScore(evidence: Evidence[]): number {
  if (evidence.length === 0) {
    return 0;
  }

  const uniquePublishers = new Set(evidence.map((item) => item.publisher.toLowerCase()));
  return Number((uniquePublishers.size / evidence.length).toFixed(2));
}

export function discoverySummary(
  discovery: Discovery,
  linkedEvidence: Evidence[],
  linkedExtractions: Extraction[],
  actions: UserAction[],
  userId: string,
): DiscoverySummary {
  const reviewedEvidence = new Set(
    actions
      .filter((action) => action.user_id === userId && action.action_type === "viewed_evidence" && action.entity_type === "evidence")
      .map((action) => action.entity_id),
  );
  const evidenceCount = linkedEvidence.length;
  const reviewSummary = extractionReviewSummary(linkedExtractions);

  return {
    evidence_count: evidenceCount,
    best_trust_tier: evidenceCount === 0 ? null : Math.min(...linkedEvidence.map((item) => item.trust_tier)),
    reviewed_evidence_count: linkedEvidence.filter((item) => reviewedEvidence.has(item.id)).length,
    source_diversity_score: sourceDiversityScore(linkedEvidence),
    extraction_count: reviewSummary.extraction_count,
    reviewed_extraction_count: reviewSummary.reviewed_extraction_count,
    challenged_extraction_count: reviewSummary.challenged_extraction_count,
    extraction_review_ratio: reviewSummary.extraction_review_ratio,
  };
}

export function sortEvidence(a: Evidence, b: Evidence): number {
  return a.trust_tier - b.trust_tier || b.accessed_at.localeCompare(a.accessed_at) || a.publisher.localeCompare(b.publisher);
}

export function sortExtractions(a: Extraction, b: Extraction): number {
  const reviewRank = { reviewed: 0, challenged: 1, pending: 2 } as const;
  return reviewRank[a.review_status] - reviewRank[b.review_status] || b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id);
}

export function rankDiscovery(
  discovery: Discovery,
  evidence: Evidence[],
  extractions: Extraction[],
  actions: UserAction[],
  userId: string,
): RankedDiscovery {
  const linkedEvidence = evidence.filter((item) => discovery.evidence_ids.includes(item.id)).sort(sortEvidence);
  const linkedExtractions = extractions.filter((extraction) => discovery.evidence_ids.includes(extraction.evidence_id)).sort(sortExtractions);
  const summary = discoverySummary(discovery, linkedEvidence, linkedExtractions, actions, userId);

  return {
    ...discovery,
    evidence: linkedEvidence,
    summary,
    review_status: summary.reviewed_extraction_count > 0 ? "reviewed_thesis" : "detector_hit",
  };
}

export function buildFragilitySummary(scores: Score[], discoveries: RankedDiscovery[]): FragilitySummary {
  const scoreValue = (type: Score["score_type"]) => scores.find((score) => score.score_type === type)?.score_value ?? 0;
  const topPatterns = discoveries
    .slice()
    .sort((a, b) => b.severity_score - a.severity_score || b.confidence - a.confidence)
    .slice(0, 3)
    .map((discovery) => ({
      pattern_type: discovery.pattern_type,
      pattern_label: discovery.pattern_label,
      severity_score: discovery.severity_score,
      confidence: discovery.confidence,
    }));

  const strongest = discoveries
    .slice()
    .sort((a, b) => b.summary.reviewed_extraction_count - a.summary.reviewed_extraction_count || b.severity_score - a.severity_score)[0];
  const thesis = !strongest
    ? "No evidence-backed fragility thesis has been captured for this subject yet."
    : strongest.summary.reviewed_extraction_count > 0
      ? `${strongest.pattern_label} has reviewed extraction support and is currently the strongest fragility thesis on record.`
      : `${strongest.pattern_label} is currently a detector hit only and still needs reviewed extraction support.`;

  return {
    skin_in_the_game_gap: scoreValue("SITG"),
    externalized_loss_risk: scoreValue("ELI"),
    iatrogenic_risk: scoreValue("II"),
    fragility_score: scoreValue("FS"),
    top_patterns: topPatterns,
    thesis,
  };
}

export function buildEvidenceHeadlines(discoveries: RankedDiscovery[]): EvidenceHeadline[] {
  const deduped = new Map<string, EvidenceHeadline>();
  for (const discovery of discoveries) {
    for (const item of discovery.evidence) {
      if (!deduped.has(item.id)) {
        deduped.set(item.id, {
          id: item.id,
          title: item.title,
          publisher: item.publisher,
          trust_tier: item.trust_tier,
          accessed_at: item.accessed_at,
        });
      }
    }
  }
  return Array.from(deduped.values()).sort((a, b) => a.trust_tier - b.trust_tier || b.accessed_at.localeCompare(a.accessed_at)).slice(0, 5);
}
