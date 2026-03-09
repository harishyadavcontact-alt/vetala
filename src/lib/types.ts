export type SubjectType = "person" | "event" | "org";

export type PatternType =
  | "BOB_RUBIN_TRADE"
  | "REVOLVING_DOOR"
  | "BAILOUT_TO_BOARDROOM"
  | "COMPLEXITY_ARBITRAGE"
  | "POSTDICTING_STIGLITZ"
  | "IATROGENIC_INTERVENTION";

export type ScoreType = "SITG" | "ELI" | "FCS" | "II" | "FS";

export type DiscoveryStatus = "suggested" | "captured" | "dismissed" | "flagged_for_review";

export type EvidenceSourceType =
  | "registry"
  | "filing"
  | "watchdog_db"
  | "news"
  | "report"
  | "court"
  | "webpage"
  | "other";

export type UserActionType = "viewed_evidence" | "captured" | "shared" | "flagged";

export interface Person {
  id: string;
  full_name: string;
  primary_country: string | null;
  description: string | null;
}

export interface Organization {
  id: string;
  name: string;
  org_type: "agency" | "corp" | "ngo" | "party" | "thinktank" | "other";
  country?: string | null;
  description?: string | null;
}

export interface Event {
  id: string;
  title: string;
  category: "policy" | "vote" | "reg_action" | "corp_action" | "advisory" | "forecast" | "public_statement" | "other";
  summary: string | null;
  start_date?: string | null;
  end_date?: string | null;
  jurisdiction?: string | null;
}

export interface Evidence {
  id: string;
  source_type: EvidenceSourceType;
  publisher: string;
  title: string;
  url: string;
  accessed_at: string;
  trust_tier: 1 | 2 | 3 | 4;
  content_hash: string;
  raw_storage_path: string;
  extracted_text_path: string;
  license_notes: string | null;
}

export interface Extraction {
  id: string;
  evidence_id: string;
  extractor_version: string;
  model_name: string | null;
  schema_version: string;
  json_output: Record<string, unknown>;
  confidence: number;
  created_at: string;
}

export interface Signal {
  id: string;
  subject_type: SubjectType;
  subject_id: string;
  signal_type: string;
  value_numeric: number | null;
  value_text: string | null;
  evidence_id: string | null;
  computed_at: string;
}

export interface Score {
  id: string;
  subject_type: SubjectType;
  subject_id: string;
  score_type: ScoreType;
  score_value: number;
  score_version: string;
  explanation_json: Record<string, unknown>;
  computed_at: string;
}

export interface Discovery {
  id: string;
  subject_type: SubjectType;
  subject_id: string;
  pattern_type: PatternType;
  pattern_label: string;
  severity_score: number;
  confidence: number;
  detected_at: string;
  explanation_json: Record<string, unknown>;
  status: DiscoveryStatus;
  evidence_ids: string[];
  detector_version: string;
}

export interface User {
  id: string;
  email: string;
  created_at?: string;
}

export interface Capture {
  id: string;
  user_id: string;
  discovery_id: string;
  captured_at: string;
  note: string | null;
  verification_level: "viewed_evidence" | "verified_sources" | "expert_review" | null;
  share_token: string | null;
}

export interface UserAction {
  id: string;
  user_id: string;
  action_type: UserActionType;
  entity_type: "evidence" | "discovery" | "capture";
  entity_id: string;
  created_at: string;
}

export interface DiscoverySummary {
  evidence_count: number;
  best_trust_tier: number | null;
  reviewed_evidence_count: number;
  source_diversity_score: number;
}

export interface FragilitySummary {
  skin_in_the_game_gap: number;
  externalized_loss_risk: number;
  iatrogenic_risk: number;
  fragility_score: number;
  top_patterns: Array<{
    pattern_type: PatternType;
    pattern_label: string;
    severity_score: number;
    confidence: number;
  }>;
  thesis: string;
}

export interface EvidenceHeadline {
  id: string;
  title: string;
  publisher: string;
  trust_tier: number;
  accessed_at: string;
}

export interface RankedDiscovery extends Discovery {
  evidence: Evidence[];
  summary: DiscoverySummary;
}

export interface EvidenceDetail extends Evidence {
  reviewed: boolean;
  duplicate_count: number;
  extraction_count: number;
  extractions: Extraction[];
  linked_discoveries: Array<Pick<Discovery, "id" | "pattern_type" | "pattern_label" | "status" | "confidence" | "severity_score">>;
}

export interface EntityProfile {
  subject_type: SubjectType;
  person?: Person;
  organization?: Organization;
  event?: Event;
  scores: Score[];
  discoveries: RankedDiscovery[];
  timeline: Event[];
  fragility_summary: FragilitySummary;
  recent_evidence: EvidenceHeadline[];
}

export interface SearchResults {
  people: Person[];
  orgs: Organization[];
  events: Event[];
}
