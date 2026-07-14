// Hermes 3 client — OpenAI-compatible chat completions.
// Nous Research hosts a free public endpoint; the function tolerates
// either a keyless call (no Authorization header) or a bearer key if
// the user has set HERMES_API_KEY.
import type { AppConfig } from "./config.ts";

export interface ChatMessage { role: "system" | "user" | "assistant"; content: string; }
export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  jsonMode?: boolean;          // ask Hermes to return strict JSON
  stop?: string[];
  signal?: AbortSignal;
}

export interface ChatResult { content: string; raw: unknown; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }; }

export class Hermes {
  constructor(private cfg: AppConfig) {}

  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<ChatResult> {
    const url = `${this.cfg.hermesBaseUrl.replace(/\/$/, "")}/v1/chat/completions`;
    const body: Record<string, unknown> = {
      model: this.cfg.hermesModel,
      messages,
      temperature: opts.temperature ?? 0.4,
      top_p: opts.topP ?? 0.95,
      max_tokens: opts.maxTokens ?? 1024,
      stream: false,
    };
    if (opts.jsonMode) body.response_format = { type: "json_object" };
    if (opts.stop?.length) body.stop = opts.stop;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.cfg.hermesApiKey) headers.Authorization = `Bearer ${this.cfg.hermesApiKey}`;

    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal: opts.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(`Hermes ${res.status}: ${text.slice(0, 600)}`);

    const data = JSON.parse(text) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: ChatResult["usage"];
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    return { content, raw: data, usage: data.usage };
  }

  // Convenience: hermes-as-JSON with safe parse + retry-once fallback
  async json<T = unknown>(messages: ChatMessage[], opts: ChatOptions = {}): Promise<T> {
    const tryParse = (s: string): T | null => {
      try { return JSON.parse(s) as T; } catch { return null; }
    };
    const strip = (s: string): string => {
      // Trim ```json fences if the model adds them
      const m = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
      return (m ? m[1] : s).trim();
    };

    const r1 = await this.chat(messages, { ...opts, jsonMode: true });
    const p1 = tryParse(strip(r1.content));
    if (p1) return p1;

    // One retry with a stricter system nudge
    const r2 = await this.chat(
      [...messages, { role: "assistant", content: r1.content }, {
        role: "user",
        content: "That was not valid JSON. Reply with ONLY a single valid JSON object, no prose, no markdown.",
      }],
      { ...opts, jsonMode: true, temperature: 0.1 },
    );
    const p2 = tryParse(strip(r2.content));
    if (p2) return p2;
    throw new Error(`Hermes JSON parse failed: ${r1.content.slice(0, 200)}`);
  }
}
