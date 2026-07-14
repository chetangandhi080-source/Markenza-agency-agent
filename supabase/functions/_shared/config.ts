// Read runtime config. Supabase injects these into every edge function.
export interface AppConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceKey: string;
  hermesBaseUrl: string;
  hermesModel: string;
  hermesApiKey: string;
  apifyToken: string;
  apifyLinkedInActor: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  cronSecret: string;
}

function req(name: string, fallback?: string): string {
  const v = Deno.env.get(name);
  if (v && v.length > 0) return v;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required env var: ${name}`);
}

export function loadConfig(): AppConfig {
  return {
    supabaseUrl: req("SUPABASE_URL"),
    supabaseAnonKey: req("SUPABASE_ANON_KEY"),
    supabaseServiceKey: req("SUPABASE_SERVICE_ROLE_KEY"),
    hermesBaseUrl: req("HERMES_BASE_URL", "https://hermes-agent.nousresearch.com"),
    hermesModel: req("HERMES_MODEL", "hermes-3-llama-3.1-405b"),
    hermesApiKey: Deno.env.get("HERMES_API_KEY") ?? "",
    apifyToken: req("APIFY_TOKEN"),
    apifyLinkedInActor: req("APIFY_LINKEDIN_ACTOR", "bebity/linkedin-profile-scraper"),
    smtpHost: req("SMTP_HOST", "smtp.gmail.com"),
    smtpPort: parseInt(req("SMTP_PORT", "465"), 10),
    smtpUser: req("SMTP_USER"),
    smtpPass: req("SMTP_PASS"),
    smtpFrom: req("SMTP_FROM"),
    cronSecret: req("CRON_SECRET"),
  };
}
