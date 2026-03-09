import { buildEvidenceHeadlines, buildDiscovery, buildFragilitySummary, buildScores, createId, rankDiscovery, sortExtractions } from "./domain.js";
import type { Capture, Discovery, EntityProfile, Event, Evidence, Extraction, LeaderboardEntry, Organization, Person, Score, SearchResults, Signal, SubjectType, User, UserAction } from "./types.js";
import type {
  CaptureInput,
  CreateEvidenceInput,
  CreateExtractionInput,
  CreateUserActionInput,
  DiscoveryFilters,
  EvidenceListFilters,
  EvidenceListItem,
  ReviewExtractionInput,
  RecomputeResult,
  Repository,
} from "./repository.js";

export interface MemoryState {
  users: User[];
  people: Person[];
  organizations: Organization[];
  events: Event[];
  evidence: Evidence[];
  extractions: Extraction[];
  signals: Signal[];
  scores: Score[];
  discoveries: Discovery[];
  captures: Capture[];
  userActions: UserAction[];
}

export class MemoryRepository implements Repository {
  constructor(private readonly state: MemoryState) {}

  async getDefaultUser(): Promise<User> {
    return this.state.users[0];
  }

  async getUserById(id: string): Promise<User | null> {
    return this.state.users.find((user) => user.id === id) ?? null;
  }

  async search(query: string, type: string): Promise<SearchResults> {
    const q = query.toLowerCase();
    const include = (target: string) => type === "all" || type === target;

    return {
      people: include("people") ? this.state.people.filter((person) => person.full_name.toLowerCase().includes(q)) : [],
      orgs: include("orgs") ? this.state.organizations.filter((org) => org.name.toLowerCase().includes(q)) : [],
      events: include("events") ? this.state.events.filter((event) => event.title.toLowerCase().includes(q)) : [],
    };
  }

  async listEvidence(userId: string, filters: EvidenceListFilters = {}): Promise<EvidenceListItem[]> {
    const viewed = this.reviewedEvidenceIds(userId);

    return this.state.evidence
      .map((item) => {
        const evidenceExtractions = this.state.extractions.filter((extraction) => extraction.evidence_id === item.id);
        const reviewed = viewed.has(item.id);
        return {
          ...item,
          extraction_count: evidenceExtractions.length,
          claim_count: evidenceExtractions.reduce((sum, extraction) => {
            const eventClaims = Array.isArray((extraction.json_output.events as Array<Record<string, unknown>> | undefined))
              ? (extraction.json_output.events as Array<Record<string, unknown>>)
              : [];
            return sum + eventClaims.reduce((claimSum, eventRecord) => claimSum + (Array.isArray(eventRecord.claims) ? eventRecord.claims.length : 0), 0);
          }, 0),
          reviewed,
          duplicate_count: this.state.evidence.filter((candidate) => candidate.content_hash === item.content_hash).length - 1,
        };
      })
      .filter((item) => (filters.reviewed === undefined ? true : item.reviewed === filters.reviewed))
      .sort((a, b) => b.accessed_at.localeCompare(a.accessed_at));
  }

  async getEvidenceById(id: string, userId: string) {
    const item = this.state.evidence.find((evidence) => evidence.id === id);
    if (!item) {
      return null;
    }

    const extractions = this.state.extractions.filter((extraction) => extraction.evidence_id === id).sort(sortExtractions);
    const linkedDiscoveries = this.state.discoveries
      .filter((discovery) => discovery.evidence_ids.includes(id))
      .map((discovery) => ({
        id: discovery.id,
        pattern_type: discovery.pattern_type,
        pattern_label: discovery.pattern_label,
        status: discovery.status,
        confidence: discovery.confidence,
        severity_score: discovery.severity_score,
      }));

    return {
      ...item,
      reviewed: this.reviewedEvidenceIds(userId).has(item.id),
      duplicate_count: this.state.evidence.filter((candidate) => candidate.content_hash === item.content_hash).length - 1,
      extraction_count: extractions.length,
      extractions,
      linked_discoveries: linkedDiscoveries,
    };
  }

  async createEvidence(input: CreateEvidenceInput) {
    const existing = this.state.evidence.find((item) => item.content_hash === input.content_hash);
    if (existing) {
      return { created: false, evidence: existing };
    }

    const created: Evidence = {
      id: createId(),
      source_type: input.source_type,
      publisher: input.publisher,
      title: input.title,
      url: input.url,
      accessed_at: input.accessed_at,
      trust_tier: input.trust_tier,
      content_hash: input.content_hash,
      raw_storage_path: input.raw_storage_path,
      extracted_text_path: input.extracted_text_path,
      license_notes: input.license_notes ?? null,
    };
    this.state.evidence.unshift(created);
    return { created: true, evidence: created };
  }

  async createExtraction(input: CreateExtractionInput): Promise<Extraction> {
    const extraction: Extraction = {
      id: createId(),
      evidence_id: input.evidence_id,
      extractor_version: input.extractor_version,
      model_name: input.model_name ?? null,
      schema_version: input.schema_version,
      json_output: input.json_output,
      confidence: input.confidence,
      review_status: "pending",
      review_note: null,
      reviewed_at: null,
      reviewed_by: null,
      created_at: new Date().toISOString(),
    };
    this.state.extractions.unshift(extraction);
    return extraction;
  }

  async reviewExtraction(id: string, input: ReviewExtractionInput): Promise<Extraction> {
    const extraction = this.state.extractions.find((candidate) => candidate.id === id);
    if (!extraction) {
      throw new Error("EXTRACTION_NOT_FOUND");
    }

    extraction.review_status = input.review_status;
    extraction.review_note = input.review_note ?? null;
    extraction.reviewed_at = input.review_status === "pending" ? null : new Date().toISOString();
    extraction.reviewed_by = input.review_status === "pending" ? null : input.reviewed_by;
    return extraction;
  }

  async createUserAction(input: CreateUserActionInput): Promise<UserAction> {
    const action: UserAction = {
      id: createId(),
      user_id: input.user_id,
      action_type: input.action_type,
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      created_at: new Date().toISOString(),
    };
    this.state.userActions.unshift(action);
    return action;
  }

  async listDiscoveries(userId: string, filters: DiscoveryFilters = {}) {
    return this.state.discoveries
      .filter((discovery) => {
        if (filters.subject_type && discovery.subject_type !== filters.subject_type) {
          return false;
        }
        if (filters.subject_id && discovery.subject_id !== filters.subject_id) {
          return false;
        }
        if (filters.status && discovery.status !== filters.status) {
          return false;
        }
        if (filters.min_confidence !== undefined && discovery.confidence < filters.min_confidence) {
          return false;
        }
        return true;
      })
      .map((discovery) => ({
        ...rankDiscovery(discovery, this.state.evidence, this.state.extractions, this.state.userActions, userId),
        subject_label: this.subjectLabel(discovery.subject_type, discovery.subject_id),
      }))
      .sort((a, b) => b.severity_score - a.severity_score || b.detected_at.localeCompare(a.detected_at));
  }

  async getDiscoveryById(id: string, userId: string) {
    const discovery = this.state.discoveries.find((item) => item.id === id);
    return discovery
      ? {
          ...rankDiscovery(discovery, this.state.evidence, this.state.extractions, this.state.userActions, userId),
          subject_label: this.subjectLabel(discovery.subject_type, discovery.subject_id),
        }
      : null;
  }

  async captureDiscovery(userId: string, input: CaptureInput): Promise<Capture> {
    const discovery = this.state.discoveries.find((item) => item.id === input.discovery_id);
    if (!discovery) {
      throw new Error("DISCOVERY_NOT_FOUND");
    }

    const reviewed = this.reviewedEvidenceIds(userId);
    if (!discovery.evidence_ids.some((evidenceId) => reviewed.has(evidenceId))) {
      throw new Error("EVIDENCE_NOT_REVIEWED");
    }

    const capture: Capture = {
      id: createId(),
      user_id: userId,
      discovery_id: input.discovery_id,
      captured_at: new Date().toISOString(),
      note: input.note ?? null,
      verification_level: "viewed_evidence",
      share_token: null,
    };
    this.state.captures.unshift(capture);
    discovery.status = "captured";
    await this.createUserAction({ user_id: userId, action_type: "captured", entity_type: "capture", entity_id: capture.id });
    return capture;
  }

  async listCaptures(userId: string): Promise<Capture[]> {
    return this.state.captures.filter((capture) => capture.user_id === userId).sort((a, b) => b.captured_at.localeCompare(a.captured_at));
  }

  async shareCapture(userId: string, captureId: string): Promise<Capture> {
    const capture = this.state.captures.find((item) => item.id === captureId && item.user_id === userId);
    if (!capture) {
      throw new Error("CAPTURE_NOT_FOUND");
    }

    if (!capture.share_token) {
      capture.share_token = `share-${createId()}`;
      await this.createUserAction({ user_id: userId, action_type: "shared", entity_type: "capture", entity_id: capture.id });
    }

    return capture;
  }

  async listWatchlist(userId: string) {
    const watchedDiscoveryIds = new Set(
      this.state.userActions
        .filter((action) => action.user_id === userId && action.action_type === "flagged" && action.entity_type === "discovery")
        .map((action) => action.entity_id),
    );

    return this.state.discoveries
      .filter((discovery) => watchedDiscoveryIds.has(discovery.id))
      .map((discovery) => ({
        ...rankDiscovery(discovery, this.state.evidence, this.state.extractions, this.state.userActions, userId),
        subject_label: this.subjectLabel(discovery.subject_type, discovery.subject_id),
      }))
      .sort((a, b) => b.severity_score - a.severity_score || b.confidence - a.confidence);
  }

  async getLeaderboards(userId: string): Promise<{ subjects: LeaderboardEntry[]; patterns: LeaderboardEntry[] }> {
    const discoveries = await this.listDiscoveries(userId);
    const subjectMap = new Map<string, LeaderboardEntry>();
    const patternMap = new Map<string, LeaderboardEntry>();

    for (const discovery of discoveries) {
      const subjectKey = `${discovery.subject_type}:${discovery.subject_id}`;
      const subjectEntry = subjectMap.get(subjectKey) ?? {
        id: subjectKey,
        label: discovery.subject_label ?? subjectKey,
        score: 0,
        count: 0,
        type: "subject" as const,
      };
      subjectEntry.score += discovery.severity_score;
      subjectEntry.count += 1;
      subjectMap.set(subjectKey, subjectEntry);

      const patternEntry = patternMap.get(discovery.pattern_type) ?? {
        id: discovery.pattern_type,
        label: discovery.pattern_label,
        score: 0,
        count: 0,
        type: "pattern" as const,
      };
      patternEntry.score += discovery.severity_score;
      patternEntry.count += 1;
      patternMap.set(discovery.pattern_type, patternEntry);
    }

    return {
      subjects: Array.from(subjectMap.values()).sort((a, b) => b.score - a.score || b.count - a.count).slice(0, 5),
      patterns: Array.from(patternMap.values()).sort((a, b) => b.score - a.score || b.count - a.count).slice(0, 5),
    };
  }

  async getEntityProfile(subjectType: SubjectType, id: string, userId: string): Promise<EntityProfile | null> {
    if (subjectType === "person") {
      const person = this.state.people.find((candidate) => candidate.id === id);
      if (!person) {
        return null;
      }
      const scores = this.state.scores.filter((score) => score.subject_type === "person" && score.subject_id === id);
      const discoveries = await this.listDiscoveries(userId, { subject_type: "person", subject_id: id });
      return {
        subject_type: "person",
        person,
        scores,
        discoveries,
        timeline: this.state.events.filter((_, index) => index % this.state.people.length === this.state.people.findIndex((candidate) => candidate.id === id)),
        fragility_summary: buildFragilitySummary(scores, discoveries),
        recent_evidence: buildEvidenceHeadlines(discoveries),
      };
    }

    if (subjectType === "org") {
      const organization = this.state.organizations.find((candidate) => candidate.id === id);
      if (!organization) {
        return null;
      }
      const scores = this.state.scores.filter((score) => score.subject_type === "org" && score.subject_id === id);
      const discoveries = await this.listDiscoveries(userId, { subject_type: "org", subject_id: id });
      return {
        subject_type: "org",
        organization,
        scores,
        discoveries,
        timeline: [],
        fragility_summary: buildFragilitySummary(scores, discoveries),
        recent_evidence: buildEvidenceHeadlines(discoveries),
      };
    }

    const event = this.state.events.find((candidate) => candidate.id === id);
    if (!event) {
      return null;
    }
    const scores = this.state.scores.filter((score) => score.subject_type === "event" && score.subject_id === id);
    const discoveries = await this.listDiscoveries(userId, { subject_type: "event", subject_id: id });

    return {
      subject_type: "event",
      event,
      scores,
      discoveries,
      timeline: [event],
      fragility_summary: buildFragilitySummary(scores, discoveries),
      recent_evidence: buildEvidenceHeadlines(discoveries),
    };
  }

  async recomputeSubject(subjectType: SubjectType, subjectId: string, userId: string): Promise<RecomputeResult> {
    const subjectSignals = this.state.signals.filter((signal) => signal.subject_type === subjectType && signal.subject_id === subjectId);
    const freshScores = buildScores(subjectType, subjectId, subjectSignals);
    this.state.scores = this.state.scores.filter((score) => !(score.subject_type === subjectType && score.subject_id === subjectId));
    this.state.scores.push(...freshScores);

    const freshDiscoveries = buildDiscovery(subjectType, subjectId, subjectSignals, this.state.evidence, this.state.extractions)
      .filter((discovery) => discovery.confidence >= 0.5 && discovery.evidence_ids.length >= 2);
    this.state.discoveries = this.state.discoveries.filter((discovery) => !(discovery.subject_type === subjectType && discovery.subject_id === subjectId && discovery.detector_version === "bob_rubin_trade_v1"));
    this.state.discoveries.push(...freshDiscoveries);

    return {
      signals: subjectSignals.length,
      scores: freshScores,
      discoveries: freshDiscoveries.map((discovery) => rankDiscovery(discovery, this.state.evidence, this.state.extractions, this.state.userActions, userId)),
    };
  }

  private reviewedEvidenceIds(userId: string): Set<string> {
    return new Set(
      this.state.userActions
        .filter((action) => action.user_id === userId && action.action_type === "viewed_evidence" && action.entity_type === "evidence")
        .map((action) => action.entity_id),
    );
  }

  private subjectLabel(subjectType: SubjectType, subjectId: string): string {
    if (subjectType === "person") {
      return this.state.people.find((person) => person.id === subjectId)?.full_name ?? subjectId;
    }
    if (subjectType === "org") {
      return this.state.organizations.find((org) => org.id === subjectId)?.name ?? subjectId;
    }
    return this.state.events.find((event) => event.id === subjectId)?.title ?? subjectId;
  }
}
