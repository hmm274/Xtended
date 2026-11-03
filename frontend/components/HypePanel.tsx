"use client";

import { useEffect, useRef, useState } from "react";

const HYPE_API = process.env.NEXT_PUBLIC_HYPE_API ?? "http://localhost:8002";
const REQUEST_TIMEOUT_MS = 150_000;

/**
 * Call details for the preset dashboards. Dates come from each preset's transcript header
 * (RAG/transcripts/*_seeking_alpha.txt) and match the preset video's quarter.
 * CVS (id 2) is left out on purpose: its video is the Q3 2024 call but its transcript is Q4 2024,
 * so the call date can't be verified. It shows "Hype data unavailable for this call".
 */
const HYPE_PRESETS: Record<string, { ticker: string; company: string; callDate: string }> = {
  "1": { ticker: "AAPL", company: "Apple", callDate: "2025-01-30" },
  "3": { ticker: "GOOGL", company: "Alphabet", callDate: "2025-02-04" },
  "4": { ticker: "SHEL", company: "Shell", callDate: "2025-01-30" },
  "5": { ticker: "TSLA", company: "Tesla", callDate: "2025-01-29" },
  "6": { ticker: "WMT", company: "Walmart", callDate: "2025-02-20" },
};

// ---- API contract (POST /api/hype). Agree on this with the API owner. ----
// Request:  { ticker, company, call_date: "YYYY-MM-DD" }
// Response: HypeResponse. Every field except posts may be null; the panel copes with missing data.

export interface HypePost {
  text: string;                  // post text or a paraphrase of it
  url: string | null;
  author: string | null;         // handle, e.g. "@someanalyst"
  credibility: number | null;    // 0..1, from the scoring module
  sentiment: number | null;      // -1 (bearish) .. +1 (bullish)
  verified: boolean;             // true when the URL appears in Grok's citations
}

export interface HypeResponse {
  ticker: string;
  call_date: string;
  score: number | null;          // final credibility-weighted score, -100 (bearish) .. +100 (bullish)
  label?: string | null;         // short verdict, e.g. "Market doubts the call"
  comparison?: {
    management: number | null;   // management's tone, -100..100
    market: number | null;       // weighted X reaction, -100..100
    summary?: string | null;     // one sentence explaining the gap
  } | null;
  posts: HypePost[];
  error?: string | null;
}

type PanelState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; data: HypeResponse };

const signed = (n: number) => `${n > 0 ? "+" : ""}${Math.round(n)}`;
const toneColor = (n: number | null | undefined) =>
  n == null ? "text-white/80" : n > 10 ? "text-green-400" : n < -10 ? "text-red-400" : "text-amber-300";
const safeUrl = (u: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);

/** Position on a -100..100 scale as a percentage across a bar. */
const pos = (n: number) => `${(Math.max(-100, Math.min(100, n)) + 100) / 2}%`;

interface HypePanelProps {
  dashboardId: string | null;
}

export default function HypePanel({ dashboardId }: HypePanelProps) {
  const preset = dashboardId ? HYPE_PRESETS[dashboardId] : undefined;
  const [state, setState] = useState<PanelState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const runId = useRef(0);

  // The parent mounts this panel the first time the Hype tab is opened, so this only fetches then
  // (and again on "Try again").
  useEffect(() => {
    if (!preset) return;
    const id = ++runId.current;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    fetch(`${HYPE_API}/api/hype`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker: preset.ticker, company: preset.company, call_date: preset.callDate }),
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.detail || body?.error || `Hype API error (${res.status})`);
        return body as HypeResponse;
      })
      .then((data) => {
        if (runId.current !== id) return;
        if (data.error) setState({ status: "error", message: data.error });
        else if (data.score == null) setState({ status: "error", message: "No score was returned for this call." });
        else setState({ status: "done", data: { ...data, posts: data.posts ?? [] } });
      })
      .catch((err: unknown) => {
        if (runId.current !== id) return;
        const aborted = err instanceof DOMException && err.name === "AbortError";
        setState({
          status: "error",
          message: aborted
            ? "The Hype API took too long to respond."
            : err instanceof TypeError
              ? `Couldn't reach the Hype API at ${HYPE_API}. Is it running?`
              : err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => clearTimeout(timeout));

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [preset, attempt]);

  const retry = () => {
    setState({ status: "loading" });
    setAttempt((a) => a + 1);
  };

  if (!preset) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-10 text-center text-white/75">
        <div className="max-w-md">
          <p className="text-lg font-medium text-white/90">Hype data unavailable for this call</p>
          <p className="mt-3 text-sm leading-relaxed">
            Hype scoring needs a verified call date. Open Apple, Alphabet, Shell, Tesla, or Walmart from the library.
          </p>
        </div>
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-8">
        <p className="text-sm text-white/50 animate-pulse text-center">
          Scoring X posts for credibility… this can take up to 2 minutes.
        </p>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
        <p className="text-sm text-red-400">{state.message}</p>
        <button type="button" onClick={retry} className="btn-outline">
          Try again
        </button>
      </div>
    );
  }

  const { data } = state;
  const score = data.score as number;
  const cmp = data.comparison;
  const posts = [...data.posts].sort((a, b) => (b.credibility ?? 0) - (a.credibility ?? 0)).slice(0, 10);

  return (
    <div className="flex flex-col w-full h-full overflow-y-auto">
      {/* Score */}
      <div className="px-4 pt-3 pb-1">
        <p className="text-[10px] text-white/40 uppercase tracking-widest font-semibold">
          Credibility-Weighted Hype Score
        </p>
      </div>
      <div className="mx-4 mb-3 flex items-baseline gap-3 bg-white/4 border border-white/10 rounded-[15px] px-4 py-3">
        <span className={`text-3xl font-semibold tabular-nums ${toneColor(score)}`}>{signed(score)}</span>
        <span className="text-sm text-white/70">
          {data.label ?? (score > 10 ? "Market leans bullish" : score < -10 ? "Market leans bearish" : "Market is mixed")}
        </span>
        <span className="ml-auto text-xs text-white/40">
          {preset.company} ({data.ticker || preset.ticker}), {data.call_date || preset.callDate}
        </span>
      </div>

      {/* Management vs. market */}
      {cmp && (cmp.management != null || cmp.market != null) && (
        <>
          <div className="px-4 pb-1">
            <p className="text-[10px] text-white/40 uppercase tracking-widest font-semibold mb-2">
              Management vs. Market
            </p>
          </div>
          <div className="mx-4 mb-3 bg-white/4 border border-white/10 rounded-[15px] px-4 py-3">
            <div className="flex justify-between text-[10px] text-white/40 mb-1">
              <span>Bearish</span>
              <span>Bullish</span>
            </div>
            <div className="relative h-6" aria-hidden>
              <span className="absolute inset-x-0 top-1/2 h-px bg-white/10" />
              <span className="absolute left-1/2 top-1 bottom-1 w-px bg-white/15" />
              {cmp.management != null && cmp.market != null && (
                <span
                  className="absolute top-1/2 -mt-px h-0.5 bg-white/30"
                  style={{
                    left: pos(Math.min(cmp.management, cmp.market)),
                    width: `${Math.abs(cmp.management - cmp.market) / 2}%`,
                  }}
                />
              )}
              {cmp.management != null && (
                <span
                  className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sky-400 bg-background"
                  style={{ left: pos(cmp.management) }}
                />
              )}
              {cmp.market != null && (
                <span
                  className={`absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                    cmp.market > 10 ? "bg-green-400" : cmp.market < -10 ? "bg-red-400" : "bg-amber-300"
                  }`}
                  style={{ left: pos(cmp.market) }}
                />
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-white/70">
              <span className="inline-flex items-center gap-1.5">
                <i className="size-2.5 rounded-full border-2 border-sky-400" />
                Management {cmp.management != null ? signed(cmp.management) : "–"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="size-2.5 rounded-full bg-white/70" />
                X reaction {cmp.market != null ? signed(cmp.market) : "–"}
              </span>
            </div>
            {cmp.summary && <p className="mt-2 text-sm text-white/80 leading-snug">{cmp.summary}</p>}
          </div>
        </>
      )}

      {/* Posts */}
      <div className="px-4 pb-4">
        <h2 className="text-xs font-bold text-white/70 uppercase tracking-widest mb-3">
          Most Credible Posts
        </h2>
        {posts.length === 0 ? (
          <p className="text-sm text-white/50">No posts were returned for this call.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {posts.map((p, i) => {
              const url = safeUrl(p.url);
              const sentiment = p.sentiment == null ? null : p.sentiment * 100;
              return (
                <div key={i} className="bg-white/4 border border-white/10 rounded-[15px] px-4 py-3">
                  <div className="flex items-center gap-3 text-xs text-white/50">
                    <span className="font-medium text-white/80">{p.author ?? "Unknown author"}</span>
                    {sentiment != null && (
                      <span className={toneColor(sentiment)}>
                        {sentiment > 10 ? "Bullish" : sentiment < -10 ? "Bearish" : "Neutral"}
                      </span>
                    )}
                    {p.credibility != null && (
                      <span className="ml-auto inline-flex items-center gap-2" title="Credibility score">
                        <span className="h-1 w-16 overflow-hidden rounded-full bg-white/10">
                          <span
                            className="block h-full rounded-full bg-green-400"
                            style={{ width: `${Math.max(0, Math.min(1, p.credibility)) * 100}%` }}
                          />
                        </span>
                        <span className="tabular-nums">{Math.round(p.credibility * 100)}</span>
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm text-white/80 leading-snug">{p.text}</p>
                  {url && (
                    <p className="mt-1.5 text-xs">
                      <a href={url} target="_blank" rel="noopener noreferrer" className="text-green-400 hover:underline">
                        View post
                      </a>
                      {!p.verified && <span className="ml-2 text-white/40">(not in Grok&apos;s citations)</span>}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
