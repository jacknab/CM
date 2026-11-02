/**
 * Offline-mode health rules (owner, 2026-11-02; phase 2). From what a salon's tablets reported (device_health, see
 * routes/deviceHealth.ts) and how the salon is set up (stations, the hub the server chose, offline card payments),
 * a score from 0 to 100 and the problems in plain words, worst first. Pure: the facts come in, the verdict goes out.
 *
 * `fix` names the automatic fix for a problem (phase 3 sends it to the tablet or does it on the server); null = a
 * person has to look.
 */

export type Severity = "critical" | "warning" | "info";

export interface HealthProblem {
  code: string;
  severity: Severity;
  text: string;
  deviceId?: string;
  fix: string | null;
}

export interface HealthDevice {
  deviceId: string;
  role: string | null;
  registerId: number | null;
  receivedAt: string;
  report: any;
}

export interface HealthInput {
  now: number;
  devices: HealthDevice[];
  stations: { id: number; name: string; isDefault: boolean; isActive: boolean; drawerId: number | null }[];
  claims: { registerId: number; deviceId: string; claimedAt: string }[];
  hub: { hostRegisterId: number | null; address: string | null } | null;
  declinedOfflineCards: number;
}

export function validRegisterId(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export interface HealthVerdict {
  /** null: no tablet has reported in the past week, so nothing is known. */
  score: number | null;
  problems: HealthProblem[];
  devices: number;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** A tablet that reported within this is "on" right now (it reports every 2 minutes). */
const ON_NOW = 6 * 60_000;
const WEIGHT: Record<Severity, number> = { critical: 25, warning: 10, info: 2 };

const isFrontDesk = (d: HealthDevice) => d.role === "pos" || d.role === "station";
const isScreen = (d: HealthDevice) => d.role === "screen" || d.role === "kiosk";

export function evaluateOfflineHealth(input: HealthInput): HealthVerdict {
  const { now } = input;
  const age = (iso: string | null | undefined) => (iso ? now - Date.parse(iso) : Infinity);
  const week = input.devices.filter((d) => age(d.receivedAt) < 7 * DAY);
  if (!week.length) return { score: null, problems: [], devices: 0 };
  const recent = week.filter((d) => age(d.receivedAt) < DAY);
  const onNow = recent.filter((d) => age(d.receivedAt) < ON_NOW);
  const stationName = (id: number | null | undefined) => input.stations.find((s) => s.id === id)?.name ?? null;
  const label = (d: HealthDevice) => {
    const kind = d.role === "screen" ? "The customer screen" : d.role === "kiosk" ? "The kiosk" : "The front desk tablet";
    const st = isFrontDesk(d) ? stationName(d.registerId) : null;
    return st ? `${kind} on ${st}` : kind;
  };
  const problems: HealthProblem[] = [];
  const add = (p: HealthProblem) => problems.push(p);

  // ── Each tablet's own offline setup ──
  for (const d of recent) {
    const r = d.report ?? {};
    const db = r.db ?? {};
    if (isFrontDesk(d) && r.inApp === false) {
      add({ code: "not_in_app", severity: "warning", deviceId: d.deviceId, fix: null,
        text: `${label(d)} is a web browser, not the Certxa app: no hub, and its offline work is kept in the browser only.` });
    } else if (db.storage === "browser" && r.inApp) {
      add({ code: "db_browser_fallback", severity: "critical", deviceId: d.deviceId, fix: "reopen_database",
        text: `${label(d)} couldn't open the app's offline database and is keeping offline work in browser storage${db.storageError ? ` (${db.storageError})` : ""}.` });
    }
    // SQLite's own check of the app's database file (phase 4: the app reports it).
    if (r.app?.db && r.app.db.ok === false) {
      add({ code: "db_integrity", severity: "critical", deviceId: d.deviceId, fix: "reopen_database",
        text: `${label(d)}'s offline database file failed its check: ${r.app.db.result ?? "no answer"}.` });
    }
    if (db.test && db.test.ok === false) {
      add({ code: "db_write_failed", severity: "critical", deviceId: d.deviceId, fix: "reopen_database",
        text: `${label(d)} can't save to its offline database: ${db.test.error ?? "the write test failed"}.` });
    }
    if (isFrontDesk(d) && db.oldestUnsentAt && age(db.oldestUnsentAt) > HOUR && age(d.receivedAt) < ON_NOW && !r.offline) {
      add({ code: "unsent_stuck", severity: "critical", deviceId: d.deviceId, fix: "retry_unsent",
        text: `${label(d)} is online but has ${db.unsent ?? "some"} change(s) it hasn't sent for over an hour.` });
    }
    if (isFrontDesk(d) && Number(db.refused) > 0) {
      add({ code: "unsent_refused", severity: "warning", deviceId: d.deviceId, fix: null,
        text: `${label(d)} has ${db.refused} offline change(s) the server refused. They need someone to look at them (Connected › Saved on this tablet).` });
    }
    if (isFrontDesk(d) && r.inApp) {
      const m = r.mirror;
      if (!m || m.error) {
        add({ code: "mirror_missing", severity: "critical", deviceId: d.deviceId, fix: "resync_mirror",
          text: `${label(d)} has no copy of the salon for offline use${m?.error ? ` (${m.error})` : ""}.` });
      } else if (!m.complete || !m.syncedAt) {
        add({ code: "mirror_incomplete", severity: "critical", deviceId: d.deviceId, fix: "resync_mirror",
          text: `${label(d)}'s copy of the salon isn't complete, so offline mode would miss clients or services.` });
      } else if (age(m.syncedAt) > DAY) {
        add({ code: "mirror_stale", severity: "warning", deviceId: d.deviceId, fix: "resync_mirror",
          text: `${label(d)}'s copy of the salon was last updated more than a day ago.` });
      }
    }
    if (r.clock?.deviceTz && r.clock?.salonTz && r.clock.deviceTz !== r.clock.salonTz) {
      add({ code: "clock_zone", severity: "info", deviceId: d.deviceId, fix: null,
        text: `${label(d)} is set to ${r.clock.deviceTz}; the salon is ${r.clock.salonTz}. Certxa shows the salon's time, but the tablet's own clock reads differently.` });
    }
  }

  // ── The hub ──
  const frontDesks = recent.filter(isFrontDesk);
  const screens = recent.filter(isScreen);
  const hub = input.hub;
  const needsHub = frontDesks.length > 1 || (frontDesks.length >= 1 && screens.length >= 1);
  if (needsHub) {
    if (hub?.hostRegisterId == null) {
      add({ code: "hub_none", severity: "critical", fix: "elect_hub",
        text: "No hub has been chosen, so the tablets can't reach each other when the internet is down." });
    } else {
      const hostTablets = frontDesks.filter((d) => d.registerId === hub.hostRegisterId);
      const host = hostTablets.sort((a, b) => age(a.receivedAt) - age(b.receivedAt))[0];
      if (!host) {
        add({ code: "hub_host_missing", severity: "critical", fix: "elect_hub",
          text: `The hub is set to ${stationName(hub.hostRegisterId) ?? "a station"}, but no tablet on it has reported in the last day.` });
      } else {
        const own = host.report?.hub?.ownAddress ?? null;
        if (own && hub.address && own !== hub.address) {
          add({ code: "hub_address_stale", severity: "critical", deviceId: host.deviceId, fix: "refresh_hub",
            text: `The server has the hub at ${hub.address}, but the hub tablet is at ${own}. Other tablets would look in the wrong place.` });
        }
        // Another tablet connected to this one's address right now: its hub is up, whatever its page says. (The app
        // didn't tell a page that loaded while the hub was already running — store 38, 2026-11-02 — so the page said
        // "off" and the hub was restarted for nothing, dropping every tablet each time.)
        const servedNow = !!own && onNow.some((d) => d.deviceId !== host.deviceId && d.report?.hub?.status === "connected" && d.report.hub.hubAddress === own);
        if (age(host.receivedAt) < ON_NOW && host.report?.hub && host.report.hub.status !== "serving" && !servedNow) {
          add({ code: "hub_not_serving", severity: "critical", deviceId: host.deviceId, fix: "refresh_hub",
            text: `${label(host)} should be running the hub, but it isn't (${host.report.hub.status ?? "off"}).` });
        }
      }
    }
    for (const d of [...onNow.filter(isScreen), ...onNow.filter((x) => isFrontDesk(x) && x.registerId !== hub?.hostRegisterId)]) {
      const st = d.report?.hub?.status;
      if (d.report?.inApp && st && st !== "connected" && st !== "serving") {
        add({ code: "hub_not_connected", severity: "critical", deviceId: d.deviceId, fix: "refresh_hub",
          text: `${label(d)} isn't connected to the hub (${st}), so it would stop working with the front desk if the internet went down.` });
      }
    }
  }

  // ── Stations ──
  const activeStations = input.stations.filter((s) => s.isActive);
  if (activeStations.length > 1) {
    const main = activeStations.find((s) => s.isDefault);
    const mainClaim = main ? input.claims.find((c) => c.registerId === main.id && age(c.claimedAt) < 7 * DAY) : null;
    if (main && !mainClaim) {
      add({ code: "main_station_empty", severity: "warning", fix: null,
        text: `No tablet is on the Main station (${main.name}). Put the front desk on it (Manager › Change Station), or make its station Main.` });
    }
  }
  for (const d of frontDesks) {
    const st = input.stations.find((s) => s.id === d.registerId);
    if (st && st.isActive && st.drawerId == null) {
      add({ code: "station_no_drawer", severity: "warning", deviceId: d.deviceId, fix: null,
        text: `${st.name} has no cash drawer, so the front desk tablet on it can't take cash (Manager › Station Drawer).` });
    }
  }

  // ── Money ──
  if (input.declinedOfflineCards > 0) {
    add({ code: "offline_card_declined", severity: "warning", fix: null,
      text: `${input.declinedOfflineCards} card payment(s) taken offline were declined by the bank and still need collecting.` });
  }

  // ── Reporting itself ──
  const weekFront = week.filter(isFrontDesk);
  if (weekFront.length && !frontDesks.length) {
    add({ code: "stopped_reporting", severity: "warning", fix: null,
      text: "The front desk tablet hasn't reported in over a day (off, signed out, or on an old page)." });
  }

  const order: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
  problems.sort((a, b) => order[a.severity] - order[b.severity]);
  const score = Math.max(0, 100 - problems.reduce((sum, p) => sum + WEIGHT[p.severity], 0));
  return { score, problems, devices: week.length };
}
