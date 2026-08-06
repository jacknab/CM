/**
 * Per-call file logger for Autumn AI Receptionist.
 *
 * Creates one structured log file per call at:
 *   logs/ai-calls/YYYYMMDD_<callSid>.log
 *
 * The dev team can review these files to audit tool calls,
 * transcripts, errors, and outcomes for every call Autumn handles.
 */

import * as fs from "fs";
import * as path from "path";

export class CallFileLogger {
  private filePath: string | null = null;
  private startTime: Date;
  private closed = false;

  constructor(callSid: string, storeId: number, callerPhone: string | null) {
    this.startTime = new Date();
    try {
      const logsDir = path.join(process.cwd(), "logs", "ai-calls");
      fs.mkdirSync(logsDir, { recursive: true });

      const dateStr = this.startTime.toISOString().slice(0, 10).replace(/-/g, "");
      const safeCallSid = callSid.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "unknown";
      this.filePath = path.join(logsDir, `${dateStr}_${safeCallSid}.log`);

      const header = [
        "═".repeat(68),
        "AUTUMN AI RECEPTIONIST  ·  CALL LOG",
        "═".repeat(68),
        `Call SID  : ${callSid}`,
        `Store ID  : ${storeId}`,
        `Caller    : ${callerPhone ?? "(blocked/unknown)"}`,
        `Started   : ${this.startTime.toISOString()}`,
        "═".repeat(68),
        "",
      ].join("\n");

      this.write_raw(header);
    } catch {
      this.filePath = null;
    }
  }

  private ts(): string {
    return new Date().toISOString().slice(11, 23);
  }

  private write_raw(text: string): void {
    if (!this.filePath) return;
    try {
      fs.appendFileSync(this.filePath, text + "\n");
    } catch { /* never crash a call */ }
  }

  event(label: string, detail?: Record<string, unknown>): void {
    if (this.closed || !this.filePath) return;
    let line = `[${this.ts()}] ${label}`;
    if (detail && Object.keys(detail).length > 0) {
      line += "\n" + Object.entries(detail)
        .map(([k, v]) => `  ${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
        .join("\n");
    }
    this.write_raw(line);
  }

  toolStart(name: string, args: unknown): void {
    if (this.closed || !this.filePath) return;
    this.write_raw(`[${this.ts()}] ▶ TOOL CALL: ${name}`);
    this.write_raw(`  args: ${JSON.stringify(args)}`);
  }

  toolEnd(name: string, result: unknown, durationMs: number, success: boolean): void {
    if (this.closed || !this.filePath) return;
    const icon = success ? "✓" : "✗";
    const resultStr = typeof result === "object"
      ? JSON.stringify(result).slice(0, 800)
      : String(result).slice(0, 800);
    this.write_raw(`  ${icon} ${name} (${durationMs}ms): ${resultStr}`);
  }

  transcript(role: "caller" | "autumn", text: string): void {
    if (this.closed || !this.filePath) return;
    const icon = role === "autumn" ? "🤖 AUTUMN" : "📞 CALLER";
    this.write_raw(`[${this.ts()}] ${icon}: "${text}"`);
  }

  error(context: string, err: unknown): void {
    if (this.closed || !this.filePath) return;
    this.write_raw(`[${this.ts()}] ❌ ERROR [${context}]: ${String(err)}`);
  }

  close(outcome: string, durationSeconds: number, recordingUrl?: string | null): void {
    if (this.closed || !this.filePath) return;
    this.closed = true;
    const lines = [
      "",
      "─".repeat(68),
      `[${this.ts()}] CALL ENDED`,
      `  Outcome   : ${outcome}`,
      `  Duration  : ${durationSeconds}s`,
    ];
    if (recordingUrl) {
      lines.push(`  Recording : ${recordingUrl}`);
    }
    lines.push("═".repeat(68));
    lines.push("");
    this.write_raw(lines.join("\n"));
  }

  get path(): string | null {
    return this.filePath;
  }
}

/** No-op logger used when call SID is not yet available. */
export class NullCallFileLogger {
  event(_label: string, _detail?: Record<string, unknown>): void { /* noop */ }
  toolStart(_name: string, _args: unknown): void { /* noop */ }
  toolEnd(_name: string, _result: unknown, _durationMs: number, _success: boolean): void { /* noop */ }
  transcript(_role: "caller" | "autumn", _text: string): void { /* noop */ }
  error(_context: string, _err: unknown): void { /* noop */ }
  close(_outcome: string, _durationSeconds: number, _recordingUrl?: string | null): void { /* noop */ }
  get path(): string | null { return null; }
}

export type ICallFileLogger = CallFileLogger | NullCallFileLogger;
