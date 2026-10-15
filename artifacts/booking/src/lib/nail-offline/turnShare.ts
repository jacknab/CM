/**
 * Two or more POS tablets offline at the same time share one turn line over the salon's hub (lib/local-hub.ts).
 *
 * Each POS tablet, while the server cannot be reached, sends what it has done to the line since its last
 * server line (clients handed to technicians, tickets paid, cancelled or moved, clock-ins and clock-outs) to
 * the others — whenever something changes, and every 20 seconds so a tablet that joins later catches up. Each
 * message carries the sender's whole list, so it replaces the last one heard from that tablet. The others'
 * lists are kept here and folded into this tablet's line (line.ts, mergeSharedTurns).
 *
 * Online the server works the line out for everyone, so nothing is sent then. What was heard is kept on the
 * tablet (a restart mid-outage does not forget it) and dropped once the server answers again.
 */
import { localHub } from "../local-hub";
import type { LineEvent } from "./line";

const MESSAGE = "hub_turn_events";
const REPEAT_MS = 20_000;
/** Lists not heard again for this long belong to a tablet that is gone: dropped. */
const STALE_MS = 12 * 60 * 60_000;
const key = (storeId: number) => `certxa.turnShare.${storeId}`;

interface Heard { events: LineEvent[]; at: number }
type HeardByDevice = Record<string, Heard>;

function load(storeId: number): HeardByDevice {
  try {
    const v = JSON.parse(localStorage.getItem(key(storeId)) ?? "null");
    return v && typeof v === "object" ? v : {};
  } catch { return {}; }
}
function save(storeId: number, heard: HeardByDevice) {
  try { localStorage.setItem(key(storeId), JSON.stringify(heard)); } catch { /* kept in memory for this session */ }
}

let heard: HeardByDevice = {};
let heardFor: number | null = null;
const ensure = (storeId: number) => { if (heardFor !== storeId) { heard = load(storeId); heardFor = storeId; } };

/** What the other POS tablets have done, one list per tablet. */
export function foreignTurnEvents(storeId: number, now = Date.now()): LineEvent[][] {
  ensure(storeId);
  return Object.values(heard).filter((h) => now - h.at < STALE_MS).map((h) => h.events);
}

/** The server answers again: it has the whole line, so what was heard offline is no longer needed. */
export function clearForeignTurnEvents(storeId: number) {
  ensure(storeId);
  if (Object.keys(heard).length === 0) return;
  heard = {};
  save(storeId, heard);
}

/**
 * Start sharing for this POS tablet. `ownEvents` works out this tablet's events since its last server line;
 * `isOffline` says whether to send; `onHeard` runs when another tablet's list arrives (redraw the line).
 * Returns the stop function.
 */
export function startTurnSharing(opts: {
  storeId: number;
  deviceId: string;
  ownEvents: () => Promise<LineEvent[]>;
  isOffline: () => boolean;
  onHeard: () => void;
}): { share: () => void; stop: () => void } {
  ensure(opts.storeId);
  const offMessages = localHub.onMessage((m: any) => {
    if (m?.type !== MESSAGE || Number(m.storeId) !== opts.storeId || typeof m.deviceId !== "string" || m.deviceId === opts.deviceId) return;
    if (!Array.isArray(m.events)) return;
    ensure(opts.storeId);
    heard = { ...heard, [m.deviceId]: { events: m.events as LineEvent[], at: Date.now() } };
    save(opts.storeId, heard);
    opts.onHeard();
  });
  let sending = false;
  const share = () => {
    if (sending || !opts.isOffline()) return;
    sending = true;
    void opts.ownEvents()
      .then((events) => { localHub.send({ type: MESSAGE, storeId: opts.storeId, deviceId: opts.deviceId, events }); })
      .catch(() => { /* tried again on the next change or tick */ })
      .finally(() => { sending = false; });
  };
  const timer = setInterval(share, REPEAT_MS);
  return { share, stop: () => { clearInterval(timer); offMessages(); } };
}
