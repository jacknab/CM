/**
 * One way for the AI Website Builder to ask a model for a JSON answer (owner, 2026-11-09; plans/ai-website-builder.md).
 *
 * Provider (AI_SITE_PROVIDER, else whichever key is set, Anthropic first):
 *   - "anthropic": Claude through the Anthropic SDK (production). Model AI_SITE_MODEL, default claude-opus-5-5.
 *   - "openrouter": OpenRouter's free models, for development until the Anthropic key is added (owner's choice).
 *     Model OPENROUTER_MODEL, default nvidia/nemotron-3.5-super-vl:free. Free-model providers may keep prompts, so
 *     development runs on test businesses only.
 * Every answer is checked against a zod schema; a wrong answer is sent back once with what was wrong, then refused.
 * Each call is logged in ai_site_runs (tokens, time, success) for cost tracking.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { pool } from "../db";

export class AiUnavailableError extends Error {}
export class AiAnswerError extends Error {}

type Provider = "anthropic" | "openrouter";

export function aiProvider(): Provider | null {
  const wanted = (process.env.AI_SITE_PROVIDER ?? "").toLowerCase();
  if (wanted === "anthropic" && process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (wanted === "openrouter" && process.env.OPENROUTER_API_KEY) return "openrouter";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENROUTER_API_KEY) return "openrouter";
  return null;
}

const modelFor = (p: Provider) => (p === "anthropic"
  ? process.env.AI_SITE_MODEL || "claude-opus-5-5"
  : process.env.OPENROUTER_MODEL || "nvidia/nemotron-3.5-super-vl:free");

let anthropic: Anthropic | null = null;

export async function generateJson<T>(opts: {
  storeId: number; kind: string; system: string; prompt: string; schema: z.ZodType<T>;
  maxTokens?: number; effort?: "low" | "medium" | "high";
}): Promise<T> {
  const provider = aiProvider();
  if (!provider) throw new AiUnavailableError("The website designer isn't switched on yet.");
  const model = modelFor(provider);
  const started = Date.now();
  let usage = { input: 0, output: 0 };
  try {
    const result = provider === "anthropic" ? await viaAnthropic(model, opts, usage) : await viaOpenRouter(model, opts, usage);
    await logRun(opts.storeId, opts.kind, provider, model, usage, true, null, Date.now() - started);
    return result;
  } catch (err: any) {
    await logRun(opts.storeId, opts.kind, provider, model, usage, false, String(err?.message ?? err).slice(0, 500), Date.now() - started);
    throw err;
  }
}

async function viaAnthropic<T>(model: string, opts: Parameters<typeof generateJson<T>>[0], usage: { input: number; output: number }): Promise<T> {
  anthropic ??= new Anthropic();
  const response = await anthropic.messages.parse({
    model,
    max_tokens: opts.maxTokens ?? 16000,
    // The fixed instructions are the same on every call of a kind: cached.
    system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: opts.prompt }],
    output_config: { format: zodOutputFormat(opts.schema), effort: opts.effort ?? "medium" },
  });
  usage.input += response.usage.input_tokens; usage.output += response.usage.output_tokens;
  if (response.stop_reason === "refusal") throw new AiAnswerError("The designer declined this request.");
  if (response.parsed_output == null) throw new AiAnswerError("The designer's answer didn't fit. Please try again.");
  return response.parsed_output as T;
}

/** The first {...} in a reply, without code fences. Free models sometimes wrap or explain their JSON. */
function jsonOf(text: string): unknown {
  const t = text.replace(/```(?:json)?/gi, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) throw new AiAnswerError("No JSON in the answer.");
  return JSON.parse(t.slice(a, b + 1));
}

async function viaOpenRouter<T>(model: string, opts: Parameters<typeof generateJson<T>>[0], usage: { input: number; output: number }): Promise<T> {
  const schemaText = JSON.stringify(z.toJSONSchema(opts.schema as z.ZodType));
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: `${opts.system}\n\nReply with ONE JSON object only (no prose, no code fences) that matches this JSON Schema:\n${schemaText}` },
    { role: "user", content: opts.prompt },
  ];
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json",
        "HTTP-Referer": "https://certxa.com", "X-Title": "Certxa website designer",
      },
      body: JSON.stringify({ model, messages, max_tokens: opts.maxTokens ?? 16000, response_format: { type: "json_object" } }),
      signal: AbortSignal.timeout(180_000),
    });
    const data: any = await res.json().catch(() => null);
    if (!res.ok) throw new AiAnswerError(data?.error?.message ? `OpenRouter: ${data.error.message}` : `OpenRouter answered ${res.status}.`);
    usage.input += Number(data?.usage?.prompt_tokens ?? 0); usage.output += Number(data?.usage?.completion_tokens ?? 0);
    const text = String(data?.choices?.[0]?.message?.content ?? "");
    let problem: string;
    try {
      const parsed = opts.schema.safeParse(jsonOf(text));
      if (parsed.success) return parsed.data;
      problem = parsed.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    } catch (err: any) { problem = String(err?.message ?? err); }
    messages.push({ role: "assistant", content: text.slice(0, 20000) }, { role: "user", content: `That answer didn't match the schema (${problem}). Reply again with the corrected JSON object only.` });
  }
  throw new AiAnswerError("The designer's answer didn't fit. Please try again.");
}

/**
 * Look something up on the web with Claude's web search and page-fetch tools (research step). Claude only: the free
 * development model can't search, so this returns null without ANTHROPIC_API_KEY. Returns Claude's notes and the
 * pages it cited.
 */
export async function researchWeb(opts: { storeId: number; prompt: string }): Promise<{ notes: string; urls: string[] } | null> {
  if (aiProvider() !== "anthropic") return null;
  const model = modelFor("anthropic");
  const started = Date.now();
  const usage = { input: 0, output: 0 };
  anthropic ??= new Anthropic();
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: opts.prompt }];
  try {
    let response: Anthropic.Message | null = null;
    // A long server-tool turn can pause; send it back (at most 4 times) and the server carries on.
    for (let turn = 0; turn < 5; turn++) {
      response = await anthropic.messages.create({
        model, max_tokens: 8000,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 6 }, { type: "web_fetch_20260209", name: "web_fetch", max_uses: 6 }],
        messages,
      });
      usage.input += response.usage.input_tokens; usage.output += response.usage.output_tokens;
      if (response.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: response.content });
    }
    const blocks: any[] = response?.content ?? [];
    const notes = blocks.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    const urls = new Set<string>();
    for (const b of blocks) for (const c of b.citations ?? []) if (typeof c.url === "string") urls.add(c.url);
    await logRun(opts.storeId, "research-web", "anthropic", model, usage, true, null, Date.now() - started);
    return notes ? { notes: notes.slice(0, 20_000), urls: [...urls].slice(0, 20) } : null;
  } catch (err: any) {
    await logRun(opts.storeId, "research-web", "anthropic", model, usage, false, String(err?.message ?? err).slice(0, 500), Date.now() - started);
    throw err;
  }
}

async function logRun(storeId: number, kind: string, provider: string, model: string, usage: { input: number; output: number }, ok: boolean, error: string | null, ms: number) {
  await pool.query(
    `INSERT INTO ai_site_runs (store_id, kind, provider, model, input_tokens, output_tokens, ok, error, ms) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [storeId, kind, provider, model, usage.input, usage.output, ok, error, ms]).catch((e) => console.error("[ai-site] log", e?.message));
}
