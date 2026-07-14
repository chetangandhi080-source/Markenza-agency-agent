# Research — Hermes 3 (Nous Research)

> What it is, what it''s good at, where it falls down, how we use it.

## What it is

Hermes is a family of open-source LLMs from Nous Research, finetuned
from Llama 3.1. The relevant sizes for us:

| Model | Params | Best for | Cost (Together AI, ref) |
|---|---|---|---|
| `hermes-3-llama-3.1-8b` | 8B | Classification, simple extraction | ~$0.0002/1k tokens |
| `hermes-3-llama-3.1-70b` | 70B | Drafting, analysis | ~$0.0009/1k tokens |
| `hermes-3-llama-3.1-405b` | 405B | Highest quality, complex prompts | ~$0.003/1k tokens |

Nous Research hosts a public, free endpoint at
`https://hermes-agent.nousresearch.com` that is OpenAI-compatible.
This is what v1 uses by default — `HERMES_BASE_URL` is the only thing
to change to switch providers.

## Why Hermes (and not GPT-4 / Claude / etc.)

| Reason | Detail |
|---|---|
| **Cost** | Public endpoint is $0 today; even at Together''s 405B price, the per-lead cost is cents |
| **OpenAI-compatible API** | Drop-in: any code written for OpenAI works |
| **Function calling** | Hermes 3 supports tool use cleanly — useful for Phase 3 RAG |
| **JSON mode** | `response_format: {type: "json_object"}` is stable on Hermes 3 |
| **Independence** | No vendor lock-in; we can self-host on a single H100 later if needed |

## What it''s good at (in our use)

- Following strict format instructions ("return ONLY this JSON shape")
- Avoiding generic B2B fluff (we prompt against this explicitly)
- Short-form drafting (60–90 word cold emails, 150–220 word posts)
- Reading a profile + producing a structured analysis

## What it''s bad at (we work around it)

- **Counts tokens wrong sometimes** — we cap output at 1024 tokens and
  retry if a draft feels truncated.
- **May not respect "no emoji"** — we add a regex post-filter to the
  draft body before storing.
- **Hallucinates a non-existent public figure** occasionally — the
  prompt instructs "If unsure, omit" which works ~95% of the time.
- **JSON mode occasionally wraps in ```json fences** — `Hermes.json()`
  strips these in code, so this is invisible to us.

## The prompts in `prompts.ts`

Five prompt templates:

1. **`leadAnalysisPrompt`** — given a lead profile + offer, return a
   JSON object with `fit_score`, `observed_gap`, `recommended_channel`,
   etc. The single most important prompt in the system. Every other
   prompt depends on the `enrichment` it produces.

2. **`emailDraftPrompt`** — given a lead + analysis + step, return a
   `{subject, body}` for that step. Has explicit per-step guidance so
   step 1 sounds like a peer, step 2 is a value bump, step 3 is a
   respectful break-up.

3. **`linkedinDraftPrompt`** — same idea, lower-case, shorter, no
   connection-request notes.

4. **`contentTopicPrompt`** — given last 20 topics, pillars, offer,
   return N new topics that are specific, contrarian, and rotated
   across pillars.

5. **`contentPostPrompt`** — given a topic + format + voice examples,
   return a post. The voice-example fetch (last 3 approved posts) is
   the closest we get to "voice fine-tuning" without doing fine-tuning.

## Tuning the prompts

When you edit `prompts.ts`:

1. Make one change at a time
2. Re-deploy: `supabase functions deploy <fn> --project-ref <ref>`
3. Watch `jobs` for the next 24h — count `error` rate, eyeball 10
   drafts in `outreach_messages` and `content_posts`
4. If replies drop, revert
5. Keep edits in commits tagged `prompt-tuning/<date>` so you can
   bisect if a regression is suspected later

## When to switch models

| Symptom | Move to |
|---|---|
| `jobs` shows lots of `Hermes JSON parse failed` | 405B → 405B (it''s a prompt problem, not a model problem) |
| `jobs` shows `Hermes 429` or `Hermes 503` | Public endpoint → Together AI paid tier |
| `jobs` shows `Hermes 4xx` other | Check `response_format` support; Hermes 3 supports it, some 8B variants do not |
| Inference cost > $50/mo at < 100 leads/mo | Add the 8B classifier (Phase 3) |

## Hosting alternatives

If the public endpoint goes away, the same code works against:

- **Together AI** — set `HERMES_BASE_URL=https://api.together.xyz/v1`
  and `HERMES_API_KEY=<key>`. The model name stays the same.
- **Ollama** (local) — `HERMES_BASE_URL=http://localhost:11434/v1`.
  The Hermes client tolerates keyless auth.
- **vLLM** (self-hosted) — same as Ollama, the OpenAI-compatible
  endpoint is `/v1`.
- **Anthropic / OpenAI** — set `HERMES_BASE_URL=https://api.openai.com/v1`
  and `HERMES_MODEL=gpt-4o`. No code change.
