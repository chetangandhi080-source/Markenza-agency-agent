// =====================================================================
// auth-bootstrap
// Creates the single Markenza user in Supabase Auth and links them to
// the default org + settings. Call this ONCE during setup, then disable
// the function in production (set deno.deploy.permissions to revoke).
// =====================================================================

import { loadConfig } from "../_shared/config.ts";
import { handlePreflight, ok, serverError, badRequest, json } from "../_shared/cors.ts";

interface BootBody { email: string; password: string; full_name?: string; }

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  try {
    const cfg = loadConfig();
    const body = await req.json().catch(() => ({})) as BootBody;
    if (!body.email || !body.password) return badRequest("email + password required");

    // 1) Create user via admin API
    const res = await fetch(`${cfg.supabaseUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: cfg.supabaseServiceKey,
        Authorization: `Bearer ${cfg.supabaseServiceKey}`,
      },
      body: JSON.stringify({
        email: body.email,
        password: body.password,
        email_confirm: true,
        user_metadata: { full_name: body.full_name ?? "" },
      }),
    });
    const text = await res.text();
    if (!res.ok) return json({ ok: false, step: "create_user", status: res.status, error: text }, { status: 500 });
    const user = JSON.parse(text) as { id: string; email: string };

    // 2) The DB trigger `handle_new_user` will auto-attach the org + profile + settings.
    // 3) Optionally seed the offer summary into settings.
    const settingsRes = await fetch(
      `${cfg.supabaseUrl}/rest/v1/settings?org_id=in.%28select+id+from+orgs+order+by+created_at+asc+limit+1%29`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          apikey: cfg.supabaseServiceKey,
          Authorization: `Bearer ${cfg.supabaseServiceKey}`,
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          offer_summary:
            "Markenza runs AI automation + Google Ads + performance marketing for e-commerce, coaches/consultants, local businesses, and agencies. Packages $500–$1,500/mo.",
        }),
      },
    );

    return ok({
      user_id: user.id,
      email: user.email,
      note: "DB trigger handle_new_user created org + profile + settings. Seed offer summary applied.",
      settings_status: settingsRes.status,
    });
  } catch (e) {
    return serverError(String((e as Error).message ?? e));
  }
});
