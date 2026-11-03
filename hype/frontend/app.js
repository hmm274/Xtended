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
  $("#inputPanel").open = false;   // give the screen to the results while judges watch
  renderedClaimIds = "";
  $("#claims").innerHTML = ""; $("#modules").innerHTML = ""; $("#results").hidden = true;
  $("#dodged").hidden = $("#who").hidden = true;
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

// ---------- jargon ----------
// Wraps the first use of each extracted term in a hover tooltip. Text is escaped before wrapping.
function withJargon(text, jargon = []) {
  let html = esc(text);
  [...jargon].sort((a, b) => b.term.length - a.term.length).forEach(({ term, plain }) => {
    if (!term || !plain) return;
    const re = new RegExp(`(^|[^\\w>])(${esc(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?![\\w<])`, "i");
    html = html.replace(re, (_, pre, t) => `${pre}<span class="term" data-tip="${esc(plain)}">${t}</span>`);
  });
  return html;
}

// ---------- presenter mode ----------
function togglePresent(force) {
  const on = document.body.classList.toggle("present", force);
  $("#presentBtn").setAttribute("aria-pressed", String(on));
  $("#presentBtn").textContent = on ? "Exit present" : "Present";
}
$("#presentBtn").addEventListener("click", () => togglePresent());
document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea")) return;
  if (e.key === "p" || e.key === "P") togglePresent();
  if (e.key === "Escape") togglePresent(false);
});

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
  $(".plain", li).innerHTML = withJargon(c.claim, c.jargon);
  $(".quote", li).innerHTML = withJargon(c.quote, c.jargon);
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
    const place = () => {
      dot.style.left = pct(mkt);
      bar.style.left = pct(Math.min(said, mkt));
      bar.style.width = `${(Math.abs(said - mkt) / 2) * 100}%`;
    };
    if (dot.hidden) {
      // The reveal: each "What X thinks" dot starts on management's ring and slides to where X landed.
      dot.style.left = pct(said); bar.style.left = pct(said); bar.style.width = "0%";
      dot.hidden = bar.hidden = false;
      const order = [...li.parentElement.children].indexOf(li);
      setTimeout(() => requestAnimationFrame(place), 150 + order * 140);
    } else place();
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
// Modules with a dedicated section render there; anything else falls back to a raw panel.
const DEDICATED = {
  dodged(m) {
    const items = m.data?.items || [];
    $("#dodged").hidden = !items.length && !m.error;
    $("#dodgedList").innerHTML = m.error ? `<li><p class="status error">${esc(m.error)}</p></li>` : items.map((i) => {
      const url = safeUrl(i.evidence_url);
      return `<li><span class="heat ${esc(i.heat)}" title="${esc(i.heat)} discussion on X"></span><div>
        <h3>${esc(i.topic)}</h3><p>${esc(i.why_it_matters)}</p>
        <div class="tags"><span class="${i.deflected ? "deflected" : ""}">${i.deflected ? "Asked on the call, not answered" : "Never raised on the call"}</span>
        <span>${{ high: "Heavily discussed", medium: "Often discussed", low: "Some discussion" }[i.heat] || ""}</span>
        ${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">Example post</a>` : ""}</div></div></li>`;
    }).join("");
  },
  who_split(m) {
    const groups = m.data?.groups || [];
    $("#who").hidden = !groups.length;
    $("#whoList").innerHTML = groups.map((g) => {
      const tone = g.agreement > 0.25 ? "v-BELIEVED" : g.agreement < -0.25 ? "v-CONTRADICTED" : "v-DOUBTED";
      return `<li class="${tone}"><div class="name">${esc(WHO_TEXT[g.who] || g.who)}<small>${g.posts} post${g.posts === 1 ? "" : "s"}</small></div>
        <div class="track"><span class="mid"></span><span class="bar" style="left:${pct(Math.min(0, g.agreement))};width:${Math.abs(g.agreement) * 50}%"></span>
        <span class="dot" style="left:${pct(g.agreement)}"></span></div></li>`;
    }).join("");
  },
};

function renderModules(mods) {
  const rest = [];
  Object.entries(mods).forEach(([name, m]) => (DEDICATED[name] ? DEDICATED[name](m) : rest.push([name, m])));
  $("#modules").innerHTML = rest.map(([name, m]) => `<div class="module"><h2>${esc(name)}</h2>${
    m.error ? `<p class="status error">${esc(m.error)}</p>` : `<pre>${esc(JSON.stringify(m.data, null, 2))}</pre>`}</div>`).join("");
}
