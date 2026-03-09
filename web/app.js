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
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  return response.json();
}

function tag(label, variant = "") {
  return `<span class="tag ${variant}">${label}</span>`;
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
          ${tag(item.reviewed ? "reviewed" : "unreviewed", item.reviewed ? "ok" : "warn")}
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
          ${tag(`${item.summary.evidence_count} evidence`)}
          ${tag(`best tier ${item.summary.best_trust_tier ?? "n/a"}`)}
          ${tag(`${item.summary.reviewed_evidence_count} reviewed`, item.summary.reviewed_evidence_count > 0 ? "ok" : "warn")}
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
  const extraction = item.extractions[0];
  const fragilityAssessment = extraction?.json_output?.fragility_assessment ?? { note: "No fragility assessment recorded yet." };

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
      <div class="metric"><span class="small">Reviewed</span><strong>${item.reviewed ? "Yes" : "No"}</strong></div>
    </div>
    <div class="inline-actions">
      <button id="mark-reviewed">Mark reviewed</button>
    </div>
    <div>
      <p class="eyebrow">Fragility assessment</p>
      <pre>${JSON.stringify(fragilityAssessment, null, 2)}</pre>
    </div>
    <div>
      <p class="eyebrow">Full extraction</p>
      <pre>${JSON.stringify(extraction?.json_output ?? { note: "No extraction recorded yet." }, null, 2)}</pre>
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
  const heading =
    profile.person?.full_name ||
    profile.organization?.name ||
    profile.event?.title ||
    "Entity";
  const topPatterns = profile.fragility_summary.top_patterns
    .map((pattern) => tag(`${pattern.pattern_label} (${pattern.confidence.toFixed(2)})`, "warn"))
    .join("");
  const recentEvidence = profile.recent_evidence
    .map((item) => `<li>${item.title} | ${item.publisher} | tier ${item.trust_tier}</li>`)
    .join("");
  const timeline = profile.timeline
    .map((item) => `<li>${item.start_date ?? "undated"} | ${item.title}</li>`)
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
      <p class="eyebrow">Current thesis</p>
      <p class="meta">${profile.fragility_summary.thesis}</p>
      <div class="tag-row">${topPatterns || tag("No detector has fired yet")}</div>
    </div>
    <div>
      <p class="eyebrow">Watch evidence</p>
      <ul>${recentEvidence || "<li>No linked evidence yet.</li>"}</ul>
    </div>
    <div>
      <p class="eyebrow">Intervention timeline</p>
      <ul>${timeline || "<li>No tracked timeline yet.</li>"}</ul>
    </div>
    <div>
      <p class="eyebrow">Scores and explanations</p>
      <pre>${JSON.stringify(profile.scores, null, 2)}</pre>
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
      <div class="metric"><span class="small">Best trust tier</span><strong>${discovery.summary.best_trust_tier ?? "n/a"}</strong></div>
      <div class="metric"><span class="small">Reviewed evidence</span><strong>${discovery.summary.reviewed_evidence_count}</strong></div>
      <div class="metric"><span class="small">Severity</span><strong>${discovery.severity_score}</strong></div>
    </div>
    <div>
      <p class="eyebrow">Why this fired</p>
      <pre>${JSON.stringify(discovery.explanation_json, null, 2)}</pre>
    </div>
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

  loadEntityProfile(discovery.subject_type, discovery.subject_id);

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

nodes.ingestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  const payload = {
    title: String(form.get("title")),
    publisher: String(form.get("publisher")),
    url: String(form.get("url")),
    source_type: String(form.get("source_type")),
    trust_tier: Number(form.get("trust_tier")),
    accessed_at: new Date().toISOString(),
    content_hash: btoa(String(form.get("url"))).replace(/=/g, ""),
    raw_storage_path: `/raw/${Date.now()}.html`,
    extracted_text_path: `/extracted/${Date.now()}.txt`,
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
