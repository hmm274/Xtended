// Current playback time of the dashboard's YouTube player, shared with the live Hype charts.
// VideoFrame writes it from the player's infoDelivery messages; null until the player reports.
let current: number | null = null;

export function setVideoTime(seconds: number | null) {
  current = seconds;
}

export function getVideoTime() {
  return current;
}

/** "mm:ss" (or "h:mm:ss") for a position in the video. */
export function formatVideoTime(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mmss = `${String(m).padStart(h ? 2 : 1, "0")}:${String(sec).padStart(2, "0")}`;
  return h ? `${h}:${mmss}` : mmss;
}
