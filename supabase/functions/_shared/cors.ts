// Shared CORS + response helpers used by every edge function.
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-markenza-source",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

export function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

export function ok(data: unknown = { ok: true }): Response {
  return json(data, { status: 200 });
}

export function badRequest(message: string, extra: unknown = {}): Response {
  return json({ ok: false, error: message, ...extra }, { status: 400 });
}

export function serverError(message: string, extra: unknown = {}): Response {
  return json({ ok: false, error: message, ...extra }, { status: 500 });
}

export function handlePreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return null;
}
