// =====================================================================
// outreach-discover
// Runs an Apify LinkedIn search for a given search URL set, normalizes
// the results, and inserts them as leads in `new` status. Also kicks
// off an `outreach.generate` job per inserted lead.
// =====================================================================

import { loadConfig } from "../_shared/config.ts";
import { newSB } from "../_shared/supabase.ts";
import { Apify, normalizeLinkedInProfile } from "../_shared/apify.ts";
import { enqueue, log } from "../_shared/jobs.ts";
import { handlePreflight, ok, serverError, badRequest, json } from "../_shared/cors.ts";
import { resolveCaller } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  try {
    const cfg = loadConfig();
    const caller = await resolveCaller(req, cfg);
    const body = await req.json().catch(() => ({})) as {
      searchUrls?: string[];
      maxItems?: number;
    };
    const searchUrls = body.searchUrls ?? [];
    if (searchUrls.length === 0) return badRequest("searchUrls[] required");

    const apify = new Apify(cfg);
    const sb = newSB(cfg);
    const raw = await apify.runLinkedInScraper(searchUrls, body.maxItems ?? 25);

    let inserted = 0;
    for (const item of raw) {
      const norm = normalizeLinkedInProfile(item);
      const linkedinUrl = norm.linkedin_url as string | undefined;
      if (!linkedinUrl) continue;

      const { data: existing } = await sb.from<Array<{ id: string }>>(
        "leads",
      ).select("id", { linkedin_url: `eq.${linkedinUrl}`, limit: "1" });
      if (existing && existing.length > 0) continue;

      const row = {
        org_id: caller.orgId,
        source: "apify_linkedin",
        external_id: norm.external_id as string,
        full_name: norm.full_name as string,
        headline: norm.headline as string,
        company: norm.company as string,
        title: norm.title as string,
        location: norm.location as string,
        linkedin_url: linkedinUrl,
        raw_profile: norm.raw as Record<string, unknown>,
        status: "new",
      };
      const { data: ins, error } = await sb.from<Array<{ id: string }>>("leads").insert(row);
      if (error) continue;
      const leadId = ins?.[0]?.id;
      if (leadId) {
        await enqueue(sb, { orgId: caller.orgId, kind: "outreach.generate", payload: { lead_id: leadId } });
        inserted++;
      }
    }

    await log(sb, {
      orgId: caller.orgId, actor: "outreach_agent", action: "leads.discovered",
      details: { requested: searchUrls.length, returned: raw.length, inserted },
    });

    return ok({ inserted, returned: raw.length });
  } catch (e) {
    return serverError(String((e as Error).message ?? e));
  }
});
