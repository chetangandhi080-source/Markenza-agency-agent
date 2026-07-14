// Apify client — start an actor run and poll for dataset results.
// We use the synchronous waitForFinish pattern with a short timeout to
// keep edge-function execution under 60s where possible.

import type { AppConfig } from "./config.ts";

export interface ApifyRunResponse { id: string; actId: string; status: string; defaultDatasetId: string; }
export interface ApifyDatasetItem extends Record<string, unknown> { }

export class Apify {
  constructor(private cfg: AppConfig) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return { "Content-Type": "application/json", Authorization: `Bearer ${this.cfg.apifyToken}`, ...extra };
  }

  async runLinkedInScraper(searchUrls: string[], maxItems = 25): Promise<ApifyDatasetItem[]> {
    if (searchUrls.length === 0) return [];
    const input = { searchUrls, maxItems };
    const run = await this.startActor(this.cfg.apifyLinkedInActor, input);
    return this.waitAndFetch(run.defaultDatasetId, run.id, maxItems);
  }

  async startActor(actor: string, input: unknown): Promise<ApifyRunResponse> {
    const res = await fetch(`https://api.apify.com/v2/acts/${encodeURIComponent(actor)}/runs`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`Apify start failed ${res.status}: ${await res.text()}`);
    return await res.json() as ApifyRunResponse;
  }

  async waitAndFetch(datasetId: string, runId: string, maxItems: number, timeoutMs = 90_000): Promise<ApifyDatasetItem[]> {
    const deadline = Date.now() + timeoutMs;
    let status = "RUNNING";
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));
      const r = await fetch(`https://api.apify.com/v2/actor-runs/${runId}`, { headers: this.headers() });
      if (!r.ok) continue;
      const j = await r.json() as { data?: { status?: string } };
      status = j.data?.status ?? status;
      if (["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(status)) break;
    }
    if (status !== "SUCCEEDED") throw new Error(`Apify run ${runId} ended with status ${status}`);

    const r = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?limit=${maxItems}`, { headers: this.headers() });
    if (!r.ok) throw new Error(`Apify dataset fetch failed ${r.status}: ${await r.text()}`);
    return await r.json() as ApifyDatasetItem[];
  }
}

export function normalizeLinkedInProfile(raw: ApifyDatasetItem): Record<string, unknown> {
  // Tolerant mapper for the most common LinkedIn scraper schemas.
  const pick = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = raw[k];
      if (typeof v === "string" && v.trim()) return v;
    }
    return undefined;
  };
  const obj = (k: string): Record<string, unknown> | undefined =>
    raw[k] && typeof raw[k] === "object" ? raw[k] as Record<string, unknown> : undefined;
  const arr = (k: string): unknown[] => Array.isArray(raw[k]) ? raw[k] as unknown[] : [];

  const fullName = pick("fullName", "full_name", "name") ??
    [pick("firstName"), pick("lastName")].filter(Boolean).join(" ").trim() || undefined;
  const headline = pick("headline", "title", "occupation");
  const companyObj = obj("company") ?? obj("currentCompany");
  const company = pick("company", "companyName") ?? (companyObj ? pick("name") : undefined) ??
    (arr("experiences")[0] as Record<string, unknown> | undefined)?.companyName as string | undefined;
  const location = pick("location", "city", "geoLocation");
  const linkedinUrl = pick("linkedinUrl", "url", "profileUrl", "linkedin_profile_url") ??
    (typeof raw.publicIdentifier === "string" ? `https://www.linkedin.com/in/${raw.publicIdentifier}` : undefined);
  const externalId = pick("id", "profileId", "publicIdentifier", "urn") ?? linkedinUrl;

  return {
    external_id: externalId,
    full_name: fullName,
    headline,
    company,
    title: headline,
    location,
    linkedin_url: linkedinUrl,
    raw,
  };
}
