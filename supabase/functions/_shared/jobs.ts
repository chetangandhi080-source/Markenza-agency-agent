// Job queue helpers — enqueue, claim, finish, and log activity.
import type { SB } from "./supabase.ts";

export type JobKind =
  | "outreach.discover"
  | "outreach.generate"
  | "outreach.send"
  | "outreach.followup"
  | "content.research"
  | "content.generate"
  | "orchestrator.tick";

export interface EnqueueOpts {
  orgId: string;
  kind: JobKind;
  payload?: Record<string, unknown>;
  runAfter?: string;          // ISO
  maxAttempts?: number;
}

export async function enqueue(sb: SB, opts: EnqueueOpts): Promise<string> {
  const { data, error } = await sb.from("jobs").insert({
    org_id: opts.orgId,
    kind: opts.kind,
    payload: opts.payload ?? {},
    run_after: opts.runAfter ?? new Date().toISOString(),
    max_attempts: opts.maxAttempts ?? 3,
    status: "pending",
  });
  if (error) throw new Error(`enqueue failed: ${error.message}`);
  const id = (data as Array<{ id: string }>)[0]?.id;
  if (!id) throw new Error("enqueue returned no id");
  return id;
}

// Atomically claim the next ready job of a given kind (or any).
export async function claimNext(sb: SB, kind: string | null = null): Promise<Record<string, unknown> | null> {
  const filter: Record<string, string> = {
    status: "eq.pending",
    "run_after": `lte.${new Date().toISOString()}`,
    order: "run_after.asc",
    limit: "1",
  };
  if (kind) filter.kind = `eq.${kind}`;

  // We can't use a transaction over REST, so do a two-step claim:
  // 1) find the next id
  const { data: rows, error: selErr } = await sb.from<Array<Record<string, unknown>>>("jobs")
    .select("id,attempts", filter);
  if (selErr) throw new Error(`claim select failed: ${selErr.message}`);
  const job = rows?.[0];
  if (!job) return null;

  // 2) optimistically mark it running
  const { data: upd, error: updErr } = await sb.from<Array<Record<string, unknown>>>("jobs")
    .update(
      { status: "running", started_at: new Date().toISOString() },
      { id: `eq.${job.id}`, status: "eq.pending" },
    );
  if (updErr || !upd || upd.length === 0) return null; // someone else got it
  return upd[0];
}

export async function finish(sb: SB, jobId: string, result: { ok: boolean; result?: unknown; error?: string }): Promise<void> {
  const status = result.ok ? "succeeded" : "failed";
  const patch: Record<string, unknown> = {
    status,
    finished_at: new Date().toISOString(),
    result: result.result ?? null,
  };
  if (!result.ok) patch.error = result.error ?? "unknown error";
  const { error } = await sb.from("jobs").update(patch, { id: `eq.${jobId}` });
  if (error) throw new Error(`finish failed: ${error.message}`);
}

export async function requeueOrFail(sb: SB, jobId: string, attempts: number, maxAttempts: number, error: string): Promise<void> {
  if (attempts + 1 >= maxAttempts) {
    await finish(sb, jobId, { ok: false, error });
    return;
  }
  // exponential backoff: 1m, 5m, 30m
  const delays = [60_000, 300_000, 1_800_000];
  const wait = delays[attempts] ?? 1_800_000;
  await sb.from("jobs").update(
    {
      status: "pending",
      attempts: attempts + 1,
      run_after: new Date(Date.now() + wait).toISOString(),
      error,
    },
    { id: `eq.${jobId}` },
  );
}

export async function log(sb: SB, args: {
  orgId: string;
  actor: "user" | "outreach_agent" | "content_agent" | "orchestrator" | "system";
  action: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  await sb.from("activity_log").insert({
    org_id: args.orgId,
    actor: args.actor,
    action: args.action,
    entity_type: args.entityType ?? null,
    entity_id: args.entityId ?? null,
    details: args.details ?? {},
  });
}
