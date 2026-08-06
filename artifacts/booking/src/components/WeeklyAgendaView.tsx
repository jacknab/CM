import { useMemo } from "react";
import { formatInTz, formatStoreDate, getNowInTimezone, isOnStoreDate, isSameStoreDay } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { isStaffDateSelectable } from "@/lib/staffCalendarDatePolicy";
import { CalendarPlus, Clock, ChevronLeft } from "lucide-react";
import { usePendingSyncMap } from "@/hooks/use-pending-sync";
import { AppointmentSyncBadge } from "@/components/AppointmentSyncBadge";

interface WeeklyAgendaViewProps {
  appointments: any[];
  staffList: any[];
  timezone: string;
  weekDayLabels: { date: Date; label: string; isToday: boolean }[];
  currentDate: Date;
  onSelectAppointment: (apt: any) => void;
  onNewBooking: () => void;
  getStaffColor: (member: any) => string;
  selectedAppointment: any | null;
  onBack?: () => void;
  hidePastDates?: boolean;
}

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  pending:   { bg: "#eff6ff", text: "#3b82f6", label: "Pending" },
  confirmed: { bg: "#f0fdf4", text: "#22c55e", label: "Confirmed" },
  started:   { bg: "#fefce8", text: "#eab308", label: "In Progress" },
  completed: { bg: "#f3f4f6", text: "#9ca3af", label: "Done" },
  cancelled: { bg: "#fff1f2", text: "#fb7185", label: "Cancelled" },
  no_show:   { bg: "#fff1f2", text: "#fb7185", label: "No Show" },
  late:      { bg: "#fff7ed", text: "#fb923c", label: "Late" },
};

export function WeeklyAgendaView({
  appointments,
  staffList,
  timezone,
  weekDayLabels,
  currentDate,
  onSelectAppointment,
  onNewBooking,
  getStaffColor,
  selectedAppointment,
  onBack,
  hidePastDates = false,
}: WeeklyAgendaViewProps) {
  const storeNow = getNowInTimezone(timezone);
  const { syncMap, conflictMap } = usePendingSyncMap();

  const weekDays = useMemo(() => {
    if (!hidePastDates) return weekDayLabels;

    return weekDayLabels.filter((wd) => isStaffDateSelectable(wd.date, storeNow));
  }, [hidePastDates, storeNow, weekDayLabels]);

  const apptsByDay = useMemo(() => {
    const map = new Map<string, any[]>();
    weekDays.forEach((wd) => {
      const key = formatStoreDate(wd.date, "yyyy-MM-dd");
      const dayApts = appointments
        .filter((apt: any) => {
          return isOnStoreDate(apt.date, wd.date, timezone);
        })
        .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
      map.set(key, dayApts);
    });
    return map;
  }, [appointments, weekDays, timezone]);

  const totalCount = useMemo(
    () => [...apptsByDay.values()].reduce((s, a) => s + a.length, 0),
    [apptsByDay],
  );

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Sticky week summary bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2.5 border-b bg-card">
        <div className="flex items-center gap-1.5 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              className="w-8 h-8 flex items-center justify-center rounded-full active:bg-slate-100 transition-colors shrink-0 -ml-1"
              aria-label="Back to calendar"
            >
              <ChevronLeft size={20} className="text-slate-500" />
            </button>
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {weekDays.length > 0
                ? `${formatStoreDate(weekDays[0].date, "MMM d")} – ${formatStoreDate(weekDays[weekDays.length - 1].date, "MMM d, yyyy")}`
                : "No upcoming dates"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {totalCount === 0
                ? "No appointments this week"
                : `${totalCount} appointment${totalCount !== 1 ? "s" : ""} this week`}
            </p>
          </div>
        </div>
        <button
          onClick={onNewBooking}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-semibold shadow-sm hover:bg-primary/90 active:scale-95 transition-all"
        >
          <CalendarPlus className="w-3.5 h-3.5" />
          Book
        </button>
      </div>

      {/* Scrollable day list */}
      <div className="flex-1 overflow-y-auto">
        {weekDays.map((wd) => {
          const key = formatStoreDate(wd.date, "yyyy-MM-dd");
          const dayApts = apptsByDay.get(key) ?? [];
          const isToday = isSameStoreDay(wd.date, storeNow);
          const isPast = wd.date.getTime() < new Date(Date.UTC(
            storeNow.getUTCFullYear(),
            storeNow.getUTCMonth(),
            storeNow.getUTCDate(),
          )).getTime();

          return (
            <div key={key} className="border-b last:border-b-0">
              {/* Day header */}
              <div
                className={cn(
                  "flex items-center gap-3 px-4 py-2 sticky top-0 z-10 border-b",
                  isToday
                    ? "bg-primary/5 border-primary/10"
                    : isPast
                    ? "bg-muted/30"
                    : "bg-card",
                )}
              >
                {/* Date circle */}
                <div
                  className={cn(
                    "flex-shrink-0 w-9 h-9 rounded-full flex flex-col items-center justify-center leading-none",
                    isToday
                      ? "bg-primary text-primary-foreground"
                      : isPast
                      ? "bg-muted text-muted-foreground"
                      : "bg-muted/60 text-foreground",
                  )}
                >
                  <span className="text-[9px] font-semibold uppercase tracking-wide opacity-80">
                    {formatStoreDate(wd.date, "EEE")}
                  </span>
                  <span className="text-sm font-bold leading-none">{formatStoreDate(wd.date, "d")}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm font-semibold", isToday ? "text-primary" : isPast ? "text-muted-foreground" : "text-foreground")}>
                    {isToday ? "Today" : formatStoreDate(wd.date, "EEEE, MMMM d")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {dayApts.length === 0
                      ? "No appointments"
                      : `${dayApts.length} appointment${dayApts.length !== 1 ? "s" : ""}`}
                  </p>
                </div>

                {isToday && (
                  <span className="flex-shrink-0 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                    Today
                  </span>
                )}
              </div>

              {/* Appointments */}
              {dayApts.length === 0 ? (
                <div className="px-4 py-3 flex items-center gap-2">
                  <div className="w-px h-8 bg-border rounded-full" />
                  <p className="text-xs text-muted-foreground/60 italic">No bookings</p>
                </div>
              ) : (
                <div className="px-3 py-2 flex flex-col gap-2">
                  {dayApts.map((apt: any) => {
                    const staff = staffList?.find((s: any) => s.id === apt.staffId);
                    const staffColor = getStaffColor(staff);
                    const timeStr = formatInTz(apt.date, timezone, "h:mm a");
                    const endDate = new Date(new Date(apt.date).getTime() + (apt.duration ?? 0) * 60000);
                    const endStr = formatInTz(endDate, timezone, "h:mm a");
                    const customerName = apt.customer?.fullName || apt.customer?.name || apt.clientName || "Walk-In";
                    const firstName = customerName.split(" ")[0];
                    const serviceName = apt.service?.name || "—";
                    const statusInfo = STATUS_COLORS[apt.status] ?? STATUS_COLORS.pending;
                    const isSelected = selectedAppointment?.id === apt.id;

                    return (
                      <button
                        key={apt.id}
                        type="button"
                        onClick={() => onSelectAppointment(apt)}
                        className={cn(
                          "w-full text-left rounded-xl border px-3 py-2.5 shadow-sm transition-all active:scale-[0.98]",
                          isSelected
                            ? "ring-2 ring-primary border-primary/20 bg-primary/5"
                            : "bg-card hover:bg-muted/40",
                        )}
                        data-testid={`agenda-appt-${apt.id}`}
                      >
                        <div className="flex items-start gap-3">
                          {/* Staff color stripe */}
                          <div
                            className="flex-shrink-0 w-1 self-stretch rounded-full mt-0.5"
                            style={{ backgroundColor: staffColor, minHeight: 32 }}
                          />

                          <div className="flex-1 min-w-0">
                            {/* Top row: time + status badge */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="w-3 h-3 flex-shrink-0" />
                                <span className="font-medium">{timeStr}</span>
                                <span className="opacity-50">–</span>
                                <span>{endStr}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <span
                                  className="flex-shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                                  style={{ backgroundColor: statusInfo.bg, color: statusInfo.text }}
                                >
                                  {statusInfo.label}
                                </span>
                                <AppointmentSyncBadge
                                  syncState={syncMap.get(apt._tempId) ?? (syncMap.get(`real:${apt.id}`) as any)}
                                  conflictDetail={conflictMap.get(apt._tempId) ?? conflictMap.get(`real:${apt.id}`)}
                                  entityTempId={apt._tempId}
                                  entityRealId={typeof apt.id === "number" ? apt.id : undefined}
                                />
                              </div>
                            </div>

                            {/* Customer name + service */}
                            <p className="text-sm font-bold text-foreground mt-1 truncate">{firstName}</p>
                            <p className="text-xs text-muted-foreground truncate">{serviceName}</p>

                            {/* Staff */}
                            {staff && (
                              <p className="text-[10px] text-muted-foreground/70 mt-0.5 flex items-center gap-1">
                                <span
                                  className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                                  style={{ backgroundColor: staffColor }}
                                />
                                {staff.name}
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Bottom safe area padding for mobile */}
        <div className="h-24 md:h-8" />
      </div>
    </div>
  );
}
