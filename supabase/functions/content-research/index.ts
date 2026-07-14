// =====================================================================
// content-research
// Asks Hermes to generate a fresh batch of LinkedIn content topics
// (sourced from the configured pillars), avoiding the last 20 topics.
// Writes them to content_topics in `idea` status.
// =====================================================================

import { loadConfig } from "../_shared/config.ts";
import { newSB } from "../_shared/supabase.ts";
import { Hermes } from "../_shared/hermes.ts";
import { log } from "../_shared/jobs.ts";
import { SYSTEM_PERSONA, contentTopicPrompt } from "../_shared/prompts.ts";
import { handlePreflight, ok, serverError, json } from "../_shared/cors.ts";
import { resolveCaller } from "../_shared/auth.ts";

interface ResearchPayload { count?: number; }

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  try {
    const cfg = loadConfig();
    const caller = await resolveCaller(req, cfg);
    const sb = newSB(cfg);
    const hermes = new Hermes(cfg);

    const body = (req.method === "GET" ? null : await req.json().catch(() => null)) as ResearchPayload | null;
    const count = body?.count ?? 5;

    const { data: settings } = await sb.from<Array<{ offer_summary: string | null; icp_personas: unknown[] }>>(
      "settings",
    ).select("offer_summary,icp_personas", { org_id: `eq.${caller.orgId}`, limit: "1" });
    const offerSummary = settings?.[0]?.offer_summary ??
      "Markenza runs AI automation + Google Ads + performance marketing for e-commerce, coaches, local businesses, and agencies. Packages $500–$1,500/mo.";

    const { data: recent } = await sb.from<Array<{ title: string; hook: string | null }>>("content_topics")
      .select("title,hook", { org_id: `eq.${caller.orgId}`, order: "created_at.desc", limit: "20" });

    const pillars = ["AI Automation Wins", "Google Ads Teardowns", "Solo Agency Operations", "Client Case Studies", "Contrarian Marketing Takes"];

    const out = await hermes.json<{ topics: Array<{ pillar: string; title: string; hook: string; angle: string; outline: string[] }> }>([
      { role: "system", content: SYSTEM_PERSONA },
      { role: "user", content: contentTopicPrompt({ pillars, recentPosts: recent ?? [], offerSummary, count }) },
    ], { temperature: 0.7 });

    let inserted = 0;
    for (const t of out.topics ?? []) {
      const { error } = await sb.from("content_topics").insert({
        org_id: caller.orgId,
        pillar: t.pillar,
        title: t.title,
        hook: t.hook,
        outline: t.outline ?? [],
        status: "idea",
      });
      if (!error) inserted++;
    }

    await log(sb, { orgId: caller.orgId, actor: "content_agent", action: "topics.generated", details: { requested: count, inserted } });
    return ok({ requested: count, inserted, topics: out.topics });
  } catch (e) {
    return serverError(String((e as Error).message ?? e));
  }
});
