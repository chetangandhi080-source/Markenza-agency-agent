// Minimal SMTP-over-TLS client for Gmail (port 465).
// Deno doesn't ship SMTP in std (yet), so we implement the small subset
// we need: EHLO, AUTH LOGIN, MAIL FROM, RCPT TO, DATA, QUIT.
// STARTTLS / port 587 not needed because Gmail is configured for 465 SSL.

import { connect as connectTLS } from "https://deno.land/std@0.224.0/net/mod.ts";
import { BufReader, BufWriter } from "https://deno.land/std@0.224.0/io/buf_reader.ts";
import type { AppConfig } from "./config.ts";

export interface SendArgs {
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
  inReplyTo?: string;
  references?: string;
}

export async function sendEmail(cfg: AppConfig, args: SendArgs): Promise<{ messageId: string }> {
  const conn = await connectTLS({ hostname: cfg.smtpHost, port: cfg.smtpPort });
  try {
    const reader = new BufReader(conn);
    const writer = new BufWriter(conn);
    const enc = new TextEncoder();
    const dec = new TextDecoder();

    await expectStatus(reader, 220, "greeting");

    await writeCmd(writer, `EHLO markenza.ai\r\n`);
    await expectStatus(reader, 250, "EHLO", /* multi = */ true);

    await writeCmd(writer, `AUTH LOGIN\r\n`);
    await expectStatus(reader, 334, "AUTH");
    await writeCmd(writer, b64(cfg.smtpUser) + "\r\n");
    await expectStatus(reader, 334, "AUTH user");
    await writeCmd(writer, b64(cfg.smtpPass) + "\r\n");
    await expectStatus(reader, 235, "AUTH pass");

    await writeCmd(writer, `MAIL FROM:<${cfg.smtpFrom}>\r\n`);
    await expectStatus(reader, 250, "MAIL FROM");

    await writeCmd(writer, `RCPT TO:<${args.to}>\r\n`);
    await expectStatus(reader, 250, "RCPT TO");

    await writeCmd(writer, `DATA\r\n`);
    await expectStatus(reader, 354, "DATA");

    const messageId = `<${crypto.randomUUID()}@markenza.ai>`;
    const headers = [
      `From: ${cfg.smtpFrom}`,
      `To: ${args.to}`,
      `Subject: ${args.subject}`,
      `Message-ID: ${messageId}`,
      `Date: ${new Date().toUTCString()}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=UTF-8`,
      args.replyTo ? `Reply-To: ${args.replyTo}` : "",
      args.inReplyTo ? `In-Reply-To: ${args.inReplyTo}` : "",
      args.references ? `References: ${args.references}` : "",
    ].filter(Boolean).join("\r\n");

    const payload = `${headers}\r\n\r\n${args.body}\r\n.\r\n`;
    await writer.write(enc.encode(payload));
    await writer.flush();
    await expectStatus(reader, 250, "DATA end");

    await writeCmd(writer, `QUIT\r\n`);
    await expectStatus(reader, 221, "QUIT");

    return { messageId };
  } finally {
    try { conn.close(); } catch { /* ignore */ }
  }
}

async function writeCmd(w: BufWriter, cmd: string): Promise<void> {
  await w.write(new TextEncoder().encode(cmd));
  await w.flush();
}

async function expectStatus(r: BufReader, code: number, label: string, multi = false): Promise<string> {
  const lines: string[] = [];
  let last = "";
  while (true) {
    const l = await r.readLine();
    if (l === null) throw new Error(`SMTP ${label}: closed unexpectedly after ${JSON.stringify(lines)}`);
    const s = dec.decode(l);
    lines.push(s);
    last = s;
    if (!multi) break;
    // Multi-line replies: "250-SIZE" then last line "250 OK"
    if (/^\d{3} /.test(s)) break;
  }
  if (!last.startsWith(String(code))) {
    throw new Error(`SMTP ${label}: expected ${code}, got "${last}" (full: ${lines.join(" | ")})`);
  }
  return last;
}

function b64(s: string): string { return btoa(unescape(encodeURIComponent(s))); }
