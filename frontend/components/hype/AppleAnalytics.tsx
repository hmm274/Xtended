"use client";

import { useEffect, useState } from "react";
import { Chart as ChartJS, BarElement, CategoryScale, LinearScale, LineElement, PointElement, Tooltip } from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import { HYPE_API_BASE_URL } from "@/lib/api-config";
import { formatVideoTime, getVideoTime } from "@/lib/videoClock";
import type { DemoAnalytics } from "./types";

ChartJS.register(BarElement, CategoryScale, LinearScale, LineElement, PointElement, Tooltip);

const count = (n: number) => n.toLocaleString("en-US");

export default function AppleAnalytics() {
  const [demo, setDemo] = useState<DemoAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const response = await fetch(`${HYPE_API_BASE_URL}/api/demo/apple/analytics?t=${getVideoTime() ?? 0}`, { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error(`Request failed (${response.status})`);
        const data = await response.json() as DemoAnalytics;
        if (!controller.signal.aborted) { setDemo(data); setError(null); }
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Unable to load demo");
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(refresh, 1000);
      }
    };
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, []);

  if (error && !demo) return <p className="p-6 text-sm text-destructive">Unable to load analytics. Check that the Hype service is running on port 8002.</p>;
  if (!demo) return <p className="p-6 text-sm text-muted-foreground">Loading demo analytics…</p>;

  const times = demo.points.map((point) => point.video_time != null ? formatVideoTime(point.video_time) : new Date(point.timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "America/New_York",
  }));
  const metrics = [
    { key: "posts", label: "Posts", color: "#88a5ff" },
    { key: "likes", label: "Likes", color: "#80d18d" },
    { key: "reposts", label: "Reposts", color: "#e0a43e" },
    { key: "views", label: "Views", color: "#80c8e8" },
  ] as const;

  return (
    <section aria-label="Apple demo analytics" className="grid min-h-0 w-full flex-1 grid-cols-2 grid-rows-2 gap-x-5 gap-y-3 p-3">
        {metrics.map(({ key, label, color }) => {
          const values = demo.points.map((point) => point[key]);
          // Totals are cumulative, so each interval's volume is the change from the previous point
          const volume = values.map((value, index) => index === 0 ? null : value - values[index - 1]);
          const latest = volume.at(-1) ?? 0;
          return <div key={key} className="flex min-h-0 min-w-0 w-full flex-col">
            <div className="relative min-h-0 flex-[3]">
              <Line role="img" aria-label={`Simulated real-time ${label}; latest total ${values.at(-1) ?? 0}`}
                data={{ labels: times, datasets: [{ label: `${label} (demo)`, data: values, borderColor: color, backgroundColor: color, tension: 0.25, pointRadius: 1, borderWidth: 2 }] }}
                options={{ responsive: true, maintainAspectRatio: false, animation: { duration: 400 }, plugins: { legend: { display: false } },
                  scales: { x: { display: false },
                    y: { beginAtZero: true, title: { display: true, text: label, color }, grid: { color: "rgba(255,255,255,0.07)" }, ticks: { color: "#a3a3a3", maxTicksLimit: 4, precision: 0 } } } }} />
            </div>
            <div className="relative min-h-0 flex-[2]">
              <Bar role="img" aria-label={`New ${label.toLowerCase()} per 5-second interval; latest ${latest}`}
                data={{ labels: times, datasets: [{ label: `New ${label.toLowerCase()} per 5s (demo)`, data: volume, backgroundColor: `${color}99`, borderRadius: 2 }] }}
                options={{ responsive: true, maintainAspectRatio: false, animation: { duration: 400 }, plugins: { legend: { display: false },
                    tooltip: { callbacks: { label: (item) => `+${count(item.parsed.y ?? 0)} ${label.toLowerCase()} in 5s` } } },
                  scales: { x: { grid: { display: false }, ticks: { color: "#a3a3a3", maxRotation: 0, maxTicksLimit: 5 } },
                    y: { beginAtZero: true, title: { display: true, text: "per 5s", color: "#a3a3a3" }, grid: { color: "rgba(255,255,255,0.07)" }, ticks: { color: "#a3a3a3", maxTicksLimit: 2, precision: 0 } } } }} />
            </div>
            <p className="mt-1 shrink-0 text-xs tabular-nums text-muted-foreground">
              Last 5s: <span style={{ color }}>+{count(latest)}</span> · Total {count(values.at(-1) ?? 0)}
            </p>
          </div>;
        })}
    </section>
  );
}
