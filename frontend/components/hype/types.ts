// Mirrors hype/app/schemas.py. Keep the two in sync when adding fields.
export type Verdict = "BELIEVED" | "DOUBTED" | "IGNORED" | "CONTRADICTED";
export type Who = "analyst" | "retail" | "journalist" | "employee_or_customer" | "company" | "other";

export interface Jargon { term: string; plain: string }
export interface Evidence { summary: string; url: string | null; who: Who; verified: boolean }

export interface Claim {
  id: string;
  claim: string;
  quote: string;
  speaker: string | null;
  timestamp: string | null;
  category: string;
  ceo_tone: number;          // -1 bearish, 0 neutral, +1 bullish
  jargon: Jargon[];
  verdict: Verdict | null;
  x_sentiment: number | null; // -100..100
  reason: string | null;
  evidence: Evidence[];
  gap: number | null;
}

export interface DodgedItem {
  topic: string;
  why_it_matters: string;
  heat: "high" | "medium" | "low";
  deflected: boolean;
  evidence_url: string | null;
}
export interface WhoGroup { who: Who; posts: number; agreement: number }
export interface DemoPost { text: string; published_date: string; likes: number; reposts: number; views: number }
export interface AnalyticsPoint { timestamp: string; video_time?: number | null; posts: number; likes: number; reposts: number; views: number }
export interface DemoAnalytics { mock: true; points: AnalyticsPoint[] }
export interface SentimentPoint { id: string; timestamp: string; video_time?: number | null; quote: string; speaker?: string | null; sentiment_score: number; total_sentiment_score: number }
export interface DemoSentiment { mock: true; points: SentimentPoint[] }

export interface ModuleResult<T> { tier: number; data?: T; error?: string }

export interface Analysis {
  ticker: string;
  company: string;
  call_date: string;
  story: string | null;
  price_move_pct: number | null;
  overall_x_sentiment: number | null;
  hype_gap: number | null;
  hype_label: string | null;
  claims: Claim[];
  sources: string[];
  modules: {
    dodged?: ModuleResult<{ items: DodgedItem[] }>;
    who_split?: ModuleResult<{ groups: WhoGroup[] }>;
    [name: string]: ModuleResult<unknown> | undefined;
  };
  mock: boolean;
  demo_posts: DemoPost[];
}

export type Stage = "queued" | "extracting" | "checking_market" | "running_modules" | "done" | "error";
export interface Job { id: string; stage: Stage; message: string; analysis: Analysis | null; error: string | null }
