import { useQuery } from "@tanstack/react-query";
import { useSnapshot } from "@/hooks/use-snapshot";
import { appointmentsCacheDB } from "@/lib/appointments-cache-db";
import type { SnapshotStaff, SnapshotStaffAvailability, SnapshotBusinessHours } from "@/lib/snapshot-db";

export type TimeSlot = {
  time: string;
  staffId: number;
  staffName: string;
};

const SLOT_INTERVAL_MIN = 15;

async function generateOfflineSlots(
  date: string,
  duration: number,
  staffMembers: SnapshotStaff[],
  storeHours: SnapshotBusinessHours[],
  staffAvailabilityRules: SnapshotStaffAvailability[],
  storeId: number,
  filterStaffId?: number | null
): Promise<TimeSlot[]> {
  if (!date || !staffMembers.length) return [];

  const [yr, mo, dy] = date.split("-").map(Number);
  const dayOfWeek = new Date(yr, mo - 1, dy).getDay();

  const dayHours = storeHours.find(h => h.dayOfWeek === dayOfWeek);
  if (!dayHours || dayHours.isClosed) return [];

  const [openH, openM] = dayHours.openTime.split(":").map(Number);
  const [closeH, closeM] = dayHours.closeTime.split(":").map(Number);
  const storeOpenMin = openH * 60 + openM;
  const storeCloseMin = closeH * 60 + closeM;

  const [cachedAppts, localAppts] = await Promise.all([
    appointmentsCacheDB.getCachedAppointments(storeId, date, date).catch(() => [] as any[]),
    appointmentsCacheDB.getLocalBookingsForRange(storeId, date, date).catch(() => [] as any[]),
  ]);

  type Busy = { staffId: number; startMs: number; endMs: number };
  const busy: Busy[] = [
    ...cachedAppts
      .filter((a: any) => a.status !== "cancelled" && a.staffId != null)
      .map((a: any) => ({
        staffId: Number(a.staffId),
        startMs: new Date(a.date).getTime(),
        endMs: new Date(a.date).getTime() + (a.duration ?? 0) * 60000,
      })),
    ...localAppts
      .filter((a: any) => a.status !== "cancelled" && a.staffId != null && !a._syncedRealId)
      .map((a: any) => ({
        staffId: Number(a.staffId),
        startMs: new Date(a.date).getTime(),
        endMs: new Date(a.date).getTime() + (a.duration ?? 0) * 60000,
      })),
  ];

  const eligible = filterStaffId
    ? staffMembers.filter(s => s.id === filterStaffId)
    : staffMembers;

  const nowMs = Date.now();
  const slots: TimeSlot[] = [];

  for (const member of eligible) {
    const rules = staffAvailabilityRules.filter(
      a => a.staffId === member.id && a.dayOfWeek === dayOfWeek
    );

    let workStartMin = storeOpenMin;
    let workEndMin = storeCloseMin;

    if (rules.length > 0) {
      const [sh, sm] = rules[0].startTime.split(":").map(Number);
      const [eh, em] = rules[0].endTime.split(":").map(Number);
      workStartMin = Math.max(storeOpenMin, sh * 60 + sm);
      workEndMin = Math.min(storeCloseMin, eh * 60 + em);
    }

    if (workStartMin >= workEndMin) continue;

    for (
      let minOffset = workStartMin;
      minOffset + duration <= workEndMin;
      minOffset += SLOT_INTERVAL_MIN
    ) {
      const slotStart = new Date(yr, mo - 1, dy, Math.floor(minOffset / 60), minOffset % 60, 0, 0);
      const slotEnd = new Date(slotStart.getTime() + duration * 60000);

      if (slotStart.getTime() <= nowMs) continue;

      const conflict = busy.some(
        b =>
          b.staffId === member.id &&
          b.startMs < slotEnd.getTime() &&
          b.endMs > slotStart.getTime()
      );
      if (conflict) continue;

      slots.push({
        time: slotStart.toISOString(),
        staffId: member.id,
        staffName: member.name,
      });
    }
  }

  return slots.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
}

function generateFallbackOfflineSlots(
  staffMembers: SnapshotStaff[],
  filterStaffId?: number | null
): TimeSlot[] {
  const eligible = filterStaffId
    ? staffMembers.filter(s => s.id === filterStaffId)
    : staffMembers;
  if (!eligible.length) return [];

  const now = new Date();
  const ms15 = 15 * 60 * 1000;
  const rounded = new Date(Math.ceil(now.getTime() / ms15) * ms15);

  const slots: TimeSlot[] = [];
  for (let i = 0; i < 32; i++) {
    const t = new Date(rounded.getTime() + i * ms15);
    for (const s of eligible) {
      slots.push({ time: t.toISOString(), staffId: s.id, staffName: s.name });
    }
  }
  return slots;
}

export function useAvailableSlots(
  serviceId: number | null,
  storeId: number | null,
  date: string | null,
  duration: number,
  staffId?: number | null
) {
  const { snapshot } = useSnapshot();

  return useQuery<TimeSlot[]>({
    queryKey: ["/api/availability/slots", serviceId, storeId, date, duration, staffId],
    enabled: !!serviceId && !!storeId && !!date && duration > 0,
    networkMode: "always",
    queryFn: async () => {
      if (!navigator.onLine) {
        const staffFromSnapshot = (snapshot?.staff ?? []) as SnapshotStaff[];
        const storeHours = (snapshot?.storeHours ?? []) as SnapshotBusinessHours[];
        const staffAvailability = (snapshot?.staffAvailability ?? []) as SnapshotStaffAvailability[];

        if (storeHours.length > 0 && date && storeId) {
          return generateOfflineSlots(
            date,
            duration,
            staffFromSnapshot,
            storeHours,
            staffAvailability,
            storeId,
            staffId
          );
        }

        return generateFallbackOfflineSlots(staffFromSnapshot, staffId);
      }

      const params = new URLSearchParams({
        serviceId: String(serviceId),
        storeId: String(storeId),
        date: date!,
        duration: String(duration),
      });
      if (staffId) params.set("staffId", String(staffId));
      const res = await fetch(`/api/availability/slots?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch availability");
      return res.json();
    },
  });
}
