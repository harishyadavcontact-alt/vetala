import { Pool } from "pg";
import { captures, demoUser, discoveries, events, evidence, extractions, organizations, people, reviewedTheses, scores, signals, userActions } from "../src/lib/seed.js";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log(
      JSON.stringify(
        {
          mode: "fixtures",
          people: people.length,
          organizations: organizations.length,
          events: events.length,
          evidence: evidence.length,
          extractions: extractions.length,
          signals: signals.length,
          scores: scores.length,
          discoveries: discoveries.length,
          reviewedTheses: reviewedTheses.length,
          captures: captures.length,
          userActions: userActions.length,
        },
        null,
        2,
      ),
    );
    return;
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO users (id, email, created_at) VALUES ($1,$2,$3) ON CONFLICT (email) DO NOTHING", [
      demoUser.id,
      demoUser.email,
      demoUser.created_at,
    ]);

    for (const person of people) {
      await client.query(
        "INSERT INTO people (id, full_name, primary_country, description) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING",
        [person.id, person.full_name, person.primary_country, person.description],
      );
    }

    for (const organization of organizations) {
      await client.query(
        "INSERT INTO organizations (id, name, org_type, country, description) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING",
        [organization.id, organization.name, organization.org_type, organization.country, organization.description],
      );
    }

    for (const event of events) {
      await client.query(
        "INSERT INTO events (id, title, category, summary, start_date, end_date, jurisdiction) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING",
        [event.id, event.title, event.category, event.summary, event.start_date, event.end_date, event.jurisdiction],
      );
    }

    for (const item of evidence) {
      await client.query(
        `INSERT INTO evidence (id, source_type, publisher, title, url, accessed_at, content_hash, raw_storage_path, extracted_text_path, trust_tier, license_notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (content_hash) DO NOTHING`,
        [item.id, item.source_type, item.publisher, item.title, item.url, item.accessed_at, item.content_hash, item.raw_storage_path, item.extracted_text_path, item.trust_tier, item.license_notes],
      );
    }

    for (const extraction of extractions) {
      await client.query(
        `INSERT INTO extractions (id, evidence_id, extractor_version, model_name, schema_version, json_output, confidence, review_status, review_note, reviewed_at, reviewed_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (id) DO NOTHING`,
        [
          extraction.id,
          extraction.evidence_id,
          extraction.extractor_version,
          extraction.model_name,
          extraction.schema_version,
          JSON.stringify(extraction.json_output),
          extraction.confidence,
          extraction.review_status,
          extraction.review_note,
          extraction.reviewed_at,
          extraction.reviewed_by,
          extraction.created_at,
        ],
      );
    }

    for (const signal of signals) {
      await client.query(
        `INSERT INTO signals (id, subject_type, subject_id, signal_type, value_numeric, value_text, evidence_id, computed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO NOTHING`,
        [signal.id, signal.subject_type, signal.subject_id, signal.signal_type, signal.value_numeric, signal.value_text, signal.evidence_id, signal.computed_at],
      );
    }

    for (const score of scores) {
      await client.query(
        `INSERT INTO scores (id, subject_type, subject_id, score_type, score_value, score_version, explanation_json, computed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO NOTHING`,
        [score.id, score.subject_type, score.subject_id, score.score_type, score.score_value, score.score_version, JSON.stringify(score.explanation_json), score.computed_at],
      );
    }

    for (const discovery of discoveries) {
      await client.query(
        `INSERT INTO discoveries (id, subject_type, subject_id, pattern_type, pattern_label, severity_score, confidence, detected_at, explanation_json, status, detector_version)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (id) DO NOTHING`,
        [discovery.id, discovery.subject_type, discovery.subject_id, discovery.pattern_type, discovery.pattern_label, discovery.severity_score, discovery.confidence, discovery.detected_at, JSON.stringify(discovery.explanation_json), discovery.status, discovery.detector_version],
      );
      for (const evidenceId of discovery.evidence_ids) {
        await client.query(
          "INSERT INTO discovery_evidence (discovery_id, evidence_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
          [discovery.id, evidenceId],
        );
      }
    }

    for (const thesis of reviewedTheses) {
      await client.query(
        `INSERT INTO reviewed_theses (
           id, user_id, discovery_id, subject_type, subject_id, pattern_type, thesis_statement,
           supporting_evidence_ids, supporting_extraction_ids, confidence_label, analyst_note, created_at, updated_at
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (user_id, discovery_id) DO NOTHING`,
        [
          thesis.id,
          thesis.user_id,
          thesis.discovery_id,
          thesis.subject_type,
          thesis.subject_id,
          thesis.pattern_type,
          thesis.thesis_statement,
          thesis.supporting_evidence_ids,
          thesis.supporting_extraction_ids,
          thesis.confidence_label,
          thesis.analyst_note,
          thesis.created_at,
          thesis.updated_at,
        ],
      );
    }

    for (const capture of captures) {
      await client.query(
        `INSERT INTO captures (id, user_id, discovery_id, captured_at, note, verification_level, share_token)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (id) DO NOTHING`,
        [capture.id, capture.user_id, capture.discovery_id, capture.captured_at, capture.note, capture.verification_level, capture.share_token],
      );
    }

    for (const action of userActions) {
      await client.query(
        `INSERT INTO user_actions (id, user_id, action_type, entity_type, entity_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO NOTHING`,
        [action.id, action.user_id, action.action_type, action.entity_type, action.entity_id, action.created_at],
      );
    }

    await client.query("COMMIT");
    console.log("Seeded Vetala demo workspace.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

void main();
