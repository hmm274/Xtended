// Hype vs. Reality frontend. Vanilla JS so it drops into any SimpliEarn stack.
// To port to React: each render* function maps 1:1 to a component.
const API = window.HYPE_API_BASE || "";        // set if the backend runs on another origin
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : null);   // block javascript: links from model output
const pct = (v) => `${((Math.max(-1, Math.min(1, v)) + 1) / 2) * 100}%`;   // -1..1 -> 0..100%
const VERDICT_TEXT = { BELIEVED: "Believed", DOUBTED: "Doubted", CONTRADICTED: "Contradicted", IGNORED: "Ignored" };
const WHO_TEXT = { analyst: "Analyst", retail: "Retail investor", journalist: "Journalist", employee_or_customer: "Employee or customer", company: "Company", other: "Other" };
const STAGES = ["extracting", "checking_market", "done"];

let pollTimer = null;
let renderedClaimIds = "";

// ---------- API ----------
async function api(path, opts = {}) {
  const res = await fetch(API + path, { headers: { "Content-Type": "application/json" }, ...opts });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = Array.isArray(body.detail) ? body.detail.map((d) => `${d.loc?.slice(-1)[0]}: ${d.msg}`).join("; ") : body.detail;
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return body;
}

// ---------- form ----------
$("#sampleBtn").addEventListener("click", async () => {
  const s = await api("/api/sample-transcript");
  const f = $("#form");
  f.ticker.value = s.ticker; f.company.value = s.company; f.call_date.value = s.call_date; f.transcript.value = s.transcript;
});

$("#form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target;
  const payload = { ticker: f.ticker.value.trim(), company: f.company.value.trim(), call_date: f.call_date.value,
                    transcript: f.transcript.value, refresh: f.refresh.checked };
  setBusy(true);
  setStatus("Starting analysis");
  renderedClaimIds = "";
  $("#claims").innerHTML = ""; $("#modules").innerHTML = ""; $("#results").hidden = true;
  try {
    const job = await api("/api/analyze", { method: "POST", body: JSON.stringify(payload) });
    poll(job.id);
  } catch (err) { fail(err.message); }
});

function poll(id) {
  clearTimeout(pollTimer);
  api(`/api/jobs/${id}`).then((job) => {
    renderProgress(job.stage);
    if (job.analysis) render(job.analysis, job.stage);
    if (job.stage === "error") return fail(job.error || "Analysis failed.");
    if (job.stage === "done") {
      setBusy(false);
      setStatus(job.message === "Loaded from cache" ? "Loaded from cache. Tick “Ignore cached result” to re-run." : "");
      $("#inputPanel").open = false;
      return;
    }
    setStatus(job.message);
    pollTimer = setTimeout(() => poll(id), 1500);
  }).catch((err) => fail(err.message));
}

function setBusy(b) { $("#form button[type=submit]").disabled = b; }
function setStatus(msg, isErr = false) { const s = $("#status"); s.textContent = msg; s.classList.toggle("error", isErr); }
function fail(msg) { setBusy(false); setStatus(msg, true); }

function renderProgress(stage) {
  const p = $("#progress"); p.hidden = false;
  const idx = stage === "running_modules" ? 2 : STAGES.indexOf(stage);
  [...p.children].forEach((li, i) => {
    li.classList.toggle("complete", i < idx || stage === "done");
    li.classList.toggle("active", i === idx && stage !== "done");
  });
}

// ---------- results ----------
function render(a, stage) {
  $("#results").hidden = false;
  $("#mode").hidden = !a.mock;
  $("#mode").textContent = a.mock ? "Sample data (no API key set)" : "";

  $("#story").textContent = a.story || (stage === "checking_market" ? "Here's what management claimed. Checking how the market took it…" : "Reading the call…");
  $("#gap").textContent = a.hype_gap ?? "–";
  $("#gapLabel").textContent = a.hype_label || "";
  const mv = a.price_move_pct;
  $("#move").innerHTML = mv == null ? "–" : `<span class="${mv >= 0 ? "up" : "down"}">${mv > 0 ? "+" : ""}${esc(mv)}%</span>`;
  const m = a.overall_x_sentiment;
  $("#mood").textContent = m == null ? "–" : `${m > 0 ? "+" : ""}${m} ${m >= 25 ? "positive" : m <= -25 ? "negative" : "mixed"}`;

  renderClaims(a.claims);
  renderModules(a.modules || {});
}

function renderClaims(claims) {
  const ul = $("#claims");
  const ids = claims.map((c) => c.id).join();
  if (ids !== renderedClaimIds) {           // build rows once, then update in place so the dots animate
    ul.innerHTML = "";
    claims.forEach((c) => ul.appendChild(buildClaim(c)));
    renderedClaimIds = ids;
  }
  claims.forEach((c) => updateClaim(ul.querySelector(`[data-id="${c.id}"]`), c));
}

function buildClaim(c) {
  const li = $("#claimTpl").content.firstElementChild.cloneNode(true);
  li.dataset.id = c.id;
  const head = $(".claim-head", li), body = $(".claim-body", li);
  head.addEventListener("click", () => {
    const open = head.getAttribute("aria-expanded") === "true";
    head.setAttribute("aria-expanded", String(!open));
    body.hidden = open;
    li.classList.toggle("open", !open);
  });
  $(".meta", li).textContent = [c.speaker, c.timestamp, c.category].filter(Boolean).join(", ");
  $(".plain", li).textContent = c.claim;
  $(".quote", li).textContent = c.quote;
  $(".ring", li).style.left = pct(c.ceo_tone);
  return li;
}

function updateClaim(li, c) {
  const v = c.verdict;
  ["BELIEVED", "DOUBTED", "CONTRADICTED", "IGNORED"].forEach((k) => li.classList.toggle(`v-${k}`, k === v));
  const verdict = $(".verdict", li);
  verdict.textContent = v ? VERDICT_TEXT[v] : "Checking…";
  verdict.classList.toggle("pending", !v);

  const dot = $(".dot", li), bar = $(".bar", li);
  if (v && c.x_sentiment != null) {
    const said = c.ceo_tone, mkt = c.x_sentiment / 100;
    dot.hidden = bar.hidden = false;
    dot.style.left = pct(mkt);
    bar.style.left = pct(Math.min(said, mkt));
    bar.style.width = `${(Math.abs(said - mkt) / 2) * 100}%`;
    $(".track", li).title = `Management ${said > 0 ? "bullish" : said < 0 ? "bearish" : "neutral"}, X sentiment ${c.x_sentiment}`;
  } else { dot.hidden = bar.hidden = true; }

  $(".reason", li).textContent = c.reason || "";
  $(".evidence", li).innerHTML = (c.evidence || []).map((e) => ({ ...e, url: safeUrl(e.url) })).map((e) => `
    <li><div class="who">${esc(WHO_TEXT[e.who] || "Other")}</div>
      <div>${esc(e.summary)}</div>
      ${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">View post</a>
        ${e.verified ? "" : `<span class="unverified">(link not in Grok's citations, check before showing)</span>`}` : ""}
    </li>`).join("") || (v ? `<li>No posts found about this claim.</li>` : "");
}

// ---------- Tier 2/3 modules ----------
// Each module's output arrives as analysis.modules[name] = {tier, data} or {tier, error}.
// Add a renderer here when you build a new module; unknown modules fall back to raw JSON.
const MODULE_RENDERERS = {
  who_split: (d) => `<h2>Who's reacting</h2><table><tr><th>Group</th><th>Posts</th><th>Leaning</th></tr>${
    Object.entries(d).map(([who, v]) => `<tr><td>${esc(WHO_TEXT[who] || who)}</td><td>${v.posts}</td><td>${
      v.avg_lean > 0.25 ? "Believes management" : v.avg_lean < -0.25 ? "Skeptical" : "Mixed"}</td></tr>`).join("")}</table>`,
  dodged: (d) => `<h2>What management didn't address</h2><ul>${
    (d.items || []).map((i) => ({ ...i, evidence_url: safeUrl(i.evidence_url) })).map((i) => `<li><strong>${esc(i.topic)}</strong>: ${esc(i.why_it_matters)}${
      i.evidence_url ? ` <a href="${esc(i.evidence_url)}" target="_blank" rel="noopener noreferrer">Example post</a>` : ""}</li>`).join("")}</ul>`,
};

function renderModules(mods) {
  $("#modules").innerHTML = Object.entries(mods).map(([name, m]) => {
    if (m.error) return `<div class="module"><h2>${esc(name)}</h2><p class="status error">${esc(m.error)}</p></div>`;
    const r = MODULE_RENDERERS[name];
    return `<div class="module">${r ? r(m.data) : `<h2>${esc(name)}</h2><pre>${esc(JSON.stringify(m.data, null, 2))}</pre>`}</div>`;
  }).join("");
}
