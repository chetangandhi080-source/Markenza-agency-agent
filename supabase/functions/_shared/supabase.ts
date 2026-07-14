// Tiny typed wrapper around the Supabase REST API + service-role usage.
// We use fetch directly (no supabase-js dep) to keep the edge bundle tiny.

import type { AppConfig } from "./config.ts";

export type SBRow = Record<string, unknown>;

export class SB {
  constructor(private cfg: AppConfig) {}

  private async rest<T = SBRow>(
    path: string,
    init: RequestInit & { auth?: "anon" | "service" | "user" } = {},
  ): Promise<{ data: T | null; error: { message: string } | null; status: number }> {
    const auth = init.auth ?? "service";
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      apikey: this.cfg.supabaseAnonKey,
      ...(init.headers as Record<string, string> | undefined),
    };
    headers.Authorization =
      auth === "service"
        ? `Bearer ${this.cfg.supabaseServiceKey}`
        : auth === "anon"
        ? `Bearer ${this.cfg.supabaseAnonKey}`
        : (init.headers as Record<string, string>)?.Authorization ?? `Bearer ${this.cfg.supabaseAnonKey}`;

    const res = await fetch(`${this.cfg.supabaseUrl}/rest/v1/${path}`, {
      ...init,
      headers: { ...headers, Prefer: "return=representation" },
    });
    const text = await res.text();
    let parsed: unknown = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
    if (!res.ok) {
      return {
        data: null,
        error: { message: typeof parsed === "string" ? parsed : JSON.stringify(parsed) },
        status: res.status,
      };
    }
    return { data: (parsed as T) ?? null, error: null, status: res.status };
  }

  from(table: string) {
    const sb = this;
    return {
      select: <T = SBRow>(columns = "*", query: Record<string, string> = {}) => {
        const qs = new URLSearchParams({ select: columns, ...query }).toString();
        return sb.rest<T>(`${table}?${qs}`, { method: "GET" });
      },
      insert: <T = SBRow>(rows: SBRow | SBRow[]) =>
        sb.rest<T>(table, { method: "POST", body: JSON.stringify(rows) }),
      update: <T = SBRow>(values: SBRow, query: Record<string, string> = {}) => {
        const qs = new URLSearchParams(query).toString();
        return sb.rest<T>(`${table}?${qs}`, {
          method: "PATCH",
          body: JSON.stringify(values),
        });
      },
      delete: (query: Record<string, string> = {}) => {
        const qs = new URLSearchParams(query).toString();
        return sb.rest(`${table}?${qs}`, { method: "DELETE" });
      },
      rpc: <T = SBRow>(fn: string, args: SBRow = {}) =>
        sb.rest<T>(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) }),
    };
  }

  // Resolve the calling user's org from their JWT (used by anon auth context)
  async resolveUserOrgFromJwt(jwt: string): Promise<{ orgId: string; userId: string } | null> {
    const { data, error } = await this.rest<Array<{ org_id: string; id: string }>>(
      `profiles?select=org_id,id`,
      { method: "GET", headers: { Authorization: `Bearer ${jwt}` }, auth: "anon" },
    );
    if (error || !data || data.length === 0) return null;
    return { orgId: data[0].org_id, userId: data[0].id };
  }
}

export function newSB(cfg: AppConfig): SB { return new SB(cfg); }
