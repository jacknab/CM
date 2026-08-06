import type { Pool } from "pg";
import type { SegmentResult } from "../types";
import { pass, warn, fail, rollup } from "../types";
import { formatDistanceToNow } from "date-fns";

export async function teamRoster(accountId: number, pool: Pool): Promise<SegmentResult> {
  const checks = [];
  const tables: Record<string, unknown[]> = {};

  // ── 2a. Staff list ────────────────────────────────────────────────────────────
  const staffRes = await pool.query(
    `SELECT id, name, role, employment_type, status, show_on_calendar,
            invite_token, joined_at, invited_at, removed_at, permissions
     FROM staff WHERE store_id = $1 ORDER BY name`,
    [accountId],
  );

  const allStaff = staffRes.rows;
  const activeStaff   = allStaff.filter((s: any) => s.status !== "removed");
  const removedVisible = allStaff.filter((s: any) => s.status === "removed" && s.show_on_calendar);
  const pendingInvites = activeStaff.filter((s: any) => s.invite_token && !s.joined_at);

  tables.staff_roster = allStaff.map((s: any) => ({
    name: s.name,
    role: s.role,
    employmentType: s.employment_type,
    status: s.status,
    showOnCalendar: s.show_on_calendar,
    portalAccess: !!s.joined_at,
    invitePending: !!(s.invite_token && !s.joined_at),
    invitedAgo: s.invited_at ? formatDistanceToNow(new Date(s.invited_at), { addSuffix: true }) : null,
  }));

  if (allStaff.length === 0) {
    checks.push(warn("staff_count", "Staff members exist", "No staff records found on this account."));
  } else {
    checks.push(pass("staff_count", "Staff members exist", `${activeStaff.length} active, ${allStaff.length - activeStaff.length} removed`));
  }

  if (removedVisible.length > 0) {
    checks.push(fail(
      "removed_visible",
      "Removed staff hidden from calendar",
      `${removedVisible.map((s: any) => s.name).join(", ")} ${removedVisible.length === 1 ? "is" : "are"} marked removed but still show on the calendar — this is a data inconsistency.`,
      "Staff → [Member] → Edit",
    ));
  } else {
    checks.push(pass("removed_visible", "Removed staff hidden from calendar", "No removed staff are showing on the calendar."));
  }

  if (pendingInvites.length > 0) {
    const details = pendingInvites.map((s: any) =>
      `${s.name} (invited ${s.invited_at ? formatDistanceToNow(new Date(s.invited_at), { addSuffix: true }) : "unknown"})`
    ).join("; ");
    checks.push(warn(
      "pending_invites",
      "No long-standing pending invites",
      `${pendingInvites.length} invite(s) still pending: ${details}`,
      "Staff → [Member] → Resend Invite",
    ));
  } else {
    checks.push(pass("pending_invites", "No long-standing pending invites", "All invited staff have joined."));
  }

  // ── 2b. Portal access ─────────────────────────────────────────────────────────
  const settingsRes = await pool.query(
    `SELECT preferences FROM store_settings WHERE store_id = $1`,
    [accountId],
  );
  let prefs: Record<string, unknown> = {};
  if (settingsRes.rows[0]?.preferences) {
    try { prefs = JSON.parse(settingsRes.rows[0].preferences); } catch {}
  }

  const portalEnabled = prefs.staffPortalEnabled !== false; // default on
  if (!portalEnabled && activeStaff.length > 0) {
    checks.push(warn("portal_access", "Staff portal enabled", "Staff portal is disabled but active staff exist — staff cannot log in to manage their schedules.", "Settings → Team → Staff Portal"));
  } else {
    checks.push(pass("portal_access", "Staff portal enabled", portalEnabled ? "Staff portal is enabled." : "Portal disabled (no active staff)."));
  }

  return {
    segmentId: "team_roster",
    label: "Team Roster",
    status: rollup(checks),
    runAt: new Date().toISOString(),
    checks,
    tables,
  };
}
