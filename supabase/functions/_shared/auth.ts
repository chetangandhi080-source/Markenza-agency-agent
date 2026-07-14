// Auth helpers — verify the calling user from a Supabase JWT (anon key
// does NOT work here, this is a real logged-in user) OR allow a CRON
// secret for server-to-server invocations.

import { createClient as createSupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type { AppConfig } from "./config.ts";

export interface Caller {
  kind: "user" | "cron";
  orgId: string;
  userId?: string;
}

export async function resolveCaller(req: Request, cfg: AppConfig): Promise<Caller> {
  const auth = req.headers.get("authorization") ?? "";
  const cronHeader = req.headers.get("x-markenza-source") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";

  // 1) Cron path
  if (bearer && bearer === cfg.cronSecret) {
    // pull first org from the DB; single-user system
    const sb = createSupabaseClient(cfg.supabaseUrl, cfg.supabaseServiceKey, { auth: { persistSession: false } });
    const { data, error } = await sb.from("orgs").select("id").order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (error || !data) throw new Error("cron caller: no orgs configured");
    return { kind: "cron", orgId: data.id };
  }

  // 2) User path: must be a real Supabase user JWT
  if (!bearer) throw httpErr(401, "missing bearer token");
  const sb = createSupabaseClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
    auth: { persistSession: false },
  });
  const { data: u, error: uErr } = await sb.auth.getUser();
  if (uErr || !u.user) throw httpErr(401, "invalid user token");

  const { data: p, error: pErr } = await sb.from("profiles").select("org_id").eq("id", u.user.id).maybeSingle();
  if (pErr || !p) throw httpErr(403, "no profile/org for user");
  return { kind: "user", orgId: p.org_id, userId: u.user.id };
}

function httpErr(status: number, msg: string): Error & { status: number } {
  const e = new Error(msg) as Error & { status: number };
  e.status = status;
  return e;
}
