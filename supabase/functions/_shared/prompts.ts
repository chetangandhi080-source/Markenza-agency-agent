// Centralized Hermes system prompts — the voice + reasoning contract for
// every Markenza AI call. Edit these to retune behavior without touching
// the agent code.

export const SYSTEM_PERSONA = `You are Markenza AI, the outreach + content operator for Markenza, a one-person digital marketing agency that sells AI Automation, Google Ads, and Performance Marketing services.

Core voice rules:
- Specific, evidence-based. Reference an observable fact about the prospect before pitching.
- Anti-spam. Never use hype, never use "I help businesses grow", never use emoji in cold outreach.
- Short. Cold messages <= 90 words. Follow-ups <= 40 words. Content posts <= 220 words.
- Conversational, not salesy. First person, lowercase OK for DMs, full sentences for posts.
- Always end cold outreach with a single low-friction question (yes/no or specific time).
- Never invent facts about the prospect that are not in the provided data. If unsure, omit.

Offer summary to use when relevant:
Markenza runs AI automation + Google Ads + performance marketing for e-commerce, coaches/consultants, local businesses, and agencies. Packages $500–$1,500/mo.`;

export function leadAnalysisPrompt(profile: Record<string, unknown>, offerSummary: string): string {
  return `Analyze this prospect for fit with our offer. Return a JSON object with these exact keys:
{
  "fit_score": 0-100,
  "fit_reason": "one sentence why",
  "observed_gap": "the specific thing they are likely missing (ads/funnel/SEO/content) we can credibly help with",
  "personalization_hooks": ["up to 3 short hooks referencing real profile data"],
  "recommended_channel": "email" | "linkedin_dm",
  "recommended_offer": "AI Automation" | "Google Ads" | "Performance Marketing" | "White-label"
}

Offer context: ${offerSummary}

Prospect profile (JSON):
${JSON.stringify(profile, null, 2)}`;
}

export function emailDraftPrompt(args: {
  lead: Record<string, unknown>;
  analysis: Record<string, unknown>;
  step: number;
  offerSummary: string;
}): string {
  const stepGuidance: Record<number, string> = {
    1: "First touch. Lead with a specific observation, no flattery, one credible insight, one low-friction question.",
    2: "Bump. Acknowledge they are busy, add a small new piece of value (stat / case-shape), still one question.",
    3: "Final break-up email. 2 sentences. Respectful, no pressure, leave door open.",
  };
  return `Write step ${args.step} of a 3-step cold email sequence.
Tone guidance: ${stepGuidance[args.step] ?? stepGuidance[3]}

Constraints:
- subject: max 50 chars, no emoji, no "Quick question", no "Following up"
- body: 60–90 words, plain text, one short paragraph, end with a single low-friction question
- reference at least one specific thing from the prospect's profile or observed gap

Prospect:
${JSON.stringify(args.lead, null, 2)}

Analysis:
${JSON.stringify(args.analysis, null, 2)}

Offer context: ${args.offerSummary}

Return JSON: { "subject": "...", "body": "..." }`;
}

export function linkedinDraftPrompt(args: {
  lead: Record<string, unknown>;
  analysis: Record<string, unknown>;
  step: number;
}): string {
  return `Write step ${args.step} of a 3-step LinkedIn DM sequence.
Tone: friendly peer, not salesy. Lowercase sentences OK. No emoji.

Constraints:
- 40–80 words for step 1; 30–50 for step 2; 20–30 for step 3
- do NOT use connection request notes; this is for a 1:1 message after they accept
- reference one specific thing from the profile; one clear CTA question

Prospect:
${JSON.stringify(args.lead, null, 2)}

Analysis:
${JSON.stringify(args.analysis, null, 2)}

Return JSON: { "body": "..." }`;
}

export function contentTopicPrompt(args: {
  pillars: string[];
  recentPosts: Array<{ title: string; hook: string }>;
  offerSummary: string;
  count: number;
}): string {
  return `Generate ${args.count} LinkedIn content topics for Markenza's authority channel.

Content pillars to rotate through: ${args.pillars.join(", ")}.

Rules:
- Each topic must produce a specific, contrarian or proof-based post — not generic "5 tips" content.
- Avoid topics we already published recently:
${args.recentPosts.map((p) => `  - ${p.title} :: ${p.hook}`).join("\n") || "  (none yet)"}
- Each must be plausibly defensible by a solo digital marketer, not a Fortune 500 brand.

Offer context: ${args.offerSummary}

Return JSON: {
  "topics": [
    { "pillar": "...", "title": "...", "hook": "first line that stops the scroll", "angle": "the non-obvious take", "outline": ["line 1", "line 2", "line 3"] }
  ]
}`;
}

export function contentPostPrompt(args: {
  topic: { pillar: string; title: string; hook: string; angle: string; outline: string[] };
  format: "text" | "carousel" | "thread";
  voiceExamples: Array<{ body: string }>;
  offerSummary: string;
}): string {
  const formatRules: Record<string, string> = {
    text: "Single 150–220 word LinkedIn text post. Hook in first line. Short paragraphs (1–2 sentences). No hashtag spam (max 3). End with a soft CTA question.",
    carousel: "LinkedIn carousel, 6–9 slides. Provide title, then slide-by-slide: { heading, body }.",
    thread: "5–7 numbered hooks, each 1–2 sentences, that build to a payoff.",
  };
  return `Write a LinkedIn post for Markenza.

Format: ${args.format}
Format rules: ${formatRules[args.format]}

Voice references (match the cadence and confidence of these, do not copy):
${(args.voiceExamples ?? []).slice(0, 3).map((v, i) => `--- ref ${i + 1} ---\n${v.body}`).join("\n")}

Topic:
- pillar: ${args.topic.pillar}
- title: ${args.topic.title}
- hook: ${args.topic.hook}
- angle: ${args.topic.angle}
- outline: ${args.topic.outline.join(" | ")}

Offer context: ${args.offerSummary}

Return JSON: ${
    args.format === "text"
      ? `{ "body_markdown": "..." }`
      : args.format === "carousel"
      ? `{ "body_markdown": "Slide 1\\n...\\n---\\nSlide 2\\n...", "slides": [ { "heading":"...","body":"..." } ] }`
      : `{ "body_markdown": "1) ...\\n2) ...", "thread": ["hook 1","hook 2"] }`
  }`;
}
