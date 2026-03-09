import type {
  Capture,
  Discovery,
  EntityProfile,
  Evidence,
  EvidenceDetail,
  Extraction,
  LeaderboardEntry,
  RankedDiscovery,
  Score,
  SearchResults,
  SubjectType,
  User,
  UserAction,
} from "./types.js";

export interface DiscoveryFilters {
  subject_type?: SubjectType;
  subject_id?: string;
  status?: Discovery["status"];
  min_confidence?: number;
}

export interface EvidenceListItem extends Evidence {
  extraction_count: number;
  reviewed: boolean;
  duplicate_count: number;
  claim_count: number;
}

export interface EvidenceListFilters {
  reviewed?: boolean;
}

export interface CreateEvidenceInput {
  source_type: Evidence["source_type"];
  publisher: string;
  title: string;
  url: string;
  accessed_at: string;
  trust_tier: Evidence["trust_tier"];
  content_hash: string;
  raw_storage_path: string;
  extracted_text_path: string;
  license_notes?: string | null;
}

export interface CreateExtractionInput {
  evidence_id: string;
  extractor_version: string;
  model_name?: string | null;
  schema_version: string;
  json_output: Record<string, unknown>;
  confidence: number;
}

export interface ReviewExtractionInput {
  review_status: Extraction["review_status"];
  review_note?: string | null;
  reviewed_by: string;
}

export interface CreateUserActionInput {
  user_id: string;
  action_type: UserAction["action_type"];
  entity_type: UserAction["entity_type"];
  entity_id: string;
}

export interface CaptureInput {
  discovery_id: string;
  note?: string | null;
}

export interface RecomputeResult {
  signals: number;
  scores: Score[];
  discoveries: RankedDiscovery[];
}

export interface Repository {
  getDefaultUser(): Promise<User>;
  getUserById(id: string): Promise<User | null>;
  search(query: string, type: string): Promise<SearchResults>;
  listEvidence(userId: string, filters?: EvidenceListFilters): Promise<EvidenceListItem[]>;
  getEvidenceById(id: string, userId: string): Promise<EvidenceDetail | null>;
  createEvidence(input: CreateEvidenceInput): Promise<{ created: boolean; evidence: Evidence }>;
  createExtraction(input: CreateExtractionInput): Promise<Extraction>;
  reviewExtraction(id: string, input: ReviewExtractionInput): Promise<Extraction>;
  createUserAction(input: CreateUserActionInput): Promise<UserAction>;
  listDiscoveries(userId: string, filters?: DiscoveryFilters): Promise<RankedDiscovery[]>;
  getDiscoveryById(id: string, userId: string): Promise<RankedDiscovery | null>;
  captureDiscovery(userId: string, input: CaptureInput): Promise<Capture>;
  listCaptures(userId: string): Promise<Capture[]>;
  shareCapture(userId: string, captureId: string): Promise<Capture>;
  listWatchlist(userId: string): Promise<RankedDiscovery[]>;
  getLeaderboards(userId: string): Promise<{ subjects: LeaderboardEntry[]; patterns: LeaderboardEntry[] }>;
  getEntityProfile(subjectType: SubjectType, id: string, userId: string): Promise<EntityProfile | null>;
  recomputeSubject(subjectType: SubjectType, subjectId: string, userId: string): Promise<RecomputeResult>;
}
