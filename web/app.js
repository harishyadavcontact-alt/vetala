const state = {
  evidence: [],
  discoveries: [],
  watchlist: [],
  leaderboards: { subjects: [], patterns: [] },
  selectedEvidenceId: null,
  selectedDiscoveryId: null,
};

const nodes = {
  evidenceList: document.querySelector("#evidence-list"),
  discoveryList: document.querySelector("#discovery-list"),
  watchlist: document.querySelector("#watchlist"),
  leaderboards: document.querySelector("#leaderboards"),
  evidenceDetail: document.querySelector("#evidence-detail"),
  entityProfile: document.querySelector("#entity-profile"),
  captureWorkspace: document.querySelector("#capture-workspace"),
  ingestForm: document.querySelector("#ingest-form"),
  ingestStatus: document.querySelector("#ingest-status"),
  refreshEvidence: document.querySelector("#refresh-evidence"),
  confidenceFilter: document.querySelector("#confidence-filter"),
  confidenceValue: document.querySelector("#confidence-value"),
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Request failed: ${response.status}`);
  }

  return response.json();
}

function tag(label, variant = "") {
  return `<span class="tag ${variant}">${label}</span>`;
}

function formatDate(value) {
  if (!value) {
    return "n/a";
  }
  return new Date(value).toLocaleString();
}

function reviewVariant(status) {
  if (status === "reviewed") {
    return "ok";
  }
  if (status === "challenged") {
    return "warn";
  }
  return "";
}

function reviewLabel(status) {
  if (status === "reviewed") {
    return "reviewed thesis";
  }
  if (status === "challenged") {
    return "challenged";
  }
  return "pending review";
}

function discoveryStatusVariant(discovery) {
  return discovery.review_status === "reviewed_thesis" ? "ok" : "warn";
}

async function collectDiscoverySupport(discovery) {
  const details = await Promise.all(discovery.evidence.map((item) => api(`/api/v1/evidence/${item.id}`)));
  const reviewedExtractions = details.flatMap((detail) => detail.extractions.filter((extraction) => extraction.review_status === "reviewed"));
  const fallbackExtractions = details.flatMap((detail) => detail.extractions);
  const selectedExtractions = reviewedExtractions.length > 0 ? reviewedExtractions : fallbackExtractions;

  return {
    supporting_evidence_ids: discovery.evidence.map((item) => item.id),
    supporting_extraction_ids: selectedExtractions.map((extraction) => extraction.id),
  };
}

function extractionCard(extraction) {
  const fragilityAssessment = extraction.json_output?.fragility_assessment ?? { note: "No fragility assessment recorded yet." };
  const reviewNote = extraction.review_note ? `<p class="meta">${extraction.review_note}</p>` : "";

  return `
    <article class="card extraction-card">
      <div class="card-row">
        <strong>${extraction.extractor_version}</strong>
        ${tag(reviewLabel(extraction.review_status), reviewVariant(extraction.review_status))}
      </div>
      <p class="meta">confidence ${Number(extraction.confidence).toFixed(2)} | ${formatDate(extraction.created_at)}</p>
      <div class="metric-grid compact">
        <div class="metric"><span class="small">Primary subject</span><strong>${fragilityAssessment.primary_subject?.person_name ?? fragilityAssessment.primary_subject?.org_name ?? "n/a"}</strong></div>
        <div class="metric"><span class="small">Intervention</span><strong>${fragilityAssessment.intervention_type ?? "n/a"}</strong></div>
        <div class="metric"><span class="small">Convexity</span><strong>${fragilityAssessment.convexity_profile ?? "n/a"}</strong></div>
        <div class="metric"><span class="small">Mechanisms</span><strong>${(fragilityAssessment.fragility_mechanisms ?? []).slice(0, 2).join(", ") || "n/a"}</strong></div>
      </div>
      <div>
        <p class="eyebrow">Reviewed fragility assessment</p>
        <pre>${JSON.stringify(fragilityAssessment, null, 2)}</pre>
      </div>
      <div class="inline-actions">
        <button type="button" data-review-extraction="${extraction.id}" data-status="reviewed">Mark reviewed</button>
        <button type="button" data-review-extraction="${extraction.id}" data-status="challenged" class="secondary">Challenge</button>
        <button type="button" data-review-extraction="${extraction.id}" data-status="pending" class="secondary">Reset</button>
      </div>
      <textarea data-review-note="${extraction.id}" placeholder="Review note">${extraction.review_note ?? ""}</textarea>
      ${reviewNote}
      <div>
        <p class="eyebrow">Full extraction</p>
        <pre>${JSON.stringify(extraction.json_output, null, 2)}</pre>
      </div>
    </article>
  `;
}

function renderEvidenceList() {
  nodes.evidenceList.innerHTML = state.evidence
    .map(
      (item) => `
        <article class="card ${item.id === state.selectedEvidenceId ? "active" : ""}" data-evidence-id="${item.id}">
          <div class="card-row">
            <strong>${item.title}</strong>
            ${tag(`T${item.trust_tier}`, item.trust_tier <= 2 ? "ok" : "warn")}
          </div>
          <p class="meta">${item.publisher}</p>
          <div class="tag-row">
            ${tag(item.reviewed ? "evidence viewed" : "evidence unseen", item.reviewed ? "ok" : "warn")}
            ${tag(`${item.extraction_count} extractions`)}
            ${tag(`${item.claim_count} claims`)}
            ${item.duplicate_count > 0 ? tag(`${item.duplicate_count} duplicates`, "warn") : ""}
          </div>
        </article>`,
    )
    .join("");
}

function renderDiscoveryList() {
  nodes.discoveryList.innerHTML = state.discoveries
    .map(
      (item) => `
        <article class="card ${item.id === state.selectedDiscoveryId ? "active" : ""}" data-discovery-id="${item.id}">
          <div class="card-row">
            <strong>${item.pattern_label}</strong>
            ${tag(`sev ${item.severity_score}`)}
          </div>
          <p class="meta">${item.subject_label ?? item.subject_id.slice(0, 8)} | ${item.pattern_type}</p>
          <div class="tag-row">
            ${tag(`conf ${item.confidence.toFixed(2)}`)}
            ${tag(item.review_status === "reviewed_thesis" ? "reviewed thesis" : "detector hit", discoveryStatusVariant(item))}
            ${tag(`${item.summary.reviewed_extraction_count}/${item.summary.extraction_count} reviewed extractions`, item.summary.reviewed_extraction_count > 0 ? "ok" : "warn")}
            ${tag(`${item.summary.reviewed_evidence_count} viewed evidence`, item.summary.reviewed_evidence_count > 0 ? "ok" : "warn")}
          </div>
        </article>`,
    )
    .join("");
}

function renderWatchlist() {
  nodes.watchlist.innerHTML = state.watchlist.length === 0
    ? '<p class="empty">No tracked discoveries yet.</p>'
    : state.watchlist
        .map(
          (item) => `
            <article class="card" data-discovery-id="${item.id}">
              <div class="card-row">
                <strong>${item.pattern_label}</strong>
                ${tag(`sev ${item.severity_score}`)}
              </div>
              <p class="meta">${item.subject_label ?? item.subject_id}</p>
              <div class="tag-row">
                ${tag(item.review_status === "reviewed_thesis" ? "reviewed thesis" : "detector hit", discoveryStatusVariant(item))}
                ${tag(`${item.summary.reviewed_extraction_count} reviewed extractions`, item.summary.reviewed_extraction_count > 0 ? "ok" : "warn")}
              </div>
            </article>`,
        )
        .join("");
}

function renderLeaderboards() {
  const subjectRows = state.leaderboards.subjects
    .map((item) => `<li>${item.label} | score ${item.score} | ${item.count} hits</li>`)
    .join("");
  const patternRows = state.leaderboards.patterns
    .map((item) => `<li>${item.label} | score ${item.score} | ${item.count} hits</li>`)
    .join("");

  nodes.leaderboards.innerHTML = `
    <div>
      <p class="eyebrow">Top fragilistas</p>
      <ul>${subjectRows || "<li>No leaderboard data yet.</li>"}</ul>
    </div>
    <div>
      <p class="eyebrow">Top patterns</p>
      <ul>${patternRows || "<li>No leaderboard data yet.</li>"}</ul>
    </div>
  `;
}

async function loadEvidenceDetail(id) {
  const item = await api(`/api/v1/evidence/${id}`);
  state.selectedEvidenceId = id;
  renderEvidenceList();

  const linkedDiscoveries = item.linked_discoveries
    .map((discovery) => `<li>${discovery.pattern_label} | conf ${Number(discovery.confidence).toFixed(2)} | sev ${discovery.severity_score}</li>`)
    .join("");

  nodes.evidenceDetail.innerHTML = `
    <div>
      <p class="eyebrow">Source</p>
      <h3>${item.title}</h3>
      <p class="meta">${item.publisher} | <a href="${item.url}" target="_blank" rel="noreferrer">${item.url}</a></p>
    </div>
    <div class="metric-grid">
      <div class="metric"><span class="small">Trust tier</span><strong>${item.trust_tier}</strong></div>
      <div class="metric"><span class="small">Duplicates</span><strong>${item.duplicate_count}</strong></div>
      <div class="metric"><span class="small">Extractions</span><strong>${item.extraction_count}</strong></div>
      <div class="metric"><span class="small">Evidence viewed</span><strong>${item.reviewed ? "Yes" : "No"}</strong></div>
    </div>
    <div class="inline-actions">
      <button id="mark-reviewed">Mark evidence viewed</button>
    </div>
    <div>
      <p class="eyebrow">Linked detector hits</p>
      <ul>${linkedDiscoveries || "<li>No linked discoveries yet.</li>"}</ul>
    </div>
    <div class="stack">
      ${(item.extractions ?? []).map((extraction) => extractionCard(extraction)).join("") || '<p class="empty">No extractions recorded yet.</p>'}
    </div>
  `;

  document.querySelector("#mark-reviewed")?.addEventListener("click", async () => {
    await api("/api/v1/user-actions", {
      method: "POST",
      body: JSON.stringify({
        action_type: "viewed_evidence",
        entity_type: "evidence",
        entity_id: id,
      }),
    });
    await loadAll();
    await loadEvidenceDetail(id);
  });
}

async function loadEntityProfile(subjectType, subjectId) {
  const profile = await api(`/api/v1/${subjectType === "person" ? "people" : subjectType === "org" ? "organizations" : "events"}/${subjectId}`);
  const heading = profile.person?.full_name || profile.organization?.name || profile.event?.title || "Entity";
  const topPatterns = profile.fragility_summary.top_patterns
    .map((pattern) => tag(`${pattern.pattern_label} (${pattern.confidence.toFixed(2)})`, "warn"))
    .join("");
  const recentEvidence = profile.recent_evidence.map((item) => `<li>${item.title} | ${item.publisher} | tier ${item.trust_tier}</li>`).join("");
  const timeline = profile.timeline.map((item) => `<li>${item.start_date ?? "undated"} | ${item.title}</li>`).join("");
  const reviewedDiscoveries = profile.discoveries
    .filter((discovery) => discovery.reviewed_thesis)
    .slice(0, 3)
    .map(
      (discovery) =>
        `<li>${discovery.pattern_label} | ${discovery.reviewed_thesis.confidence_label} | ${discovery.reviewed_thesis.thesis_statement}</li>`,
    )
    .join("");
  const detectorHits = profile.discoveries
    .slice(0, 4)
    .map((discovery) => `<li>${discovery.pattern_label} | ${discovery.review_status === "reviewed_thesis" ? "reviewed thesis" : "detector hit"}</li>`)
    .join("");
  const thesisLedger = profile.reviewed_theses
    .slice(0, 4)
    .map((thesis) => `<li>${thesis.confidence_label} | ${thesis.thesis_statement}</li>`)
    .join("");

  nodes.entityProfile.innerHTML = `
    <div>
      <p class="eyebrow">Subject</p>
      <h3>${heading}</h3>
      <p class="meta">${profile.subject_type}</p>
    </div>
    <div class="metric-grid">
      <div class="metric"><span class="small">Skin in the game gap</span><strong>${profile.fragility_summary.skin_in_the_game_gap}</strong></div>
      <div class="metric"><span class="small">Externalized loss</span><strong>${profile.fragility_summary.externalized_loss_risk}</strong></div>
      <div class="metric"><span class="small">Iatrogenic risk</span><strong>${profile.fragility_summary.iatrogenic_risk}</strong></div>
      <div class="metric"><span class="small">Fragility score</span><strong>${profile.fragility_summary.fragility_score}</strong></div>
    </div>
    <div>
      <p class="eyebrow">Why this subject is fragile</p>
      <p class="meta">${profile.fragility_summary.thesis}</p>
      <div class="tag-row">${topPatterns || tag("No detector has fired yet")}</div>
    </div>
    <div>
      <p class="eyebrow">Reviewed theses</p>
      <ul>${reviewedDiscoveries || "<li>No reviewed thesis recorded yet.</li>"}</ul>
    </div>
    <div>
      <p class="eyebrow">Analyst ledger</p>
      <ul>${thesisLedger || "<li>No analyst thesis saved yet.</li>"}</ul>
    </div>
    <div>
      <p class="eyebrow">Detector hits</p>
      <ul>${detectorHits || "<li>No detector hits yet.</li>"}</ul>
    </div>
    <div>
      <p class="eyebrow">Watch evidence</p>
      <ul>${recentEvidence || "<li>No linked evidence yet.</li>"}</ul>
    </div>
    <div>
      <p class="eyebrow">Intervention timeline</p>
      <ul>${timeline || "<li>No tracked timeline yet.</li>"}</ul>
    </div>
  `;
}

async function loadCaptureWorkspace(id, statusMessage = "") {
  const discovery = await api(`/api/v1/discoveries/${id}`);
  state.selectedDiscoveryId = id;
  renderDiscoveryList();

  nodes.captureWorkspace.innerHTML = `
    <div>
      <p class="eyebrow">Selected discovery</p>
      <h3>${discovery.pattern_label}</h3>
      <p class="meta">${discovery.pattern_type} | confidence ${discovery.confidence.toFixed(2)}</p>
    </div>
    <div class="metric-grid">
      <div class="metric"><span class="small">Evidence count</span><strong>${discovery.summary.evidence_count}</strong></div>
      <div class="metric"><span class="small">Viewed evidence</span><strong>${discovery.summary.reviewed_evidence_count}</strong></div>
      <div class="metric"><span class="small">Reviewed extractions</span><strong>${discovery.summary.reviewed_extraction_count}</strong></div>
      <div class="metric"><span class="small">Severity</span><strong>${discovery.severity_score}</strong></div>
    </div>
    <div class="tag-row">
      ${tag(discovery.review_status === "reviewed_thesis" ? "reviewed thesis" : "detector hit", discoveryStatusVariant(discovery))}
      ${tag(`review ratio ${discovery.summary.extraction_review_ratio.toFixed(2)}`, discovery.summary.reviewed_extraction_count > 0 ? "ok" : "warn")}
      ${discovery.summary.challenged_extraction_count > 0 ? tag(`${discovery.summary.challenged_extraction_count} challenged`, "warn") : ""}
    </div>
    <div>
      <p class="eyebrow">Analyst thesis</p>
      <p class="meta">${discovery.reviewed_thesis ? discovery.reviewed_thesis.thesis_statement : "No reviewed thesis saved yet. Detector confidence alone does not create an analyst-backed claim."}</p>
      <div class="tag-row">
        ${discovery.reviewed_thesis ? tag(discovery.reviewed_thesis.confidence_label, "ok") : tag("detector only", "warn")}
      </div>
    </div>
    <div>
      <p class="eyebrow">Why this fired</p>
      <pre>${JSON.stringify(discovery.explanation_json, null, 2)}</pre>
    </div>
    <form id="thesis-form">
      <textarea name="thesis_statement" placeholder="Write the reviewed thesis">${discovery.reviewed_thesis?.thesis_statement ?? ""}</textarea>
      <select name="confidence_label">
        <option value="watch" ${discovery.reviewed_thesis?.confidence_label === "watch" ? "selected" : ""}>Watch</option>
        <option value="conviction" ${discovery.reviewed_thesis?.confidence_label === "conviction" ? "selected" : ""}>Conviction</option>
        <option value="high_conviction" ${discovery.reviewed_thesis?.confidence_label === "high_conviction" ? "selected" : ""}>High conviction</option>
      </select>
      <textarea name="analyst_note" placeholder="Analyst note">${discovery.reviewed_thesis?.analyst_note ?? ""}</textarea>
      <div class="inline-actions">
        <button type="submit">Save reviewed thesis</button>
      </div>
      <p class="small" id="thesis-status"></p>
    </form>
    <form id="capture-form">
      <textarea name="note" placeholder="Capture note"></textarea>
      <div class="inline-actions">
        <button type="submit">Capture into dossier</button>
        <button type="button" id="track-discovery" class="secondary">Track on radar</button>
        <button type="button" id="share-capture" class="secondary">Share latest capture</button>
      </div>
      <p class="small" id="capture-status">${statusMessage}</p>
    </form>
  `;

  await loadEntityProfile(discovery.subject_type, discovery.subject_id);

  document.querySelector("#thesis-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const statusNode = document.querySelector("#thesis-status");
    try {
      const support = await collectDiscoverySupport(discovery);
      if (support.supporting_extraction_ids.length === 0) {
        statusNode.textContent = "No linked extraction is available to support a reviewed thesis yet.";
        return;
      }
      await api(`/api/v1/discoveries/${id}/reviewed-thesis`, {
        method: "POST",
        body: JSON.stringify({
          thesis_statement: String(form.get("thesis_statement") || ""),
          confidence_label: String(form.get("confidence_label") || "watch"),
          analyst_note: String(form.get("analyst_note") || "") || null,
          supporting_evidence_ids: support.supporting_evidence_ids,
          supporting_extraction_ids: support.supporting_extraction_ids,
        }),
      });
      await loadAll();
      await loadCaptureWorkspace(id, statusMessage);
    } catch (error) {
      statusNode.textContent = error.message;
    }
  });

  document.querySelector("#capture-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const note = String(form.get("note") || "");
    const statusNode = document.querySelector("#capture-status");
    try {
      const capture = await api(`/api/v1/discoveries/${id}/capture`, {
        method: "POST",
        body: JSON.stringify({ note }),
      });
      await loadAll();
      await loadCaptureWorkspace(id, `Captured at ${capture.captured_at}`);
    } catch (error) {
      statusNode.textContent = error.message;
    }
  });

  document.querySelector("#share-capture")?.addEventListener("click", async () => {
    const captures = await api("/api/v1/me/captures");
    const latest = captures.find((capture) => capture.discovery_id === id) || captures[0];
    const statusNode = document.querySelector("#capture-status");
    if (!latest) {
      statusNode.textContent = "Capture the discovery first.";
      return;
    }
    const shared = await api(`/api/v1/captures/${latest.id}/share`, { method: "POST" });
    statusNode.textContent = `Share token: ${shared.share_token}`;
  });

  document.querySelector("#track-discovery")?.addEventListener("click", async () => {
    const statusNode = document.querySelector("#capture-status");
    await api("/api/v1/user-actions", {
      method: "POST",
      body: JSON.stringify({
        action_type: "flagged",
        entity_type: "discovery",
        entity_id: id,
      }),
    });
    await loadAll();
    statusNode.textContent = "Added to radar.";
  });
}

async function loadAll() {
  nodes.confidenceValue.textContent = Number(nodes.confidenceFilter.value).toFixed(2);
  const [evidence, discoveries, watchlist, leaderboards] = await Promise.all([
    api("/api/v1/evidence"),
    api(`/api/v1/discoveries?min_confidence=${nodes.confidenceFilter.value}`),
    api("/api/v1/watchlist"),
    api("/api/v1/leaderboards"),
  ]);
  state.evidence = evidence;
  state.discoveries = discoveries;
  state.watchlist = watchlist;
  state.leaderboards = leaderboards;
  renderEvidenceList();
  renderDiscoveryList();
  renderWatchlist();
  renderLeaderboards();
}

nodes.evidenceList.addEventListener("click", async (event) => {
  const card = event.target.closest("[data-evidence-id]");
  if (!card) {
    return;
  }
  await loadEvidenceDetail(card.dataset.evidenceId);
});

nodes.discoveryList.addEventListener("click", async (event) => {
  const card = event.target.closest("[data-discovery-id]");
  if (!card) {
    return;
  }
  await loadCaptureWorkspace(card.dataset.discoveryId);
});

nodes.watchlist.addEventListener("click", async (event) => {
  const card = event.target.closest("[data-discovery-id]");
  if (!card) {
    return;
  }
  await loadCaptureWorkspace(card.dataset.discoveryId);
});

nodes.evidenceDetail.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-review-extraction]");
  if (!target) {
    return;
  }
  const extractionId = target.dataset.reviewExtraction;
  const reviewStatus = target.dataset.status;
  const noteNode = nodes.evidenceDetail.querySelector(`[data-review-note="${extractionId}"]`);
  await api(`/api/v1/extractions/${extractionId}/review`, {
    method: "POST",
    body: JSON.stringify({
      review_status: reviewStatus,
      review_note: noteNode?.value || null,
    }),
  });
  await loadAll();
  await loadEvidenceDetail(state.selectedEvidenceId);
  if (state.selectedDiscoveryId) {
    await loadCaptureWorkspace(state.selectedDiscoveryId);
  }
});

nodes.ingestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  const now = Date.now();
  const payload = {
    title: String(form.get("title")),
    publisher: String(form.get("publisher")),
    url: String(form.get("url")),
    source_type: String(form.get("source_type")),
    trust_tier: Number(form.get("trust_tier")),
    accessed_at: new Date().toISOString(),
    content_hash: btoa(String(form.get("url"))).replace(/=/g, ""),
    raw_storage_path: `/raw/${now}.html`,
    extracted_text_path: `/extracted/${now}.txt`,
    license_notes: null,
  };

  try {
    const result = await api("/api/v1/evidence", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    nodes.ingestStatus.textContent = result.created ? "Evidence created." : "Duplicate detected; existing evidence returned.";
    formElement.reset();
    await loadAll();
  } catch (error) {
    nodes.ingestStatus.textContent = error.message;
  }
});

nodes.refreshEvidence.addEventListener("click", () => {
  void loadAll();
});

nodes.confidenceFilter.addEventListener("input", () => {
  void loadAll();
});

void loadAll();
