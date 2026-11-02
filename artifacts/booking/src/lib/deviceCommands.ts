/**
 * Fixes the server asks this tablet to carry out (owner, 2026-11-02; phase 3 of the offline health work). They arrive
 * over the live connection (`device_command`) and again with the answer to the health report (lib/deviceHealth.ts),
 * and the result goes back to /api/devices/command-result. None of them deletes work this tablet hasn't sent.
 * The fixes that need the Certxa app itself (reopening its database, restarting, installing an update, a printer test)
 * are asked of the app (lib/nativeDevice.ts; phase 4); an older app says it can't do them yet.
 */
import { localHub } from "@/lib/local-hub";
import { syncEngine } from "@/lib/sync-engine";
import { nailOffline } from "@/lib/nail-offline";
import { salonMirrorStatus, syncSalonMirror } from "@/lib/salon-mirror";
import { getStationDeviceId } from "@/lib/stationDevice";
import { kioskFetch } from "@/lib/kioskDevice";
import { offlineStorage } from "@/lib/nail-offline";
import { askApp } from "@/lib/nativeDevice";

export interface CommandContext {
  storeId: number | null;
  /** A kiosk / customer screen proves its salon with this (lib/kioskDevice.ts). */
  slug?: string | null;
}
export interface DeviceCommand { id: number; command: string }
type Outcome = { ok: boolean; detail: string };

let active: CommandContext | null = null;
/** The page reporting this tablet's health sets where commands are carried out. */
export function setCommandContext(ctx: CommandContext | null): void { active = ctx; }

const running = new Set<number>();

async function carryOut(command: string, ctx: CommandContext): Promise<Outcome> {
  switch (command) {
    case "refresh_hub": {
      const r = await localHub.refresh();
      const linked = r.status === "serving" || r.status === "connected";
      return { ok: linked, detail: linked ? `Hub link ${r.status} (${r.ownAddress ?? "?"} → ${r.hubAddress ?? "?"})` : `Hub link still ${r.status} (hub ${r.hubAddress ?? "unknown"})` };
    }
    case "retry_unsent": {
      if (ctx.storeId == null) return { ok: false, detail: "This tablet keeps no offline work" };
      await syncEngine.runSync(ctx.storeId);
      const left = (await nailOffline.ops(ctx.storeId)).filter((o) => o.state === "pending").length;
      return { ok: left === 0, detail: left === 0 ? "Everything has been sent" : `${left} change(s) still waiting to send` };
    }
    case "resync_mirror": {
      if (ctx.storeId == null) return { ok: false, detail: "No salon on this tablet" };
      await syncSalonMirror(ctx.storeId);
      const m = await salonMirrorStatus(ctx.storeId);
      if (!m) return { ok: false, detail: "This tablet has no salon copy (not the Certxa app)" };
      return { ok: m.complete, detail: m.complete ? `Salon copy complete (${Object.values(m.rows).reduce((a, b) => a + (Number(b) || 0), 0)} rows)` : "Salon copy still not complete" };
    }
    case "reload_page":
      // Reported first, then reloaded (below).
      return { ok: true, detail: "Reloading the page" };
    case "reopen_database": {
      const r = await askApp("DEVICE_FIX", { command });
      // This page fell back to browser storage when the database failed: once it works again, a reload puts the
      // offline work back in it (runDeviceCommands reloads after reporting).
      if (r.ok && offlineStorage().kind === "browser") return { ok: true, detail: `${r.detail ?? "Reopened"}; reloading so this page uses it again` };
      return { ok: r.ok, detail: r.detail ?? (r.ok ? "Done" : "Failed") };
    }
    case "restart_app":
    case "apply_update":
    case "test_printer": {
      const r = await askApp("DEVICE_FIX", { command }, command === "apply_update" ? 180_000 : 60_000);
      return { ok: r.ok, detail: r.detail ?? (r.ok ? "Done" : "Failed") };
    }
    default:
      return { ok: false, detail: "This tablet can't do that yet (it needs the newer Certxa app)" };
  }
}

async function report(ctx: CommandContext, id: number, outcome: Outcome): Promise<void> {
  const init: RequestInit = {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId: getStationDeviceId(), id, ok: outcome.ok, detail: outcome.detail, ...(ctx.slug ? { slug: ctx.slug } : {}) }),
  };
  try {
    if (ctx.slug) await kioskFetch(ctx.slug, "/api/devices/command-result", init);
    else await fetch("/api/devices/command-result", init);
  } catch { /* the server sends it again in 10 minutes and it is done again */ }
}

/** Carry out the server's commands for this tablet, one after another. */
export async function runDeviceCommands(list: DeviceCommand[], ctx: CommandContext | null = active): Promise<void> {
  if (!ctx) return;
  for (const c of list) {
    if (!c || !Number.isSafeInteger(c.id) || running.has(c.id)) continue;
    running.add(c.id);
    let outcome: Outcome;
    try {
      outcome = await carryOut(String(c.command), ctx);
    } catch (err) {
      outcome = { ok: false, detail: String((err as Error)?.message ?? err).slice(0, 200) };
    }
    await report(ctx, c.id, outcome);
    if ((c.command === "reload_page" || (c.command === "reopen_database" && /reloading/.test(outcome.detail))) && outcome.ok) {
      setTimeout(() => window.location.reload(), 1_000);
      return;
    }
  }
}

/** A `device_command` from the live connection: carried out when it is for this tablet. */
export function onDeviceCommandMessage(data: { deviceId?: unknown; id?: unknown; command?: unknown }): void {
  if (data.deviceId !== getStationDeviceId()) return;
  void runDeviceCommands([{ id: Number(data.id), command: String(data.command) }]);
}
