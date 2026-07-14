// =====================================================================
// outreach-generate
// 1) Fetches the lead and the org's offer summary.
// 2) Asks Hermes to analyze the lead and produce a personalization plan.
// 3) Generates step 1 message for the recommended channel (email OR DM).
// 4) Writes the enrichment + message draft to the DB.
// =====================================================================

import { loadConfig } from "../_shared/config.ts";
import { newSB } from "../_shared/supabase.ts";
import { Hermes } from "../_shared/hermes.ts";
import { log, enqueue } from "../_shared/jobs.ts";
import { SYSTEM_PERSONA, leadAnalysisPrompt, emailDraftPrompt, linkedinDraftPrompt } from "../_shared/prompts.ts";
import { handlePreflight, ok, serverError, json } from "../_shared/cors.ts";
import { resolveCaller } from "../_shared/auth.ts";

interface GeneratePayload { lead_id: string; step?: number; }

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  try {
    const cfg = loadConfig();
    const caller = await resolveCaller(req, cfg);
    const sb = newSB(cfg);
    const hermes = new Hermes(cfg);

    const body = (req.method === "GET" ? null : await req.json().catch(() => null)) as GeneratePayload | null;
    if (!body || !body.lead_id) return json({ ok: false, error: "lead_id required" }, { status: 400 });

    const { data: settings } = await sb.from<Array<{ offer_summary: string | null; icp_personas: unknown[] }>>(
      "settings",
    ).select("offer_summary,icp_personas", { org_id: `eq.${caller.orgId}`, limit: "1" });
    const offerSummary = settings?.[0]?.offer_summary ??
      "Markenza runs AI automation + Google Ads + performance marketing for e-commerce, coaches, local businesses, and agencies. Packages $500–$1,500/mo.";

    const { data: leads } = await sb.from<Array<Record<string, unknown>>>("leads")
      .select("*", { id: `eq.${body.lead_id}`, limit: "1" });
    const lead = leads?.[0];
    if (!lead) return json({ ok: false, error: "lead not found" }, { status: 404 });

    // 1) Analyze
    const analysisMessages = [
      { role: "system" as const, content: SYSTEM_PERSONA },
      { role: "user" as const, content: leadAnalysisPrompt(lead, offerSummary) },
    ];
    const analysis = await hermes.json<Record<string, unknown>>(analysisMessages, { temperature: 0.3 });

    // 2) Persist enrichment + score
    const score = typeof analysis.fit_score === "number" ? analysis.fit_score : null;
    await sb.from("leads").update({
      enrichment: analysis,
      score: score ?? undefined,
      status: score !== null && score < 30 ? "closed_lost" : "qualified",
      last_touched_at: new Date().toISOString(),
    }, { id: `eq.${body.lead_id}` });

    if (score !== null && score < 30) {
      await log(sb, { orgId: caller.orgId, actor: "outreach_agent", action: "lead.rejected_low_score", entityType: "lead", entityId: body.lead_id, details: { score } });
      return ok({ skipped: true, reason: "low_score", score });
    }

    // 3) Generate step-1 message for the recommended channel
    const channel = (analysis.recommended_channel as string) === "linkedin_dm" ? "linkedin_dm" : "email";
    const step = body.step ?? 1;
    let draft: { subject?: string; body: string };
    if (channel === "email") {
      const m = await hermes.json<{ subject: string; body: string }>([
        { role: "system", content: SYSTEM_PERSONA },
        { role: "user", content: emailDraftPrompt({ lead, analysis, step, offerSummary }) },
      ], { temperature: 0.6 });
      draft = { subject: m.subject, body: m.body };
    } else {
      const m = await hermes.json<{ body: string }>([
        { role: "system", content: SYSTEM_PERSONA },
        { role: "user", content: linkedinDraftPrompt({ lead, analysis, step }) },
      ], { temperature: 0.6 });
      draft = { body: m.body };
    }

    // 4) Persist draft
    const { data: ins, error: insErr } = await sb.from<Array<{ id: string }>>("outreach_messages").insert({
      org_id: caller.orgId,
      lead_id: body.lead_id,
      channel,
      step_number: step,
      subject: draft.subject ?? null,
      body: draft.body,
      status: channel === "email" ? "queued" : "draft",
    });
    if (insErr) throw new Error(insErr.message);
    const msgId = ins?.[0]?.id;
    await sb.from("leads").update({ status: "message_ready" }, { id: `eq.${body.lead_id}` });
    if (channel === "email" && msgId) {
      await enqueue(sb, { orgId: caller.orgId, kind: "outreach.send", payload: { message_id: msgId, lead_id: body.lead_id } });
    }

    await log(sb, {
      orgId: caller.orgId, actor: "outreach_agent", action: "message.generated",
      entityType: "message", entityId: msgId,
      details: { lead_id: body.lead_id, channel, step, score },
    });

    return ok({ lead_id: body.lead_id, message_id: msgId, channel, draft });
  } catch (e) {
    return serverError(String((e as Error).message ?? e));
  }
});
