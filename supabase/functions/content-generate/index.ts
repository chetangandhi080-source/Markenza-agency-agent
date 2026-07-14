// =====================================================================
// content-generate
// Takes a topic id and a format, asks Hermes to draft a post, and saves
// it as a content_post in `pending_approval` status. Cron drives this
// daily; the user approves in Supabase Studio and posts manually.
// =====================================================================

import { loadConfig } from "../_shared/config.ts";
import { newSB } from "../_shared/supabase.ts";
import { Hermes } from "../_shared/hermes.ts";
import { log } from "../_shared/jobs.ts";
import { SYSTEM_PERSONA, contentPostPrompt } from "../_shared/prompts.ts";
import { handlePreflight, ok, serverError, badRequest, json } from "../_shared/cors.ts";
import { resolveCaller } from "../_shared/auth.ts";

interface GeneratePayload {
  topic_id: string;
  format?: "text" | "carousel" | "thread";
  scheduled_for?: string; // YYYY-MM-DD
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  try {
    const cfg = loadConfig();
    const caller = await resolveCaller(req, cfg);
    const sb = newSB(cfg);
    const hermes = new Hermes(cfg);

    const body = (req.method === "GET" ? null : await req.json().catch(() => null)) as GeneratePayload | null;
    if (!body || !body.topic_id) return badRequest("topic_id required");
    const format = body.format ?? "text";

    const { data: topics } = await sb.from<Array<Record<string, unknown>>>("content_topics")
      .select("*", { id: `eq.${body.topic_id}`, limit: "1" });
    const topic = topics?.[0];
    if (!topic) return json({ ok: false, error: "topic not found" }, { status: 404 });

    const { data: settings } = await sb.from<Array<{ offer_summary: string | null }>>("settings")
      .select("offer_summary", { org_id: `eq.${caller.orgId}`, limit: "1" });
    const offerSummary = settings?.[0]?.offer_summary ??
      "Markenza runs AI automation + Google Ads + performance marketing for e-commerce, coaches, local businesses, and agencies.";

    // Fetch up to 3 most recent posts as voice references
    const { data: recent } = await sb.from<Array<{ body_markdown: string }>>("content_posts")
      .select("body_markdown", { org_id: `eq.${caller.orgId}`, order: "created_at.desc", limit: "3" });

    const draft = await hermes.json<{ body_markdown: string; slides?: unknown[]; thread?: string[] }>([
      { role: "system", content: SYSTEM_PERSONA },
      { role: "user", content: contentPostPrompt({
        topic: {
          pillar: topic.pillar as string,
          title: topic.title as string,
          hook: (topic.hook as string) ?? "",
          angle: (topic.outline as string[] | undefined)?.[0] ?? "",
          outline: (topic.outline as string[] | undefined) ?? [],
        },
        format,
        voiceExamples: recent ?? [],
        offerSummary,
      }) },
    ], { temperature: 0.7, maxTokens: 1500 });

    const { data: ins, error } = await sb.from<Array<{ id: string }>>("content_posts").insert({
      org_id: caller.orgId,
      topic_id: body.topic_id,
      format,
      body_markdown: draft.body_markdown,
      body_json: { slides: draft.slides ?? null, thread: draft.thread ?? null },
      scheduled_for: body.scheduled_for ?? null,
      status: "pending_approval",
    });
    if (error) throw new Error(error.message);
    const postId = ins?.[0]?.id;

    await sb.from("content_topics").update({ status: "used" }, { id: `eq.${body.topic_id}` });

    await log(sb, {
      orgId: caller.orgId, actor: "content_agent", action: "post.drafted",
      entityType: "post", entityId: postId,
      details: { topic_id: body.topic_id, format },
    });

    return ok({ post_id: postId, draft });
  } catch (e) {
    return serverError(String((e as Error).message ?? e));
  }
});
