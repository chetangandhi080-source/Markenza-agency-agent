// =====================================================================
// outreach-send
// Sends an email message via Gmail SMTP. Updates lead + message state.
// Also handles a manual "tick" — the user pastes a LinkedIn DM, then
// hits a button in Supabase Studio that calls this endpoint with
// { action: "linkedin_mark_sent" } to record the send and schedule
// the follow-up.
// =====================================================================

import { loadConfig } from "../_shared/config.ts";
import { newSB } from "../_shared/supabase.ts";
import { sendEmail } from "../_shared/smtp.ts";
import { log, enqueue } from "../_shared/jobs.ts";
import { handlePreflight, ok, serverError, badRequest, json } from "../_shared/cors.ts";
import { resolveCaller } from "../_shared/auth.ts";

interface SendPayload {
  message_id: string;
  // for the manual linkedin-tick path
  action?: "send_email" | "linkedin_mark_sent";
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  try {
    const cfg = loadConfig();
    const caller = await resolveCaller(req, cfg);
    const sb = newSB(cfg);
    const body = await req.json().catch(() => ({})) as SendPayload;
    if (!body.message_id) return badRequest("message_id required");

    const { data: msgs } = await sb.from<Array<Record<string, unknown>>>("outreach_messages")
      .select("*", { id: `eq.${body.message_id}`, limit: "1" });
    const msg = msgs?.[0];
    if (!msg) return json({ ok: false, error: "message not found" }, { status: 404 });

    const action = body.action ?? (msg.channel === "email" ? "send_email" : "linkedin_mark_sent");

    if (action === "send_email") {
      if (msg.channel !== "email") return badRequest("message is not an email");
      const { data: leads } = await sb.from<Array<Record<string, unknown>>>("leads")
        .select("email,full_name,linkedin_url,status", { id: `eq.${msg.lead_id}`, limit: "1" });
      const lead = leads?.[0];
      const to = (lead?.email as string | undefined) ?? "";
      if (!to) return badRequest("lead has no email — collect it first or switch channel to linkedin_dm");

      const { messageId } = await sendEmail(cfg, {
        to,
        subject: msg.subject as string,
        body: msg.body as string,
      });

      await sb.from("outreach_messages").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        provider_msg_id: messageId,
      }, { id: `eq.${body.message_id}` });

      await sb.from("leads").update({
        status: "contacted",
        last_touched_at: new Date().toISOString(),
      }, { id: `eq.${msg.lead_id}` });

      // schedule follow-up
      const stepNumber = (msg.step_number as number) ?? 1;
      if (stepNumber < 3) {
        await enqueue(sb, {
          orgId: caller.orgId,
          kind: "outreach.generate",
          payload: { lead_id: msg.lead_id as string, step: stepNumber + 1 },
          runAfter: new Date(Date.now() + (stepNumber === 1 ? 3 : 5) * 86_400_000).toISOString(),
        });
      }

      await log(sb, {
        orgId: caller.orgId, actor: "outreach_agent", action: "email.sent",
        entityType: "message", entityId: body.message_id,
        details: { to, step: stepNumber },
      });

      return ok({ sent: true, to, step: stepNumber });
    }

    if (action === "linkedin_mark_sent") {
      if (msg.channel !== "linkedin_dm") return badRequest("message is not a linkedin dm");
      await sb.from("outreach_messages").update({
        status: "sent",
        sent_at: new Date().toISOString(),
      }, { id: `eq.${body.message_id}` });
      await sb.from("leads").update({
        status: "contacted",
        last_touched_at: new Date().toISOString(),
      }, { id: `eq.${msg.lead_id}` });

      const stepNumber = (msg.step_number as number) ?? 1;
      if (stepNumber < 3) {
        await enqueue(sb, {
          orgId: caller.orgId,
          kind: "outreach.generate",
          payload: { lead_id: msg.lead_id as string, step: stepNumber + 1 },
          runAfter: new Date(Date.now() + (stepNumber === 1 ? 3 : 6) * 86_400_000).toISOString(),
        });
      }

      await log(sb, {
        orgId: caller.orgId, actor: "user", action: "linkedin.sent",
        entityType: "message", entityId: body.message_id,
        details: { step: stepNumber },
      });

      return ok({ marked_sent: true, step: stepNumber });
    }

    return badRequest("unknown action");
  } catch (e) {
    return serverError(String((e as Error).message ?? e));
  }
});
