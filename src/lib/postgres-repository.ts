import { Pool } from "pg";
import { buildDiscovery, buildEvidenceHeadlines, buildFragilitySummary, buildScores, rankDiscovery } from "./domain.js";
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

const asNumber = (value: unknown): number => (typeof value === "number" ? value : Number(value));

export class PostgresRepository implements Repository {
  constructor(private readonly pool: Pool) {}

  async getDefaultUser(): Promise<User> {
    const result = await this.pool.query("SELECT id, email, created_at FROM users ORDER BY created_at ASC LIMIT 1");
    if (result.rowCount === 0) {
      throw new Error("NO_USERS");
    }
    return result.rows[0];
  }

  async getUserById(id: string): Promise<User | null> {
    const result = await this.pool.query("SELECT id, email, created_at FROM users WHERE id = $1", [id]);
    return result.rowCount === 0 ? null : result.rows[0];
  }

  async search(query: string, type: string): Promise<SearchResults> {
    const q = `%${query.toLowerCase()}%`;
    const [people, orgs, events] = await Promise.all([
      type === "all" || type === "people"
        ? this.pool.query("SELECT id, full_name, primary_country, description FROM people WHERE LOWER(full_name) LIKE $1 ORDER BY full_name LIMIT 25", [q])
        : Promise.resolve({ rows: [] }),
      type === "all" || type === "orgs"
        ? this.pool.query("SELECT id, name, org_type, country, description FROM organizations WHERE LOWER(name) LIKE $1 ORDER BY name LIMIT 25", [q])
        : Promise.resolve({ rows: [] }),
      type === "all" || type === "events"
        ? this.pool.query("SELECT id, title, category, summary, start_date, end_date, jurisdiction FROM events WHERE LOWER(title) LIKE $1 ORDER BY title LIMIT 25", [q])
        : Promise.resolve({ rows: [] }),
    ]);

    return {
      people: people.rows,
      orgs: orgs.rows,
      events: events.rows,
    };
  }

  async listEvidence(userId: string, filters: EvidenceListFilters = {}): Promise<EvidenceListItem[]> {
    const evidenceRows = await this.pool.query<Evidence>(
      `SELECT id, source_type, publisher, COALESCE(title, '') AS title, url, accessed_at::text, trust_tier, content_hash, raw_storage_path, extracted_text_path, license_notes
       FROM evidence
       ORDER BY accessed_at DESC`,
    );
    const evidenceIds = evidenceRows.rows.map((row) => row.id);
    const extractions = evidenceIds.length === 0 ? [] : await this.loadExtractionsForEvidence(evidenceIds);
    const actions = await this.loadUserActions(userId);

    return evidenceRows.rows
      .map((row) => {
        const rowExtractions = extractions.filter((extraction) => extraction.evidence_id === row.id);
        const reviewed = actions.some((action) => action.action_type === "viewed_evidence" && action.entity_id === row.id);
        return {
          ...row,
          extraction_count: rowExtractions.length,
          claim_count: rowExtractions.reduce((sum, extraction) => sum + this.claimCount(extraction), 0),
          reviewed,
          duplicate_count: evidenceRows.rows.filter((candidate) => candidate.content_hash === row.content_hash).length - 1,
        };
      })
      .filter((item) => (filters.reviewed === undefined ? true : item.reviewed === filters.reviewed));
  }

  async getEvidenceById(id: string, userId: string) {
    const result = await this.pool.query<Evidence>(
      `SELECT id, source_type, publisher, COALESCE(title, '') AS title, url, accessed_at::text, trust_tier, content_hash, raw_storage_path, extracted_text_path, license_notes
       FROM evidence WHERE id = $1`,
      [id],
    );
    if (result.rowCount === 0) {
      return null;
    }

    const item = result.rows[0];
    const [extractions, actions, linked] = await Promise.all([
      this.loadExtractionsForEvidence([id]),
      this.loadUserActions(userId),
      this.pool.query(
        `SELECT id, pattern_type, pattern_label, status, confidence, severity_score
         FROM discoveries
         WHERE id IN (SELECT discovery_id FROM discovery_evidence WHERE evidence_id = $1)`,
        [id],
      ),
    ]);

    const duplicateCountResult = await this.pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM evidence WHERE content_hash = $1",
      [item.content_hash],
    );

    return {
      ...item,
      reviewed: actions.some((action) => action.action_type === "viewed_evidence" && action.entity_id === item.id),
      duplicate_count: Number(duplicateCountResult.rows[0].count) - 1,
      extraction_count: extractions.length,
      extractions,
      linked_discoveries: linked.rows,
    };
  }

  async createEvidence(input: CreateEvidenceInput) {
    const existing = await this.pool.query<Evidence>(
      `SELECT id, source_type, publisher, COALESCE(title, '') AS title, url, accessed_at::text, trust_tier, content_hash, raw_storage_path, extracted_text_path, license_notes
       FROM evidence WHERE content_hash = $1`,
      [input.content_hash],
    );
    if (existing.rowCount !== 0) {
      return { created: false, evidence: existing.rows[0] };
    }

    const inserted = await this.pool.query<Evidence>(
      `INSERT INTO evidence (source_type, publisher, title, url, accessed_at, content_hash, raw_storage_path, extracted_text_path, trust_tier, license_notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id, source_type, publisher, COALESCE(title, '') AS title, url, accessed_at::text, trust_tier, content_hash, raw_storage_path, extracted_text_path, license_notes`,
      [
        input.source_type,
        input.publisher,
        input.title,
        input.url,
        input.accessed_at,
        input.content_hash,
        input.raw_storage_path,
        input.extracted_text_path,
        input.trust_tier,
        input.license_notes ?? null,
      ],
    );
    return { created: true, evidence: inserted.rows[0] };
  }

  async createExtraction(input: CreateExtractionInput): Promise<Extraction> {
    const result = await this.pool.query<Extraction>(
      `INSERT INTO extractions (evidence_id, extractor_version, model_name, schema_version, json_output, confidence, review_status, review_note, reviewed_at, reviewed_by)
       VALUES ($1,$2,$3,$4,$5,$6,'pending',NULL,NULL,NULL)
       RETURNING id, evidence_id, extractor_version, model_name, schema_version, json_output, confidence, review_status, review_note, reviewed_at::text, reviewed_by::text, created_at::text`,
      [input.evidence_id, input.extractor_version, input.model_name ?? null, input.schema_version, JSON.stringify(input.json_output), input.confidence],
    );
    return this.normalizeExtraction(result.rows[0]);
  }

  async reviewExtraction(id: string, input: ReviewExtractionInput): Promise<Extraction> {
    const result = await this.pool.query<Extraction>(
      `UPDATE extractions
       SET review_status = $2,
           review_note = $3,
           reviewed_at = CASE WHEN $2 = 'pending' THEN NULL ELSE now() END,
           reviewed_by = CASE WHEN $2 = 'pending' THEN NULL ELSE $4::uuid END
       WHERE id = $1
       RETURNING id, evidence_id, extractor_version, model_name, schema_version, json_output, confidence, review_status, review_note, reviewed_at::text, reviewed_by::text, created_at::text`,
      [id, input.review_status, input.review_note ?? null, input.reviewed_by],
    );
    if (result.rowCount === 0) {
      throw new Error("EXTRACTION_NOT_FOUND");
    }
    return this.normalizeExtraction(result.rows[0]);
  }

  async createUserAction(input: CreateUserActionInput): Promise<UserAction> {
    const result = await this.pool.query<UserAction>(
      `INSERT INTO user_actions (user_id, action_type, entity_type, entity_id)
       VALUES ($1,$2,$3,$4)
       RETURNING id, user_id, action_type, entity_type, entity_id, created_at::text`,
      [input.user_id, input.action_type, input.entity_type, input.entity_id],
    );
    return result.rows[0];
  }

  async listDiscoveries(userId: string, filters: DiscoveryFilters = {}) {
    const conditions: string[] = [];
    const values: Array<string | number> = [];

    if (filters.subject_type) {
      values.push(filters.subject_type);
      conditions.push(`subject_type = $${values.length}`);
    }
    if (filters.subject_id) {
      values.push(filters.subject_id);
      conditions.push(`subject_id = $${values.length}`);
    }
    if (filters.status) {
      values.push(filters.status);
      conditions.push(`status = $${values.length}`);
    }
    if (filters.min_confidence !== undefined) {
      values.push(filters.min_confidence);
      conditions.push(`confidence >= $${values.length}`);
    }

    const result = await this.pool.query<Discovery>(
      `SELECT id, subject_type, subject_id, pattern_type, pattern_label, severity_score, confidence, detected_at::text, explanation_json, status,
              ARRAY(SELECT evidence_id FROM discovery_evidence WHERE discovery_id = discoveries.id) AS evidence_ids,
              COALESCE(detector_version, 'bob_rubin_trade_v1') AS detector_version
       FROM discoveries
       ${conditions.length === 0 ? "" : `WHERE ${conditions.join(" AND ")}`}
       ORDER BY severity_score DESC, detected_at DESC`,
      values,
    );

    return this.rankDiscoveries(result.rows.map((row) => this.normalizeDiscovery(row)), userId);
  }

  async getDiscoveryById(id: string, userId: string) {
    const result = await this.pool.query<Discovery>(
      `SELECT id, subject_type, subject_id, pattern_type, pattern_label, severity_score, confidence, detected_at::text, explanation_json, status,
              ARRAY(SELECT evidence_id FROM discovery_evidence WHERE discovery_id = discoveries.id) AS evidence_ids,
              COALESCE(detector_version, 'bob_rubin_trade_v1') AS detector_version
       FROM discoveries WHERE id = $1`,
      [id],
    );
    if (result.rowCount === 0) {
      return null;
    }

    const ranked = await this.rankDiscoveries(result.rows.map((row) => this.normalizeDiscovery(row)), userId);
    return ranked[0] ?? null;
  }

  async captureDiscovery(userId: string, input: CaptureInput): Promise<Capture> {
    const discovery = await this.getDiscoveryById(input.discovery_id, userId);
    if (!discovery) {
      throw new Error("DISCOVERY_NOT_FOUND");
    }
    if (discovery.summary.reviewed_evidence_count === 0) {
      throw new Error("EVIDENCE_NOT_REVIEWED");
    }

    const result = await this.pool.query<Capture>(
      `INSERT INTO captures (user_id, discovery_id, note, verification_level)
       VALUES ($1,$2,$3,'viewed_evidence')
       RETURNING id, user_id, discovery_id, captured_at::text, note, verification_level, share_token`,
      [userId, input.discovery_id, input.note ?? null],
    );
    await this.pool.query("UPDATE discoveries SET status = 'captured' WHERE id = $1", [input.discovery_id]);
    await this.createUserAction({ user_id: userId, action_type: "captured", entity_type: "capture", entity_id: result.rows[0].id });
    return result.rows[0];
  }

  async listCaptures(userId: string): Promise<Capture[]> {
    const result = await this.pool.query<Capture>(
      `SELECT id, user_id, discovery_id, captured_at::text, note, verification_level, share_token
       FROM captures WHERE user_id = $1 ORDER BY captured_at DESC`,
      [userId],
    );
    return result.rows;
  }

  async shareCapture(userId: string, captureId: string): Promise<Capture> {
    const existing = await this.pool.query<Capture>(
      `SELECT id, user_id, discovery_id, captured_at::text, note, verification_level, share_token
       FROM captures WHERE id = $1 AND user_id = $2`,
      [captureId, userId],
    );
    if (existing.rowCount === 0) {
      throw new Error("CAPTURE_NOT_FOUND");
    }

    if (existing.rows[0].share_token) {
      return existing.rows[0];
    }

    const shared = await this.pool.query<Capture>(
      `UPDATE captures SET share_token = 'share-' || replace(uuid_generate_v4()::text, '-', '')
       WHERE id = $1 AND user_id = $2
       RETURNING id, user_id, discovery_id, captured_at::text, note, verification_level, share_token`,
      [captureId, userId],
    );
    await this.createUserAction({ user_id: userId, action_type: "shared", entity_type: "capture", entity_id: captureId });
    return shared.rows[0];
  }

  async listWatchlist(userId: string) {
    const watchlistRows = await this.pool.query<{ entity_id: string }>(
      `SELECT entity_id::text
       FROM user_actions
       WHERE user_id = $1 AND action_type = 'flagged' AND entity_type = 'discovery'
       ORDER BY created_at DESC`,
      [userId],
    );
    const ids = watchlistRows.rows.map((row) => row.entity_id);
    if (ids.length === 0) {
      return [];
    }
    const discoveries = await this.pool.query<Discovery>(
      `SELECT id, subject_type, subject_id, pattern_type, pattern_label, severity_score, confidence, detected_at::text, explanation_json, status,
              ARRAY(SELECT evidence_id FROM discovery_evidence WHERE discovery_id = discoveries.id) AS evidence_ids,
              COALESCE(detector_version, 'bob_rubin_trade_v1') AS detector_version
       FROM discoveries WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    return this.rankDiscoveries(discoveries.rows.map((row) => this.normalizeDiscovery(row)), userId);
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
      const person = await this.pool.query<Person>("SELECT id, full_name, primary_country, description FROM people WHERE id = $1", [id]);
      if (person.rowCount === 0) {
        return null;
      }
      const scores = await this.loadScores(subjectType, id);
      const discoveries = await this.listDiscoveries(userId, { subject_type: "person", subject_id: id });
      return {
        subject_type: "person",
        person: person.rows[0],
        scores,
        discoveries,
        timeline: (await this.pool.query<Event>("SELECT id, title, category, summary, start_date::text, end_date::text, jurisdiction FROM events ORDER BY start_date DESC LIMIT 5")).rows,
        fragility_summary: buildFragilitySummary(scores, discoveries),
        recent_evidence: buildEvidenceHeadlines(discoveries),
      };
    }

    if (subjectType === "org") {
      const organization = await this.pool.query<Organization>("SELECT id, name, org_type, country, description FROM organizations WHERE id = $1", [id]);
      if (organization.rowCount === 0) {
        return null;
      }
      const scores = await this.loadScores(subjectType, id);
      const discoveries = await this.listDiscoveries(userId, { subject_type: "org", subject_id: id });
      return {
        subject_type: "org",
        organization: organization.rows[0],
        scores,
        discoveries,
        timeline: [],
        fragility_summary: buildFragilitySummary(scores, discoveries),
        recent_evidence: buildEvidenceHeadlines(discoveries),
      };
    }

    const event = await this.pool.query<Event>("SELECT id, title, category, summary, start_date::text, end_date::text, jurisdiction FROM events WHERE id = $1", [id]);
    if (event.rowCount === 0) {
      return null;
    }
    const scores = await this.loadScores(subjectType, id);
    const discoveries = await this.listDiscoveries(userId, { subject_type: "event", subject_id: id });
    return {
      subject_type: "event",
      event: event.rows[0],
      scores,
      discoveries,
      timeline: event.rows,
      fragility_summary: buildFragilitySummary(scores, discoveries),
      recent_evidence: buildEvidenceHeadlines(discoveries),
    };
  }

  async recomputeSubject(subjectType: SubjectType, subjectId: string, userId: string): Promise<RecomputeResult> {
    const subjectSignals = await this.loadSignals(subjectType, subjectId);
    const scores = buildScores(subjectType, subjectId, subjectSignals);
    await this.pool.query("DELETE FROM scores WHERE subject_type = $1 AND subject_id = $2", [subjectType, subjectId]);

    for (const score of scores) {
      await this.pool.query(
        `INSERT INTO scores (id, subject_type, subject_id, score_type, score_value, score_version, explanation_json, computed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [score.id, score.subject_type, score.subject_id, score.score_type, score.score_value, score.score_version, JSON.stringify(score.explanation_json), score.computed_at],
      );
    }

    const evidence = await this.loadEvidenceForIds(
      Array.from(new Set(subjectSignals.map((signal) => signal.evidence_id).filter((value): value is string => Boolean(value)))),
    );
    const extractions = evidence.length === 0 ? [] : await this.loadExtractionsForEvidence(evidence.map((item) => item.id));
    const discoveries = buildDiscovery(subjectType, subjectId, subjectSignals, evidence, extractions)
      .filter((discovery) => discovery.confidence >= 0.5 && discovery.evidence_ids.length >= 2);

    await this.pool.query("DELETE FROM discovery_evidence WHERE discovery_id IN (SELECT id FROM discoveries WHERE subject_type = $1 AND subject_id = $2)", [subjectType, subjectId]);
    await this.pool.query("DELETE FROM discoveries WHERE subject_type = $1 AND subject_id = $2", [subjectType, subjectId]);

    for (const discovery of discoveries) {
      await this.pool.query(
        `INSERT INTO discoveries (id, subject_type, subject_id, pattern_type, pattern_label, severity_score, confidence, detected_at, explanation_json, status, detector_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [discovery.id, discovery.subject_type, discovery.subject_id, discovery.pattern_type, discovery.pattern_label, discovery.severity_score, discovery.confidence, discovery.detected_at, JSON.stringify(discovery.explanation_json), discovery.status, discovery.detector_version],
      );
      for (const evidenceId of discovery.evidence_ids) {
        await this.pool.query("INSERT INTO discovery_evidence (discovery_id, evidence_id) VALUES ($1,$2)", [discovery.id, evidenceId]);
      }
    }

    return {
      signals: subjectSignals.length,
      scores,
      discoveries: await this.rankDiscoveries(discoveries, userId),
    };
  }

  private async rankDiscoveries(discoveries: Discovery[], userId: string) {
    const evidenceIds = Array.from(new Set(discoveries.flatMap((discovery) => discovery.evidence_ids)));
    const [evidence, extractions, actions] = await Promise.all([
      this.loadEvidenceForIds(evidenceIds),
      this.loadExtractionsForEvidence(evidenceIds),
      this.loadUserActions(userId),
    ]);
    const labels = await this.loadSubjectLabels(discoveries);
    return discoveries.map((discovery) => ({
      ...rankDiscovery(discovery, evidence, extractions, actions, userId),
      subject_label: labels.get(`${discovery.subject_type}:${discovery.subject_id}`) ?? discovery.subject_id,
    }));
  }

  private normalizeDiscovery(row: Discovery): Discovery {
    return {
      ...row,
      confidence: asNumber(row.confidence),
      severity_score: asNumber(row.severity_score),
    };
  }

  private async loadEvidenceForIds(ids: string[]): Promise<Evidence[]> {
    if (ids.length === 0) {
      return [];
    }
    const result = await this.pool.query<Evidence>(
      `SELECT id, source_type, publisher, COALESCE(title, '') AS title, url, accessed_at::text, trust_tier, content_hash, raw_storage_path, extracted_text_path, license_notes
       FROM evidence WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    return result.rows;
  }

  private async loadExtractionsForEvidence(ids: string[]): Promise<Extraction[]> {
    if (ids.length === 0) {
      return [];
    }
    const result = await this.pool.query<Extraction>(
      `SELECT id, evidence_id, extractor_version, model_name, schema_version, json_output, confidence, review_status, review_note, reviewed_at::text, reviewed_by::text, created_at::text
       FROM extractions
       WHERE evidence_id = ANY($1::uuid[])
       ORDER BY
         CASE review_status WHEN 'reviewed' THEN 0 WHEN 'challenged' THEN 1 ELSE 2 END,
         created_at DESC,
         id ASC`,
      [ids],
    );
    return result.rows.map((row) => this.normalizeExtraction(row));
  }

  private normalizeExtraction(row: Extraction): Extraction {
    return {
      ...row,
      confidence: asNumber(row.confidence),
      review_note: row.review_note ?? null,
      reviewed_at: row.reviewed_at ?? null,
      reviewed_by: row.reviewed_by ?? null,
    };
  }

  private async loadSignals(subjectType: SubjectType, subjectId: string): Promise<Signal[]> {
    const result = await this.pool.query<Signal>(
      `SELECT id, subject_type, subject_id, signal_type, value_numeric, value_text, evidence_id, computed_at::text
       FROM signals WHERE subject_type = $1 AND subject_id = $2`,
      [subjectType, subjectId],
    );
    return result.rows.map((row) => ({ ...row, value_numeric: row.value_numeric === null ? null : asNumber(row.value_numeric) }));
  }

  private async loadScores(subjectType: SubjectType, subjectId: string): Promise<Score[]> {
    const result = await this.pool.query<Score>(
      `SELECT id, subject_type, subject_id, score_type, score_value, score_version, explanation_json, computed_at::text
       FROM scores WHERE subject_type = $1 AND subject_id = $2 ORDER BY computed_at DESC`,
      [subjectType, subjectId],
    );
    return result.rows.map((row) => ({ ...row, score_value: asNumber(row.score_value) }));
  }

  private async loadUserActions(userId: string): Promise<UserAction[]> {
    const result = await this.pool.query<UserAction>(
      `SELECT id, user_id, action_type, entity_type, entity_id::text, created_at::text
       FROM user_actions WHERE user_id = $1`,
      [userId],
    );
    return result.rows;
  }

  private claimCount(extraction: Extraction): number {
    const events = Array.isArray(extraction.json_output.events) ? extraction.json_output.events : [];
    return events.reduce((sum, eventRecord) => {
      if (!eventRecord || typeof eventRecord !== "object" || !Array.isArray((eventRecord as { claims?: unknown[] }).claims)) {
        return sum;
      }
      return sum + (eventRecord as { claims: unknown[] }).claims.length;
    }, 0);
  }

  private async loadSubjectLabels(discoveries: Discovery[]): Promise<Map<string, string>> {
    const labels = new Map<string, string>();
    const personIds = Array.from(new Set(discoveries.filter((item) => item.subject_type === "person").map((item) => item.subject_id)));
    const orgIds = Array.from(new Set(discoveries.filter((item) => item.subject_type === "org").map((item) => item.subject_id)));
    const eventIds = Array.from(new Set(discoveries.filter((item) => item.subject_type === "event").map((item) => item.subject_id)));

    if (personIds.length > 0) {
      const people = await this.pool.query<{ id: string; full_name: string }>("SELECT id, full_name FROM people WHERE id = ANY($1::uuid[])", [personIds]);
      for (const row of people.rows) {
        labels.set(`person:${row.id}`, row.full_name);
      }
    }

    if (orgIds.length > 0) {
      const orgs = await this.pool.query<{ id: string; name: string }>("SELECT id, name FROM organizations WHERE id = ANY($1::uuid[])", [orgIds]);
      for (const row of orgs.rows) {
        labels.set(`org:${row.id}`, row.name);
      }
    }

    if (eventIds.length > 0) {
      const events = await this.pool.query<{ id: string; title: string }>("SELECT id, title FROM events WHERE id = ANY($1::uuid[])", [eventIds]);
      for (const row of events.rows) {
        labels.set(`event:${row.id}`, row.title);
      }
    }

    return labels;
  }
}
