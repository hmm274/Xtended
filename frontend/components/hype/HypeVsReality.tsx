"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { HYPE_API_BASE_URL } from "@/lib/api-config";
import type { Analysis, Claim, DodgedItem, Jargon, Job, Stage, Verdict, WhoGroup } from "./types";

// ---------- shared visual language ----------
const SAID = "#9aa6ff"; // management's ring
const VERDICT: Record<Verdict, { label: string; color: string }> = {
  BELIEVED: { label: "Believed", color: "#6fd98a" },
  DOUBTED: { label: "Doubted", color: "#e0a43e" },
  CONTRADICTED: { label: "Contradicted", color: "#e06b6b" },
  IGNORED: { label: "Ignored", color: "#8e98a6" },
};
const WHO: Record<string, string> = {
  analyst: "Analysts", retail: "Retail investors", journalist: "Journalists",
  employee_or_customer: "Employees & customers", company: "Company", other: "Other",
};
const STEPS: { stage: Stage; label: string }[] = [
  { stage: "extracting", label: "Read the call" },
  { stage: "checking_market", label: "Check investor reactions" },
  { stage: "done", label: "Score the gap" },
];
const pos = (v: number) => `${((Math.max(-1, Math.min(1, v)) + 1) / 2) * 100}%`;
const safeUrl = (u: string | null | undefined) => (u && /^https?:\/\//i.test(u) ? u : null);

// ---------- small pieces ----------

/** Management ring vs. X dot on a bearish..bullish line. The dot slides out from the ring on reveal. */
function Track({ said, market, color, delay, revealed, height = 28, ring = true }: {
  said: number; market: number | null; color: string; delay: number; revealed: boolean; height?: number; ring?: boolean;
}) {
  const showDot = market !== null;
  const m = showDot && revealed ? market : said;
  const ease = `cubic-bezier(.2,.8,.2,1) ${delay}ms`;
  return (
    <div className="relative w-full" style={{ height }} aria-hidden>
      <span className="absolute inset-x-0 top-1/2 h-px bg-white/10" />
      <span className="absolute top-1 bottom-1 left-1/2 w-px bg-white/15" />
      {showDot && (
        <span className="absolute top-1/2 -mt-[2px] h-1 rounded-full motion-reduce:transition-none"
          style={{ background: color, left: pos(Math.min(said, m)), width: `${(Math.abs(said - m) / 2) * 100}%`,
                   transition: `left 700ms ${ease}, width 700ms ${ease}` }} />
      )}
      {ring && (
        <span className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-background z-10"
          style={{ borderColor: SAID, left: pos(said) }} />
      )}
      {showDot && (
        <span className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full z-20 motion-reduce:transition-none"
          style={{ background: color, left: pos(m), transition: `left 700ms ${ease}` }} />
      )}
    </div>
  );
}

/** Underlines the first use of each extracted finance term and shows a plain-English definition on hover. */
function withJargon(text: string, jargon: Jargon[]): ReactNode[] {
  const hits: { start: number; end: number; tip: string }[] = [];
  const lower = text.toLowerCase();
  [...jargon].sort((a, b) => b.term.length - a.term.length).forEach(({ term, plain }) => {
    if (!term || !plain) return;
    const i = lower.indexOf(term.toLowerCase());
    if (i === -1 || hits.some((h) => i < h.end && i + term.length > h.start)) return;
    hits.push({ start: i, end: i + term.length, tip: plain });
  });
  hits.sort((a, b) => a.start - b.start);
  const out: ReactNode[] = [];
  let at = 0;
  hits.forEach((h, k) => {
    out.push(text.slice(at, h.start));
    out.push(
      <span key={k} className="group/term relative cursor-help border-b border-dotted" style={{ borderColor: SAID }}>
        {text.slice(h.start, h.end)}
        <span role="tooltip" className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 hidden w-max max-w-[260px] rounded-md bg-popover px-2.5 py-2 text-[13px] font-medium not-italic leading-snug text-popover-foreground shadow-lg ring-1 ring-white/10 group-hover/term:block">
          {h.tip}
        </span>
      </span>
    );
    at = h.end;
  });
  out.push(text.slice(at));
  return out;
}

function ClaimRow({ c, index, revealed }: { c: Claim; index: number; revealed: boolean }) {
  const [open, setOpen] = useState(false);
  const v = c.verdict ? VERDICT[c.verdict] : null;
  return (
    <li className={`border-b border-border ${open ? "bg-white/[0.03]" : ""}`}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="grid w-full grid-cols-1 items-center gap-3 px-4 py-4 text-left hover:bg-white/[0.03] lg:grid-cols-[1fr_220px_110px] lg:gap-6">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{[c.speaker, c.timestamp, c.category].filter(Boolean).join(", ")}</p>
          <p className="mt-0.5 font-semibold leading-snug">{withJargon(c.claim, c.jargon)}</p>
          <p className="mt-1 text-sm italic leading-relaxed text-muted-foreground">“{withJargon(c.quote, c.jargon)}”</p>
        </div>
        <Track said={c.ceo_tone} market={c.x_sentiment !== null && v ? c.x_sentiment / 100 : null}
          color={v?.color ?? VERDICT.IGNORED.color} delay={150 + index * 140} revealed={revealed} />
        <span className="text-sm font-semibold lg:justify-self-end" style={{ color: v?.color }}>
          {v ? v.label : <span className="font-normal text-muted-foreground">Checking…</span>}
        </span>
      </button>
      {open && (
        <div className="max-w-[75ch] px-4 pb-5">
          {c.reason && <p className="mb-3 leading-relaxed">{c.reason}</p>}
          <ul className="grid gap-3">
            {c.evidence.length === 0 && v && <li className="text-sm text-muted-foreground">No posts found about this claim.</li>}
            {c.evidence.map((e, i) => {
              const url = safeUrl(e.url);
              return (
                <li key={i} className="border-l-2 border-border pl-3 text-sm">
                  <p className="text-xs text-muted-foreground">{WHO[e.who] ?? "Other"}</p>
                  <p>{e.summary}</p>
                  {url && (
                    <p className="mt-0.5">
                      <a href={url} target="_blank" rel="noopener noreferrer" className="text-brand underline-offset-2 hover:underline">View post</a>
                      {!e.verified && <span className="ml-2 text-xs text-muted-foreground">(not in the model&apos;s citations, check before showing)</span>}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </li>
  );
}

function DodgedPanel({ items }: { items: DodgedItem[] }) {
  const heatColor = { high: VERDICT.CONTRADICTED.color, medium: VERDICT.DOUBTED.color, low: VERDICT.IGNORED.color };
  const heatText = { high: "Heavily discussed", medium: "Often discussed", low: "Some discussion" };
  return (
    <section className="surface rounded-[var(--radius)] p-5">
      <h3 className="text-lg font-semibold">What management didn&apos;t address</h3>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">Topics investors were asking about that the call skipped or deflected</p>
      <ol>
        {items.map((i, k) => {
          const url = safeUrl(i.evidence_url);
          return (
            <li key={k} className="grid grid-cols-[8px_1fr] gap-4 border-t border-border py-3.5 first:border-t-0 first:pt-1">
              <span className="rounded-sm" style={{ background: heatColor[i.heat] ?? heatColor.medium }} />
              <div>
                <p className="font-semibold">{i.topic}</p>
                <p className="text-sm leading-relaxed">{i.why_it_matters}</p>
                <p className="mt-1.5 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span className={i.deflected ? "font-semibold text-destructive" : ""}>
                    {i.deflected ? "Asked on the call, not answered" : "Never raised on the call"}
                  </span>
                  <span>{heatText[i.heat] ?? ""}</span>
                  {url && <a href={url} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">Example post</a>}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function WhoPanel({ groups, revealed }: { groups: WhoGroup[]; revealed: boolean }) {
  return (
    <section className="surface rounded-[var(--radius)] p-5">
      <h3 className="text-lg font-semibold">Who believes management</h3>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">Average agreement across the posts each group wrote</p>
      <div className="mb-1 ml-[132px] flex justify-between text-xs text-muted-foreground"><span>Disagrees</span><span>Agrees</span></div>
      <ul className="grid gap-3">
        {groups.map((g, k) => {
          const color = g.agreement > 0.25 ? VERDICT.BELIEVED.color : g.agreement < -0.25 ? VERDICT.CONTRADICTED.color : VERDICT.DOUBTED.color;
          return (
            <li key={g.who} className="grid grid-cols-[120px_1fr] items-center gap-3">
              <p className="text-sm font-semibold leading-tight">{WHO[g.who] ?? g.who}
                <span className="block text-xs font-normal text-muted-foreground">{g.posts} post{g.posts === 1 ? "" : "s"}</span></p>
              {/* starts at neutral (0) and slides to the group's agreement */}
              <Track said={0} market={g.agreement} color={color} delay={k * 140} revealed={revealed} height={22} ring={false} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------- main ----------

export default function HypeVsReality({ dashboardId }: { dashboardId: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [present, setPresent] = useState(false);
  const runToken = useRef(0); // bumped on each run and on unmount so stale polling loops stop

  const a: Analysis | null = job?.analysis ?? null;
  const running = !!job && job.stage !== "done" && job.stage !== "error";
  const verdictsIn = !!a?.claims.some((c) => c.verdict);

  useEffect(() => () => { runToken.current += 1; }, []); // stop polling on unmount
  useEffect(() => {
    if (verdictsIn && !revealed) {
      const t = setTimeout(() => setRevealed(true), 80);
      return () => clearTimeout(t);
    }
  }, [verdictsIn, revealed]);
  useEffect(() => {
    if (!present) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPresent(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [present]);

  // Poll the job until it finishes. Each run gets a new token so an older loop stops on its own.
  const pollUntilDone = async (id: string, token: number) => {
    while (runToken.current === token) {
      const res = await fetch(`${HYPE_API_BASE_URL}/api/jobs/${id}`);
      const data: Job & { detail?: string } = await res.json();
      if (!res.ok) throw new Error(data.detail || `Request failed (${res.status})`);
      if (runToken.current !== token) return;
      setJob(data);
      if (data.stage === "error") return setError(data.error || "Analysis failed.");
      if (data.stage === "done") return;
      await new Promise((r) => setTimeout(r, 1500));
    }
  };

  const run = async (refresh = false) => {
    const token = ++runToken.current;
    setError(null); setRevealed(false); setJob(null);
    try {
      const res = await fetch(`${HYPE_API_BASE_URL}/api/analyze-dashboard`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dashboard_id: dashboardId, refresh }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Request failed (${res.status})`);
      setJob(data);
      await pollUntilDone(data.id, token);
    } catch (e) {
      setError(e instanceof Error ? `${e.message}. Is the hype service running on port 8002?` : String(e));
    }
  };

  const stepIndex = job ? (job.stage === "running_modules" ? 2 : STEPS.findIndex((s) => s.stage === job.stage)) : -1;
  const mood = a?.overall_x_sentiment;
  const dodged = a?.modules?.dodged;
  const who = a?.modules?.who_split;

  return (
    <div className={present ? "fixed inset-0 z-50 overflow-y-auto bg-background px-[5vw] py-8" : ""}>
      <section className={`surface rounded-[var(--radius)] p-6 ${present ? "mx-auto max-w-[1280px] border-0 bg-transparent" : ""}`}>
        {/* header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Hype vs. Reality</h2>
            <p className="mt-1 text-sm text-muted-foreground">Does the market believe what management said? Each claim is checked against how investors, analysts, and the press reacted.</p>
          </div>
          <div className="flex items-center gap-2">
            {a?.mock && <span className="text-xs text-[#e0a43e]">Sample data (no API key set)</span>}
            {a && <button type="button" className="btn-outline" onClick={() => setPresent(!present)}>{present ? "Exit present" : "Present"}</button>}
            <button type="button" className="btn-primary" disabled={running} onClick={() => run(false)}>
              {running ? "Analyzing…" : a ? "Run again" : "Check the market's reaction"}
            </button>
          </div>
        </div>

        {/* progress (a real sequence, so the steps are numbered) */}
        {job && (
          <ol className="mt-5 flex flex-wrap gap-2 text-sm">
            {STEPS.map((s, i) => {
              const done = i < stepIndex || job.stage === "done";
              const active = i === stepIndex && job.stage !== "done";
              return (
                <li key={s.stage} className={`rounded-full border px-3 py-1 ${done ? "border-brand/60 text-brand" : active ? "border-foreground text-foreground" : "border-border text-muted-foreground"}`}>
                  {i + 1}. {s.label}
                </li>
              );
            })}
            {running && <li className="self-center pl-1 text-muted-foreground">{job.message}</li>}
          </ol>
        )}
        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

        {a && (
          <>
            {/* hero: the story leads, numbers support it */}
            <div className="mt-6">
              <p className={`max-w-[34ch] font-semibold leading-tight tracking-tight ${present ? "text-4xl" : "text-2xl lg:text-3xl"}`}>
                {a.story ?? (a.claims.length ? "Here's what management claimed. Checking how the market took it…" : "Reading the call…")}
              </p>
              <dl className="mt-5 flex flex-wrap gap-x-10 gap-y-4">
                <div><dt className="text-xs text-muted-foreground">Hype Gap</dt>
                  <dd className="text-2xl font-semibold tabular-nums">{a.hype_gap ?? "–"}<span className="ml-2 text-sm font-medium text-muted-foreground">{a.hype_label}</span></dd></div>
                <div><dt className="text-xs text-muted-foreground">Stock next day</dt>
                  <dd className="text-2xl font-semibold tabular-nums" style={{ color: a.price_move_pct == null ? undefined : a.price_move_pct >= 0 ? VERDICT.BELIEVED.color : VERDICT.CONTRADICTED.color }}>
                    {a.price_move_pct == null ? "–" : `${a.price_move_pct > 0 ? "+" : ""}${a.price_move_pct}%`}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Investor mood</dt>
                  <dd className="text-2xl font-semibold tabular-nums">{mood == null ? "–" : `${mood > 0 ? "+" : ""}${mood} ${mood >= 25 ? "positive" : mood <= -25 ? "negative" : "mixed"}`}</dd></div>
              </dl>
              {!present && <p className="mt-3 max-w-[70ch] text-xs text-muted-foreground">Hype Gap measures how far management&apos;s framing is from what investors concluded. 0 means the market fully buys the story; 100 means it rejects everything management pitched.</p>}
            </div>

            {/* claims */}
            <div className="mt-8 hidden grid-cols-[1fr_220px_110px] gap-6 px-4 pb-2 text-xs text-muted-foreground lg:grid">
              <span className="flex gap-5">
                <span className="inline-flex items-center gap-1.5"><i className="size-3 rounded-full border-2" style={{ borderColor: SAID }} />What management said</span>
                <span className="inline-flex items-center gap-1.5"><i className="size-3 rounded-full bg-foreground" />What investors think</span>
              </span>
              <span className="flex justify-between"><span>Bearish</span><span>Bullish</span></span>
              <span />
            </div>
            <ul className="border-t border-border">
              {a.claims.map((c, i) => <ClaimRow key={c.id} c={c} index={i} revealed={revealed} />)}
            </ul>

            {/* Tier 2 */}
            {(dodged?.data?.items?.length || who?.data?.groups?.length) ? (
              <div className="mt-8 grid gap-5 lg:grid-cols-[1.4fr_1fr]">
                {dodged?.data?.items?.length ? <DodgedPanel items={dodged.data.items} /> : <div />}
                {who?.data?.groups?.length ? <WhoPanel groups={who.data.groups} revealed={revealed} /> : null}
              </div>
            ) : null}
            {dodged?.error && <p className="mt-4 text-sm text-destructive">Couldn&apos;t check what management skipped: {dodged.error}</p>}
          </>
        )}
      </section>
    </div>
  );
}
