# Research — Prompt design for cold outreach

> The five prompts in `prompts.ts` and the principles behind them.
> Read this before editing any prompt.

## Core principles

### 1. One job per prompt

Each of the five prompts produces one JSON object with a defined
shape. The orchestrator code reads specific keys. **Do not add fields
the code doesn''t read** — the model will start producing them
unevenly and you''ll get noise.

### 2. Negative examples in the system prompt

`SYSTEM_PERSONA` says:
- "Never use ''I help businesses grow''"
- "Never use hype, never use emoji in cold outreach"
- "If unsure, omit"

Hermes 3 (and most modern LLMs) respond well to explicit *don''ts* as
long as they are concrete. Abstract don''ts ("be authentic") are
ignored.

### 3. Word budgets

Cold emails: 60–90 words
Follow-ups: <= 40 words
LinkedIn DMs: 40–80 / 30–50 / 20–30 by step
Content posts: 150–220 words
Carousels: 6–9 slides, 1 idea per slide

The prompt states the budget. The code doesn''t enforce it — Hermes
3 is reliable enough that explicit instruction is sufficient. If
drafts start running long, **fix the prompt first** before adding a
code-side length check.

### 4. JSON mode + one retry

```ts
const r1 = await hermes.chat(messages, { jsonMode: true });
const parsed = tryParse(strip(r1.content));
if (parsed) return parsed;
// one retry with stricter system nudge
```

Why retry instead of failing?
- 5–10% of Hermes 3 405B completions in JSON mode produce a leading
  ```json fence or trailing prose
- A second call with a stricter system nudge fixes ~80% of these
- Failing the job is the wrong default — leads would pile up in
  `pending` because of a parse error, not a real failure

### 5. The model never invents facts

The prompt states: *"Never invent facts about the prospect that are
not in the provided data. If unsure, omit."* This is a real risk —
LLMs will confidently state a competitor name that doesn''t exist if
you let them. The lead profile in `leads.raw_profile` is the only
source of truth.

## Anatomy of `leadAnalysisPrompt`

```text
You are Markenza AI…
  → System prompt (shared)

Analyze this prospect for fit with our offer. Return a JSON object
with these exact keys:
{ fit_score, fit_reason, observed_gap, personalization_hooks[],
  recommended_channel, recommended_offer }
  → Output shape

Offer context: {offerSummary}
  → Variable context

Prospect profile (JSON):
{...}
  → Variable context
```

Three sections: persona, output contract, variable context. The model
reads them in order. Putting the output contract first (after persona)
gets the most reliable shape adherence.

## Anatomy of `emailDraftPrompt`

```text
You are Markenza AI…

Write step {step} of a 3-step cold email sequence.
Tone guidance: {stepGuidance[step]}
  → Per-step instructions (peer / value bump / break-up)

Constraints:
- subject: max 50 chars, no emoji, no "Quick question", no "Following up"
- body: 60–90 words, plain text, one short paragraph, end with a
  single low-friction question
- reference at least one specific thing from the prospect's profile
  or observed gap
  → Hard constraints, enumerated

Prospect: {...}
Analysis: {...}
Offer context: {...}
  → Variable context

Return JSON: { subject: "...", body: "..." }
  → Output contract
```

The per-step guidance is the lever. When reply rates drop, change the
guidance, not the constraints. Constraints are non-negotiable;
guidance is the voice.

## Anatomy of `contentPostPrompt`

The most complex prompt. It asks the model to match a voice it
hasn''t seen in this conversation — by passing 3 most-recent approved
posts as `voiceExamples`. The model is told:

```text
Voice references (match the cadence and confidence of these, do
not copy):
--- ref 1 ---
<post body>
--- ref 2 ---
<post body>
--- ref 3 ---
<post body>
```

This is the cheapest possible form of "fine-tuning" — pure in-context
learning. It works because LinkedIn voice is high-signal: short
paragraphs, strong opinions, specific numbers.

When you publish more posts, the next call picks up the latest 3.
Within 2–3 weeks, the system has internalized Markenza''s voice.

## Common failure modes and fixes

| Failure | Fix |
|---|---|
| "I help businesses grow" appears | Add the literal phrase to the don''t-list in `SYSTEM_PERSONA` |
| Subject lines over 50 chars | Add a post-parse length check; if too long, re-call with a stricter word budget |
| Personalized hooks are generic | Pass more `raw_profile` keys; the model can only reference what it sees |
| Recommended channel is always `email` | Add explicit guidance: "If no email is available, recommend linkedin_dm" |
| Fit score is always 70 | Add a calibration example: "A perfect ICP match is 90–100; a weak-but-possible match is 30–50; below 30 means skip" |
| Posts feel like LinkedIn-influencer sludge | Pass 1–2 negative examples ("Here is a post that does NOT match our voice: ...") |

## Versioning prompts

When you change a prompt meaningfully:

```powershell
git tag -a prompt-tuning/2026-07-20 -m "Tighten subject line length cap"
git push --tags
```

Then in `prompts.ts` add a comment block at the top of the changed
function with the tag name. This makes it trivial to diff a bad week
against the last good one.
