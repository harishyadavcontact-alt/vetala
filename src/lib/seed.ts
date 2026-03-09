import { randomUUID } from "node:crypto";
import { computeFs, computeScoreFromSignals, detectBobRubinTrade } from "./scoring.js";
import type {
  Capture,
  Discovery,
  Event,
  Evidence,
  Extraction,
  Organization,
  PatternType,
  Person,
  Score,
  Signal,
  User,
  UserAction,
} from "./types.js";

const toSignalInputs = (items: Signal[]) =>
  items.map((signal) => ({
    signal_type: signal.signal_type,
    value_numeric: signal.value_numeric ?? undefined,
  }));

const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, "0")}`;
const now = Date.now();

export const demoUser: User = {
  id: uuid(900),
  email: "demo@vetala.local",
  created_at: new Date(now - 30 * 86400000).toISOString(),
};

const personSeeds = [
  ["Adrian Vale", "Central banker with repeated public downside after stability messaging."],
  ["Mira Sethi", "Bank chair insulated from tail risk through compensation and tenure."],
  ["Jonah Pryce", "Regulator turned board adviser after emergency market interventions."],
  ["Elena Ward", "Policy architect whose downside lands on households and taxpayers."],
  ["Marcus Flint", "Crisis manager with recurring bailout fingerprints."],
  ["Leila Mercer", "Treasury official linked to subsidy-heavy rescue structures."],
  ["Noah Keane", "Exchange executive with fee upside and diffuse systemic downside."],
  ["Sara Voss", "Public health adviser associated with repeated intervention whiplash."],
  ["Elias Hart", "Chief risk officer who suppresses visible volatility until rupture."],
  ["Talia Rowan", "Cabinet-level allocator with low personal downside and high public exposure."],
  ["Victor Shaw", "Think tank operator promoting complexity-heavy policy cover."],
  ["Nina Doyle", "Energy regulator tied to subsidy loops and lagged public costs."],
  ["Omar Finch", "Board member exiting before balance-sheet fragility reprices."],
  ["Priya Lorne", "Infrastructure minister linked to headline upside and socialized losses."],
  ["Caleb Stroud", "Insurance executive benefiting from opaque catastrophe transfer."],
  ["Maya Quinn", "Committee chair with repeated emergency-policy reversals."],
  ["Rohan Price", "Sovereign fund manager rewarded for carry with hidden convexity."],
  ["Iris Cole", "Credit strategist whose policy calls backfire under stress."],
  ["Daniel Rhys", "Platform operator externalizing operational losses to counterparties."],
  ["Sana Brooks", "Macro adviser with strong narrative control and weak downside exposure."],
] as const;

export const people: Person[] = personSeeds.map(([full_name, description], i) => ({
  id: uuid(i + 1),
  full_name,
  primary_country: i % 2 === 0 ? "US" : "UK",
  description,
}));

const organizationSeeds = [
  ["Helix Capital", "corp"],
  ["Northbridge Bank", "corp"],
  ["Public Stability Board", "agency"],
  ["Meridian Exchange", "corp"],
  ["Civic Risk Office", "agency"],
  ["Atlas Subsidy Forum", "thinktank"],
  ["Open Ledger Watch", "ngo"],
  ["Harbor Insurance Group", "corp"],
  ["National Energy Authority", "agency"],
  ["Crown Policy Institute", "thinktank"],
] as const;

export const organizations: Organization[] = organizationSeeds.map(([name, org_type], i) => ({
  id: uuid(100 + i + 1),
  name,
  org_type,
  country: i % 2 === 0 ? "US" : "UK",
  description: `${name} is tracked for fragility transfer, intervention incentives, and downstream public harm.`,
}));

const eventSeeds = [
  "Emergency liquidity backstop expanded after stress warning",
  "Advisory official joins rescued lender board",
  "Stress test waiver granted ahead of balance-sheet losses",
  "Subsidy package shifts downside to taxpayers",
  "Public statement downplays tail-risk exposure",
  "Fee pool expands while customer losses mount",
  "Intervention repeated after prior documented failure",
  "Capital buffer softened during volatility suppression push",
  "Post-crisis bonus pool retained despite public losses",
  "Committee vote privileges short-term calm over long-term resilience",
];

export const events: Event[] = Array.from({ length: 30 }, (_, i) => ({
  id: uuid(200 + i + 1),
  title: eventSeeds[i % eventSeeds.length],
  category: ["policy", "vote", "reg_action", "corp_action", "advisory", "forecast", "public_statement", "other"][i % 8] as Event["category"],
  summary: `Tracked event linking intervention, asymmetry, and potential downside transfer case ${i + 1}.`,
  start_date: new Date(now - i * 86400000 * 3).toISOString().slice(0, 10),
  end_date: null,
  jurisdiction: i % 2 === 0 ? "US" : "UK",
}));

export const evidence: Evidence[] = Array.from({ length: 60 }, (_, i) => ({
  id: uuid(300 + i + 1),
  source_type: (i % 4 === 0 ? "watchdog_db" : i % 3 === 0 ? "filing" : "news") as Evidence["source_type"],
  publisher: i % 4 === 0 ? "OpenSecrets" : i % 5 === 0 ? "SEC" : `Publisher ${i + 1}`,
  title: `Evidence ${i + 1}`,
  url: `https://example.org/evidence/${i + 1}`,
  accessed_at: new Date(now - i * 86400000).toISOString(),
  trust_tier: ((i % 4) + 1) as 1 | 2 | 3 | 4,
  content_hash: `hash-${Math.floor(i / 2)}`,
  raw_storage_path: `/raw/evidence-${i + 1}.html`,
  extracted_text_path: `/extracted/evidence-${i + 1}.txt`,
  license_notes: null,
}));

export const extractions: Extraction[] = evidence.slice(0, 24).map((item, i) => ({
  id: uuid(600 + i + 1),
  evidence_id: item.id,
  extractor_version: "extractor_v1",
  model_name: "manual-seed",
  schema_version: "extraction_v1",
  confidence: 0.7 + (i % 3) * 0.1,
  created_at: new Date(now - i * 43200000).toISOString(),
  json_output: {
    people: [{ name: people[i % people.length].full_name, aliases: [], country: people[i % people.length].primary_country, confidence: 0.88 }],
    orgs: [{ name: organizations[i % organizations.length].name, org_type: organizations[i % organizations.length].org_type, country: organizations[i % organizations.length].country, confidence: 0.79 }],
    events: [{ title: events[i % events.length].title, category: events[i % events.length].category, start_date: events[i % events.length].start_date, end_date: "null", jurisdiction: events[i % events.length].jurisdiction, participants: [], outcomes: [], claims: [{ claim_text: `Claim ${i + 1}`, evidence_quote: `Quote for evidence ${i + 1}`, confidence: 0.83 }], confidence: 0.82 }],
    fragility_assessment: {
      primary_subject: {
        person_name: people[i % people.length].full_name,
        org_name: organizations[i % organizations.length].name,
        role: i % 2 === 0 ? "Executive" : "Regulator",
        confidence: 0.85,
      },
      intervention_type: (i % 3 === 0 ? "bailout" : i % 2 === 0 ? "policy" : "regulatory") as "bailout" | "policy" | "regulatory",
      convexity_profile: (i % 2 === 0 ? "short_vol" : "unclear") as "short_vol" | "unclear",
      downside_bearers: [
        {
          party: i % 2 === 0 ? "taxpayers" : "public",
          loss_channel: i % 2 === 0 ? "absorbed losses after intervention" : "policy downside shifted to diffuse users",
          confidence: 0.8,
        },
      ],
      upside_beneficiaries: [
        {
          beneficiary_name: people[i % people.length].full_name,
          beneficiary_type: "person",
          gain_channel: i % 2 === 0 ? "bonus retention" : "career insulation",
          confidence: 0.81,
        },
      ],
      fragility_mechanisms: [
        i % 3 === 0 ? "rubin_trade" : "fragilista",
        i % 4 === 0 ? "iatrogenic_intervention" : "bailout_to_boardroom",
      ],
      monitoring_cues: [
        "asymmetric upside with delayed public downside",
        "recurring intervention language",
      ],
    },
    meta: { extraction_notes: "Seed extraction" },
  },
}));

export const signals: Signal[] = people.flatMap((person, i) => {
  const signalSet = [
    { signal_type: "insulated_role", value_numeric: 1, evidence_id: evidence[i % evidence.length].id },
    { signal_type: "authority_level_high", value_numeric: i % 3 === 0 ? 1 : 0.6, evidence_id: evidence[(i + 1) % evidence.length].id },
    { signal_type: "taxpayer_cost_mentioned", value_numeric: i % 2 === 0 ? 1 : 0.5, evidence_id: evidence[(i + 2) % evidence.length].id },
    { signal_type: "moral_hazard_created", value_numeric: i % 4 === 0 ? 1 : 0.4, evidence_id: evidence[(i + 3) % evidence.length].id },
    { signal_type: "intervention_backfire_documented", value_numeric: i % 5 === 0 ? 1 : 0.3, evidence_id: evidence[(i + 4) % evidence.length].id },
    { signal_type: "revolving_door_role_change", value_numeric: i % 4 === 0 ? 0.85 : 0.35, evidence_id: evidence[(i + 5) % evidence.length].id },
    { signal_type: "regulatory_overlap", value_numeric: i % 3 === 0 ? 0.8 : 0.2, evidence_id: evidence[(i + 6) % evidence.length].id },
    { signal_type: "repeated_interventions_same_failure", value_numeric: i % 5 === 0 ? 0.75 : 0.25, evidence_id: evidence[(i + 7) % evidence.length].id },
    { signal_type: "public_harm_policy", value_numeric: i % 2 === 0 ? 0.8 : 0.3, evidence_id: evidence[(i + 8) % evidence.length].id },
    { signal_type: "bailout_or_subsidy", value_numeric: i % 3 === 0 ? 0.9 : 0.2, evidence_id: evidence[(i + 9) % evidence.length].id },
    { signal_type: "shareholder_loss_large", value_numeric: i % 4 === 0 ? 0.85 : 0.25, evidence_id: evidence[(i + 10) % evidence.length].id },
  ];

  return signalSet.map((signal, signalIndex) => ({
    id: uuid(700 + i * 10 + signalIndex + 1),
    subject_type: "person" as const,
    subject_id: person.id,
    signal_type: signal.signal_type,
    value_numeric: signal.value_numeric,
    value_text: null,
    evidence_id: signal.evidence_id,
    computed_at: new Date(now - (i + signalIndex) * 3600000).toISOString(),
  }));
});

const scoreExplanation = (scoreType: Score["score_type"], subjectSignals: Signal[], value: number) => ({
  score_type: scoreType,
  score_version: "score_v1",
  signals: subjectSignals
    .filter((signal) => signal.value_numeric !== null)
    .map((signal) => ({
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
});

export const scores: Score[] = people.flatMap((person, i) => {
  const subjectSignals = signals.filter((signal) => signal.subject_id === person.id);
  const scoreInputs = toSignalInputs(subjectSignals);
  const sitg = computeScoreFromSignals("SITG", scoreInputs);
  const eli = computeScoreFromSignals("ELI", scoreInputs);
  const fcs = computeScoreFromSignals("FCS", scoreInputs);
  const ii = computeScoreFromSignals("II", scoreInputs);
  const fs = computeFs(sitg, eli, fcs, ii, i % 2 === 0 ? 5 : 0);

  return ([
    ["SITG", sitg],
    ["ELI", eli],
    ["FCS", fcs],
    ["II", ii],
    ["FS", fs],
  ] as const).map(([score_type, score_value], scoreIndex) => ({
    id: uuid(1000 + i * 10 + scoreIndex + 1),
    subject_type: "person" as const,
    subject_id: person.id,
    score_type,
    score_value,
    score_version: "score_v1",
    explanation_json: scoreExplanation(score_type, subjectSignals, score_value),
    computed_at: new Date(now - i * 3600000).toISOString(),
  }));
});

const patternTypes: PatternType[] = [
  "BOB_RUBIN_TRADE",
  "REVOLVING_DOOR",
  "BAILOUT_TO_BOARDROOM",
  "COMPLEXITY_ARBITRAGE",
  "POSTDICTING_STIGLITZ",
  "IATROGENIC_INTERVENTION",
];

export const discoveries: Discovery[] = Array.from({ length: 30 }, (_, i) => {
  const subject = people[i % people.length];
  const linkedEvidence = [evidence[i % evidence.length], evidence[(i + 1) % evidence.length]];
  const seededDetection = detectBobRubinTrade({
    authority_level_proxy: 0.7 + (i % 3) * 0.1,
    externalized_loss_proxy: 0.65 + (i % 2) * 0.15,
    sitg_gap_proxy: 0.6 + (i % 4) * 0.08,
    persistence_proxy: 0.45 + (i % 4) * 0.1,
    evidence_tiers: linkedEvidence.map((item) => item.trust_tier),
    evidence_ids: linkedEvidence.map((item) => item.id),
    avg_extraction_confidence: 0.84,
    source_diversity_score: linkedEvidence[0].publisher === linkedEvidence[1].publisher ? 0.5 : 1,
    evidence_quality_score: linkedEvidence.some((item) => item.trust_tier <= 2) ? 0.8 : 0.5,
  });

  return {
    id: uuid(400 + i + 1),
    subject_type: "person",
    subject_id: subject.id,
    pattern_type: seededDetection?.pattern_type ?? patternTypes[i % patternTypes.length],
    pattern_label: seededDetection?.explanation_json.pattern_label as string ?? `${patternTypes[i % patternTypes.length]} detected`,
    severity_score: seededDetection?.severity_score ?? 40 + (i % 50),
    confidence: seededDetection?.confidence ?? 0.55 + (i % 40) / 100,
    detected_at: new Date(now - i * 3600000).toISOString(),
    explanation_json: seededDetection?.explanation_json ?? { notes: "seeded" },
    status: i < 3 ? "captured" : "suggested",
    evidence_ids: linkedEvidence.map((item) => item.id),
    detector_version: "bob_rubin_trade_v1",
  };
});

export const captures: Capture[] = Array.from({ length: 6 }, (_, i) => ({
  id: uuid(500 + i + 1),
  user_id: demoUser.id,
  discovery_id: discoveries[i].id,
  captured_at: new Date(now - i * 7200000).toISOString(),
  note: `Capture note ${i + 1}`,
  verification_level: "viewed_evidence",
  share_token: i < 2 ? `share-${i + 1}` : null,
}));

export const userActions: UserAction[] = [
  ...captures.map((capture, i) => ({
    id: randomUUID(),
    user_id: capture.user_id,
    action_type: "captured" as const,
    entity_type: "capture" as const,
    entity_id: capture.id,
    created_at: new Date(now - i * 7200000).toISOString(),
  })),
  ...discoveries.slice(0, 8).flatMap((discovery, i) =>
    discovery.evidence_ids.slice(0, 1).map((evidenceId, evidenceIndex) => ({
      id: randomUUID(),
      user_id: demoUser.id,
      action_type: "viewed_evidence" as const,
      entity_type: "evidence" as const,
      entity_id: evidenceId,
      created_at: new Date(now - (i + evidenceIndex) * 3600000).toISOString(),
    })),
  ),
];

export const users: User[] = [demoUser];
