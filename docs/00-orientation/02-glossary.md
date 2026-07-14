# 02 — Glossary

> Words that mean specific things in this codebase.

| Term | Meaning |
|---|---|
| **Agent** | A logical "person" in the system (Outreach / Content / Orchestrator). Each is implemented as 1+ edge functions. |
| **Caller** | The thing that invoked an edge function — either a logged-in user JWT or a cron request with the shared `CRON_SECRET`. |
| **Channel** | Where a message goes: `email` or `linkedin_dm`. |
| **Cold touch** | First message in a sequence (step 1). |
| **Cooldown** | Time period a lead is excluded from follow-up after a negative event. Stored on `leads.cooldown_until`. |
| **Edge function** | A Deno function deployed on Supabase; lives in `supabase/functions/<name>/index.ts`. |
| **Enqueue** | Insert a row into `jobs` to be processed by the next orchestrator tick. |
| **Fit score** | 0–100 number Hermes produces about how well a lead matches the offer. < 30 means drop the lead. |
| **Hermes 3** | Open-source LLM family from Nous Research. v1 uses `hermes-3-llama-3.1-405b` via Nous'' hosted OpenAI-compatible endpoint. |
| **ICP** | Ideal Customer Profile — a description of who Markenza is best at serving. Stored in `settings.icp_personas`. |
| **Job** | A row in the `jobs` table representing a unit of work the orchestrator will dispatch. |
| **Lead** | A prospect that has been discovered but not yet contacted. |
| **Message** | A single email or LinkedIn DM, scheduled, drafted, or sent. |
| **Org** | The tenant boundary. v1 has one org called "Markenza". |
| **Post** | A piece of content (text / carousel / thread) drafted by the Content Agent. |
| **Step** | Position in a 3-message sequence (1, 2, 3). |
| **Tick** | One execution of the orchestrator edge function. |
| **Topic** | A content idea that has not yet been drafted into a post. |
