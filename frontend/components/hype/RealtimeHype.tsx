"use client";

import { useEffect, useState } from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, LineElement, PointElement, Tooltip } from "chart.js";
import { Line } from "react-chartjs-2";
import { HYPE_API_BASE_URL } from "@/lib/api-config";
import type { DemoSentiment, SentimentPoint } from "./types";

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Tooltip);

const formatTime = (timestamp: string) => new Date(timestamp).toLocaleTimeString("en-US", {
  hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "America/New_York",
});
const scoreText = (score: number) => `${score > 0 ? "+" : ""}${score}`;

export default function RealtimeHype({ showTimeline = true }: { showTimeline?: boolean }) {
  const [feed, setFeed] = useState<DemoSentiment | null>(null);
  const [selection, setSelection] = useState<SentimentPoint | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const response = await fetch(`${HYPE_API_BASE_URL}/api/demo/apple/sentiment`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load sentiment");
        const data = await response.json() as DemoSentiment;
        if (!controller.signal.aborted) { setFeed(data); setError(false); }
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, 3000);
      }
    };
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, []);

  const points = feed?.points ?? [];
  const selectedIndex = selection ? points.findIndex((point) => point.id === selection.id) : points.length - 1;
  const selected = selection ?? points.at(-1);
  if (!selected) return <p className="p-5 text-sm text-muted-foreground">{error ? "Unable to load sentiment. Retrying…" : "Loading sentiment…"}</p>;

  const step = (direction: number) => {
    const next = points[selectedIndex + direction];
    if (next) setSelection(next);
  };

  return (
    <section className="w-full p-4 sm:p-5" aria-label="Simulated live Apple sentiment">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">{showTimeline ? "Total sentiment score" : "Live quotes"}</h2>
          {showTimeline && <p className="mt-1 text-2xl font-semibold tabular-nums">{scoreText(selected.total_sentiment_score)}</p>}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-amber-300">Demo</span>
          <span className={error ? "text-amber-300" : selection ? "text-muted-foreground" : "text-brand"}>
            {error ? "Reconnecting…" : selection ? "Reviewing" : "Live simulation"}
          </span>
          {selection && <button type="button" className="btn-outline" onClick={() => setSelection(null)}>Back to live</button>}
        </div>
      </div>
      {showTimeline && <div className="mt-3 h-44 w-full">
        <Line role="img" aria-label="Running total of simulated quote sentiment scores over time. Use Previous and Next to review each quote."
          data={{ labels: points.map((point) => formatTime(point.timestamp)), datasets: [{
            label: "Total sentiment score (demo)", data: points.map((point) => point.total_sentiment_score),
            borderColor: "#9aa6ff", borderWidth: 2, tension: 0.15,
            pointRadius: points.map((_, index) => index === selectedIndex ? 6 : 2),
            pointBackgroundColor: points.map((point, index) => index === selectedIndex ? "#ffffff" : point.sentiment_score >= 0 ? "#80d18d" : "#e06b6b"),
            pointHitRadius: 12,
          }] }}
          options={{ responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
            interaction: { mode: "nearest", axis: "x", intersect: false },
            onClick: (_, elements) => { const index = elements[0]?.index; if (index !== undefined) setSelection(points[index]); },
            plugins: { legend: { display: false } },
            scales: { x: { grid: { display: false }, ticks: { color: "#a3a3a3", maxRotation: 0, maxTicksLimit: 5 } },
              y: { beginAtZero: true, grid: { color: "rgba(255,255,255,0.07)" }, ticks: { color: "#a3a3a3", maxTicksLimit: 5, precision: 0 } } } }} />
      </div>}
      <div className="mt-3 flex items-center justify-between gap-3">
        <button type="button" className="btn-outline disabled:opacity-40" disabled={selectedIndex <= 0} onClick={() => step(-1)}>Previous</button>
        <time className="text-xs tabular-nums text-muted-foreground" dateTime={selected.timestamp}>{formatTime(selected.timestamp)} ET</time>
        <button type="button" className="btn-outline disabled:opacity-40" disabled={selectedIndex >= points.length - 1} onClick={() => step(1)}>Next</button>
      </div>
      <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">Sample reaction</span>
          <span className={`text-sm font-semibold tabular-nums ${selected.sentiment_score >= 0 ? "text-brand" : "text-red-400"}`}>Sentiment {scoreText(selected.sentiment_score)}</span>
        </div>
        <blockquote className="mt-2 text-sm leading-relaxed">“{selected.quote}”</blockquote>
      </div>
    </section>
  );
}
