// =====================================================================
// orchestrator
// The single entry point for pg_cron. Decides what to run based on
// local time of day and enqueues child jobs into the queue.
// Runs sub-agents synchronously here (small fan-out) so we keep the
// edge function simple — heavier work is queued for self-invocation.
// =====================================================================

import { loadConfig } from "../_shared/config.ts";
import { newSB } from "../_shared/supabase.ts";
import { enqueue, log, claimNext, finish, requeueOrFail } from "../_shared/jobs.ts";
import { handlePreflight, ok, serverError, json } from "../_shared/cors.ts";
import { resolveCaller } from "../_shared/auth.ts";

interface TickBody { source?: string; tick_at?: string; }

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  try {
    const cfg = loadConfig();
    const caller = await resolveCaller(req, cfg);
    const sb = newSB(cfg);

    // Read body even if not used, for future extensibility
    await req.json().catch(() => ({} as TickBody));

    const now = new Date();
    const hour = now.getUTCHours();            // use UTC for deterministic scheduling
    const dayOfWeek = now.getUTCDay();         // 0..6

    const actions: Array<Record<string, unknown>> = [];

    // 1) Always drain the job queue (process up to 5 jobs per tick)
    for (let i = 0; i < 5; i++) {
      const job = await claimNext(sb);
      if (!job) break;
      try {
        const result = await runJobInline(sb, cfg, job);
        await finish(sb, job.id as string, { ok: true, result });
        actions.push({ kind: job.kind, status: "succeeded" });
      } catch (e) {
        const err = String((e as Error).message ?? e);
        await requeueOrFail(
          sb,
          job.id as string,
          (job.attempts as number) ?? 0,
          (job.max_attempts as number) ?? 3,
          err,
        );
        actions.push({ kind: job.kind, status: "failed", error: err });
      }
    }

    // 2) Once a day (07:00 UTC = ~12:30pm IST), run research + draft a post
    if (hour === 7) {
      const jobId = await enqueue(sb, { orgId: caller.orgId, kind: "content.research", payload: { count: 5 } });
      actions.push({ kind: "content.research.enqueued", id: jobId });
    }

    // 3) Mondays (dayOfWeek=1) at 08:00 UTC: ask Hermes to draft a 5-post week
    if (dayOfWeek === 1 && hour === 8) {
      const jobId = await enqueue(sb, { orgId: caller.orgId, kind: "content.research", payload: { count: 7 } });
      actions.push({ kind: "content.weekly.enqueued", id: jobId });
    }

    // 4) Twice a day (10:00 and 16:00 UTC) check for follow-ups
    if (hour === 10 || hour === 16) {
      const jobId = await enqueue(sb, { orgId: caller.orgId, kind: "outreach.followup", payload: {} });
      actions.push({ kind: "outreach.followup.enqueued", id: jobId });
    }

    await log(sb, {
      orgId: caller.orgId, actor: "orchestrator", action: "tick",
      details: { hour, dayOfWeek, actions },
    });

    return ok({ tick_at: now.toISOString(), actions });
  } catch (e) {
    return serverError(String((e as Error).message ?? e));
  }
});

// Run a queued job by calling the corresponding function. We use the
// orchestrator's service-role context to re-invoke via HTTP. This keeps
// scheduling decisions in one place and means sub-agent functions are
// 100% callable both via cron and direct API.
async function runJobInline(
  sb: ReturnType<typeof newSB>,
  cfg: ReturnType<typeof loadConfig>,
  job: Record<string, unknown>,
): Promise<unknown> {
  const kind = job.kind as string;
  const map: Record<string, string> = {
    "outreach.discover": "outreach-discover",
    "outreach.generate": "outreach-generate",
    "outreach.send": "outreach-send",
    "outreach.followup": "outreach-followup",
    "content.research": "content-research",
    "content.generate": "content-generate",
  };
  const fn = map[kind];
  if (!fn) throw new Error(`unknown job kind: ${kind}`);

  const res = await fetch(`${cfg.supabaseUrl}/functions/v1/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.cronSecret}`,
    },
    body: JSON.stringify(job.payload ?? {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${fn} ${res.status}: ${text.slice(0, 400)}`);
  try { return JSON.parse(text); } catch { return text; }
}
