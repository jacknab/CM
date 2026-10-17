/**
 * The salon's account for its tablets (lib/storeMirror.ts, plans/salon-local-database.md).
 *
 *   GET /api/offline/mirror/tables                       — the copied tables, and the salon's latest change number
 *   GET /api/offline/mirror/rows?table=&afterId=&limit=  — first copy: one page of a table
 *   GET /api/offline/mirror/changes?after=&limit=        — the changes after a change number
 *
 * A tablet takes `head` from /tables, copies every table page by page, then applies the changes after `head`
 * (a row changed meanwhile is simply applied twice). Signed-in salon sessions only; owner and staff both, as for
 * the offline snapshot.
 */
import { Router } from "express";
import { resolveSessionStoreId } from "../lib/sessionStore";
import { IS_SCHEDULER_INSTANCE } from "../lib/clusterInfo";
import { MIRROR_HISTORY_MONTHS, MIRROR_TABLES, mirrorChanges, mirrorHead, mirrorPage, mirrorTable, pruneMirrorLog } from "../lib/storeMirror";

const router = Router();
const int = (v: unknown, fallback: number, max = Number.MAX_SAFE_INTEGER) => {
  const n = Number(v);
  return Number.isSafeInteger(n) && n >= 0 ? Math.min(n, max) : fallback;
};

router.get("/tables", async (req, res) => {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) return res.status(400).json({ message: "No store found" });
  try {
    return res.json({ head: await mirrorHead(storeId), historyMonths: MIRROR_HISTORY_MONTHS, tables: MIRROR_TABLES.map((t) => t.table) });
  } catch (err: any) {
    console.error("[mirror/tables]", err?.message);
    return res.status(500).json({ message: "Could not read the salon's data" });
  }
});

router.get("/rows", async (req, res) => {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) return res.status(400).json({ message: "No store found" });
  const t = mirrorTable(String(req.query.table ?? ""));
  if (!t) return res.status(400).json({ message: "Unknown table" });
  try {
    return res.json(await mirrorPage(storeId, t, int(req.query.afterId, 0), int(req.query.limit, 1000, 2000) || 1000));
  } catch (err: any) {
    console.error("[mirror/rows]", t.table, err?.message);
    return res.status(500).json({ message: "Could not read the salon's data" });
  }
});

router.get("/changes", async (req, res) => {
  const storeId = await resolveSessionStoreId(req);
  if (!storeId) return res.status(400).json({ message: "No store found" });
  try {
    return res.json(await mirrorChanges(storeId, int(req.query.after, 0), int(req.query.limit, 500, 2000) || 500));
  } catch (err: any) {
    console.error("[mirror/changes]", err?.message);
    return res.status(500).json({ message: "Could not read the salon's changes" });
  }
});

/** Trims the change log (entries older than 30 days) every 6 hours, on one server process only. */
export function startMirrorLogPruning(): void {
  if (!IS_SCHEDULER_INSTANCE) return;
  const run = () => pruneMirrorLog().catch((err) => console.error("[mirror] log trim failed:", err?.message));
  setTimeout(run, 60_000);
  setInterval(run, 6 * 60 * 60_000);
}

export default router;
