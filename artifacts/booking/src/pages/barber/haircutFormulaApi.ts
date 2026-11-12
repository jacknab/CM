/**
 * Last Cut Formula — the barber screens' side of the formula API (server: routes/haircutFormulas.ts, Phase 2).
 * Everything here is store-scoped by the session on the server; another store's records answer 404, which the screens
 * show as "no formula" rather than an error.
 *
 * The screens follow the server's HAIRCUT_FORMULAS switch (GET /api/haircut-formula/status, asked once per page load).
 * While it is off — or not known yet, or the server is out of reach — the existing Quick Notes screens are shown.
 */
import { useEffect, useState } from "react";
import type { HaircutSpec } from "@shared/haircutFormula";

export type FormulaVersion = {
  id: number; formulaId: number | null; versionNumber: number | null; clientId: number | null; appointmentId: number | null;
  staffId: number | null; staffName: string | null; visitAt: string; spec: HaircutSpec; templateId: number | null;
  hairstyleName: string | null; categoryName: string | null; notes: string | null; source: string; correctsVersionId: number | null;
  createdAt: string; recordId?: number; corrected?: boolean;
};
export type Formula = { id: number; label: string | null; isDefault: boolean; isArchived?: boolean; templateId: number | null; versionCount?: number; latestVisitAt?: string | null };
export type HairstyleImage = { view: "front" | "left" | "right" | "back" | "detail"; url: string; altText: string | null };
export type Hairstyle = { id: number; slug: string; name: string; scope: "global" | "store"; category: { slug: string; name: string }; thumbnailUrl?: string | null; aliases?: string[] };
export type HairstyleDetails = Hairstyle & { description: string | null; defaultSpec: HaircutSpec; images: HairstyleImage[] };
export type TicketFormula = { clientId: number | null; latest: FormulaVersion | null; hairstyle: { id: number; name: string; slug: string } | null; images: HairstyleImage[] };

export class FormulaApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

type Fetch = typeof fetch;
let fetcher: Fetch = (...a) => fetch(...a);
/** Tests replace the network. */
export const setFormulaFetch = (f: Fetch) => { fetcher = f; };

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const r = await fetcher(path, {
    method: init?.method ?? "GET", credentials: "include",
    headers: init?.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new FormulaApiError(r.status, (data as any)?.message || "Could not reach the haircut formula service.");
  return data as T;
}

// ── The switch ────────────────────────────────────────────────────────────────────
let status: Promise<boolean> | null = null;
let known: boolean | null = null;
export function formulasEnabled(): Promise<boolean> {
  status ??= call<{ enabled: boolean }>("/api/haircut-formula/status").then((d) => (known = d?.enabled === true), () => (known = false));
  return status;
}
/** Tests (and a later settings change) set or clear the remembered answer. */
export const primeFormulasEnabled = (v: boolean | null) => { known = v; status = v === null ? null : Promise.resolve(v); };

/** true / false once known; null while asking (screens show today's Quick Notes until then). */
export function useFormulasEnabled(): boolean | null {
  const [on, setOn] = useState<boolean | null>(known);
  useEffect(() => { let live = true; void formulasEnabled().then((v) => { if (live) setOn(v); }); return () => { live = false; }; }, []);
  return on;
}

// ── Reading ───────────────────────────────────────────────────────────────────────
export const getClientFormula = (clientId: number, formulaId?: number | null) =>
  call<{ formula: Formula | null; latest: FormulaVersion | null; history: { id: number; visitAt: string; staffName: string | null; hairstyleName: string | null }[] }>(
    `/api/clients/${clientId}/haircut-formula${formulaId ? `?formulaId=${formulaId}` : ""}`);
export const getHistory = (clientId: number, o: { formulaId?: number | null; before?: string | null; limit?: number } = {}) => {
  const qs = new URLSearchParams();
  if (o.formulaId) qs.set("formulaId", String(o.formulaId));
  if (o.before) qs.set("before", o.before);
  qs.set("limit", String(o.limit ?? 20));
  return call<{ versions: FormulaVersion[] }>(`/api/clients/${clientId}/haircut-formula/history?${qs}`);
};
export const getVersionDetails = (versionId: number) =>
  call<{ version: FormulaVersion; record: FormulaVersion; current: FormulaVersion; corrections: FormulaVersion[]; formula: Formula | null }>(`/api/haircut-formula/versions/${versionId}`);
export const listFormulas = (clientId: number) => call<{ formulas: Formula[] }>(`/api/clients/${clientId}/haircut-formulas`);
export const getTicketFormula = (appointmentId: number) => call<TicketFormula>(`/api/haircut-formula/for-ticket/${appointmentId}`);
export const getCheckinFormula = (checkinId: number) => call<TicketFormula>(`/api/haircut-formula/for-checkin/${checkinId}`);
export const hairstyleCategories = () => call<{ categories: { id: number; slug: string; name: string }[] }>("/api/hairstyles/categories");
export const searchHairstyles = (q: string, category?: string | null) =>
  call<{ hairstyles: Hairstyle[] }>(`/api/hairstyles?${new URLSearchParams({ q, ...(category ? { category } : {}), limit: "30" })}`);
export const getHairstyle = (id: number) => call<HairstyleDetails>(`/api/hairstyles/${id}`);

// ── Writing ───────────────────────────────────────────────────────────────────────
export const saveTicketFormula = (appointmentId: number, b: { spec: HaircutSpec; notes?: string | null; templateId?: number | null; idempotencyKey: string }) =>
  call<{ version: FormulaVersion }>(`/api/haircut-formula/for-ticket/${appointmentId}/versions`, { method: "POST", body: b });
export const saveToFormula = (clientId: number, b: { formulaId: number; appointmentId: number | null; spec: HaircutSpec; notes?: string | null; templateId?: number | null; idempotencyKey: string }) =>
  call<{ version: FormulaVersion }>(`/api/clients/${clientId}/haircut-formula/versions`, { method: "POST", body: { ...b, source: "manual" } });
export const repeatLastCut = (clientId: number, appointmentId: number, idempotencyKey: string) =>
  call<{ version: FormulaVersion }>(`/api/clients/${clientId}/haircut-formula/repeat`, { method: "POST", body: { appointmentId, idempotencyKey } });
export const createNamedFormula = (clientId: number, label: string) =>
  call<{ formula: Formula }>(`/api/clients/${clientId}/haircut-formulas`, { method: "POST", body: { label } });

// ── Tapping Save more than once ───────────────────────────────────────────────────
// The key depends on what is being saved: the same cut tapped twice (or retried after a dropped connection) sends the
// same key, so the server keeps one version; a changed cut gets a new key and becomes a correction of today's record.
const canonical = (x: unknown): unknown =>
  Array.isArray(x) ? x.map(canonical) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x as object).sort().map((k) => [k, canonical((x as any)[k])])) : x;
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}
export function saveKey(scope: string, payload: unknown): string {
  return `tablet:${scope}:${fnv1a(JSON.stringify(canonical(payload)))}`.slice(0, 120);
}

/** One save at a time: a second tap while the first is in flight returns the same promise instead of sending again. */
export function onceAtATime<A extends unknown[], R>(fn: (...a: A) => Promise<R>): (...a: A) => Promise<R> {
  let inFlight: Promise<R> | null = null;
  return (...a: A) => {
    if (inFlight) return inFlight;
    inFlight = fn(...a).finally(() => { inFlight = null; });
    return inFlight;
  };
}
