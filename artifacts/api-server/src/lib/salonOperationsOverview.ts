import { formatInTimeZone } from "date-fns-tz";
import { pool } from "../db";
import { storage } from "../storage";
import { estimateWait, type WaitTech, type WaitingClient } from "@shared/waitEstimate";
import { getNailBoard } from "./nailTickets";

export interface SalonOperationsOverview {
  generatedAt: string;
  salonLocalTime: string;
  address: string | null;
  closesToday: string | null;
  walkInsAccepted: boolean;
  appointmentsAccepted: boolean;
  walkInCutoff: string | null;
  staffWorking: Array<{ id: number; name: string; status: "available" | "busy" | "break"; availableAt: string | null }>;
  workingStaffCount: number;
  availableStaffCount: number;
  waitingCount: number;
  inServiceCount: number;
  estimatedWaitMinutes: number | null;
  waitReason: string | null;
}

/** Read-only aggregation of Certxa's existing board, timeclock, policy, and wait estimator. */
export async function getSalonOperationsOverview(storeId: number, timezone: string): Promise<SalonOperationsOverview> {
  const tz = timezone || "UTC";
  const now = new Date();
  const dayOfWeek = Number(formatInTimeZone(now, tz, "i")) % 7;
  const workDate = formatInTimeZone(now, tz, "yyyy-MM-dd");

  const [store, hours, staff, board, clocked, settingsRows] = await Promise.all([
    storage.getStore(storeId),
    storage.getBusinessHours(storeId),
    storage.getAllStaff(storeId),
    getNailBoard(storeId),
    pool.query(`SELECT DISTINCT staff_id FROM timeclock WHERE store_id = $1 AND work_date = $2 AND clock_out IS NULL`, [storeId, workDate]),
    pool.query(
      `SELECT cs.walk_ins_enabled, ss.preferences
         FROM (SELECT $1::int AS store_id) x
         LEFT JOIN calendar_settings cs ON cs.store_id = x.store_id
         LEFT JOIN store_settings ss ON ss.store_id = x.store_id`,
      [storeId],
    ),
  ]);

  const prefs = (() => {
    try { return JSON.parse(settingsRows.rows[0]?.preferences ?? "{}"); } catch { return {}; }
  })() as Record<string, unknown>;
  const walkInsAccepted = settingsRows.rows[0]?.walk_ins_enabled !== false && prefs.queueEnabled !== false;
  const appointmentsAccepted = (store as any)?.onlineBookingMode !== "off";
  const clockedIds = new Set<number>(clocked.rows.map((row: any) => Number(row.staff_id)));
  const started = board.tickets.filter((ticket) => ticket.status === "started");
  const waitingTickets = board.tickets.filter((ticket) => ticket.status === "confirmed");
  const waiting: WaitingClient[] = [
    ...waitingTickets.map((ticket) => ({ durationMin: ticket.duration, staffId: ticket.staff?.id ?? null })),
    ...board.markers.map(() => ({ durationMin: null, staffId: null })),
  ];
  const workingStaff = staff
    .filter((member) => !["removed", "deactivated"].includes(String(member.status)))
    .filter((member) => clockedIds.has(member.id));
  const waitTechs: WaitTech[] = workingStaff.map((member) => {
    const current = started.find((ticket) => ticket.staff?.id === member.id);
    return {
      id: member.id,
      clockedIn: true,
      paused: member.availabilityState === "break",
      busy: Boolean(current) || member.availabilityState === "busy",
      remainingMin: current
        ? (new Date(current.startedAt ?? current.date).getTime() + current.duration * 60_000 - now.getTime()) / 60_000
        : null,
    };
  });
  const durations = [...started, ...waitingTickets].map((ticket) => ticket.duration).filter((value) => value > 0);
  const wait = estimateWait({
    techs: waitTechs,
    waiting,
    defaultServiceMin: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 45,
  });
  const dayHours = hours.find((entry) => entry.dayOfWeek === dayOfWeek);
  const staffWorking = workingStaff.map((member) => {
    const current = started.find((ticket) => ticket.staff?.id === member.id);
    const status = member.availabilityState === "break" ? "break" as const
      : current || member.availabilityState === "busy" ? "busy" as const : "available" as const;
    return {
      id: member.id,
      name: member.name,
      status,
      availableAt: current
        ? new Date(new Date(current.startedAt ?? current.date).getTime() + current.duration * 60_000).toISOString()
        : null,
    };
  });

  return {
    generatedAt: now.toISOString(),
    salonLocalTime: formatInTimeZone(now, tz, "EEEE, MMMM d, yyyy 'at' h:mm a zzz"),
    address: (store as any)?.address ?? null,
    closesToday: dayHours && !dayHours.isClosed ? dayHours.closeTime : null,
    walkInsAccepted,
    appointmentsAccepted,
    walkInCutoff: typeof prefs.walkInCutoffTime === "string" ? prefs.walkInCutoffTime : null,
    staffWorking,
    workingStaffCount: staffWorking.length,
    availableStaffCount: staffWorking.filter((member) => member.status === "available").length,
    waitingCount: waiting.length,
    inServiceCount: started.length,
    estimatedWaitMinutes: wait.minutes,
    waitReason: wait.reason ?? null,
  };
}

export function summarizeSalonOperations(overview: SalonOperationsOverview): string {
  const staff = overview.staffWorking.length
    ? overview.staffWorking.map((member) => `${member.name}: ${member.status}${member.availableAt ? ` (estimated available ${member.availableAt})` : ""}`).join("; ")
    : "No staff are currently clocked in.";
  const wait = overview.estimatedWaitMinutes == null
    ? `No reliable wait estimate is available${overview.waitReason ? ` (${overview.waitReason})` : ""}.`
    : `The current estimated wait is ${overview.estimatedWaitMinutes === 0 ? "0" : `about ${overview.estimatedWaitMinutes}`} minutes.`;
  return [
    `Live salon overview as of ${overview.salonLocalTime}.`,
    overview.address ? `Address: ${overview.address}.` : "",
    overview.closesToday ? `The salon closes today at ${overview.closesToday}.` : "No closing time is configured for today.",
    `Walk-ins are ${overview.walkInsAccepted ? "accepted" : "not accepted"}; appointments are ${overview.appointmentsAccepted ? "accepted" : "not accepted"}.`,
    overview.walkInCutoff ? `Walk-in cutoff: ${overview.walkInCutoff}.` : "No separate walk-in cutoff is configured.",
    `${overview.workingStaffCount} staff clocked in; ${overview.availableStaffCount} currently available; ${overview.inServiceCount} clients in service; ${overview.waitingCount} waiting.`,
    wait,
    `Staff: ${staff}`,
  ].filter(Boolean).join(" ");
}
