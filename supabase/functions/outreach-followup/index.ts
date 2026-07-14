// =====================================================================
// outreach-followup
// Scans leads contacted > N days ago with no reply, enqueues a
// follow-up generate job for them. Runs daily via orchestrator.
// =====================================================================

import { loadConfig } from "../_shared/config.ts";
import { newSB } from "../_shared/supabase.ts";
import { enqueue, log } from "../_shared/jobs.ts";
import { handlePreflight, ok, serverError, json } from "../_shared/cors.ts";
import { resolveCaller } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  try {
    const cfg = loadConfig();
    const caller = await resolveCaller(req, cfg);
    const sb = newSB(cfg);

    const daysAgo = 3; // touched >= 3 days ago
    const cutoff = new Date(Date.now() - daysAgo * 86_400_000).toISOString();

    const { data: leads, error } = await sb.from<Array<Record<string, unknown>>>("leads")
      .select("id,status,last_touched_at,cooldown_until", {
        org_id: `eq.${caller.orgId}`,
        status: "eq.contacted",
        last_touched_at: `lte.${cutoff}`,
        limit: "100",
      });
    if (error) throw new Error(error.message);

    let enqueued = 0;
    for (const lead of leads ?? []) {
      if (lead.cooldown_until && new Date(lead.cooldown_until as string) > new Date()) continue;
      await enqueue(sb, { orgId: caller.orgId, kind: "outreach.generate", payload: { lead_id: lead.id as string, step: 2 } });
      enqueued++;
    }

    await log(sb, { orgId: caller.orgId, actor: "outreach_agent", action: "followups.scanned", details: { scanned: leads?.length ?? 0, enqueued } });
    return ok({ scanned: leads?.length ?? 0, enqueued });
  } catch (e) {
    return serverError(String((e as Error).message ?? e));
  }
});
