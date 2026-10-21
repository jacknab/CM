/**
 * "Who got each client today" — inside the Turn popup's "Why this order?" sheet (owner, 2026-10-21). For every client
 * the turn system (or staff) gave out today: who got them, why, and everyone ahead in line who was passed over and
 * the reason — with the service named ("Tom Lam doesn't do Dip Powder"), so nobody has to argue about it.
 * Built from the turn history the server records at each assignment (GET /api/turn/history).
 */
import { useQuery } from "@tanstack/react-query";
import { formatTurns } from "@shared/turnRules";
import { useLanguage } from "@/hooks/use-language";

type Considered = { id: number; name: string; units?: number; reasons?: string[]; eligible?: boolean; position?: number };
type TurnEvent = {
  id: number; at: string; kind: string; staffId: number | null; staffName: string | null; ticketNumber: number | null;
  serviceName: string | null; clientName: string | null; automatic: boolean; reason: string | null; actorName: string | null;
  explanation: string | null; details: { source?: string; considered?: Considered[]; fromStaffId?: number } | null;
};
type Lang = "en" | "vi" | "es";

const firstName = (n: string | null | undefined) => (n ?? "").trim().split(/\s+/)[0] || "";

function reasonText(code: string, service: string, l: Lang): string {
  switch (code) {
    case "service_not_supported": return { en: `doesn't do ${service}`, vi: `không làm ${service}`, es: `no hace ${service}` }[l];
    case "currently_busy": return { en: "was with a client", vi: "đang làm khách", es: "estaba con un cliente" }[l];
    case "paused": return { en: "was on break", vi: "đang nghỉ", es: "estaba en descanso" }[l];
    case "not_clocked_in": return { en: "wasn't clocked in", vi: "chưa vào ca", es: "no había marcado entrada" }[l];
    case "appointment_within_exclusion_window": return { en: "had a booked appointment coming up", vi: "sắp có khách hẹn", es: "tenía una cita pronto" }[l];
    default: return code;
  }
}

function explain(e: TurnEvent, l: Lang): { why: string; passed: string[] } {
  const who = e.staffName ?? "—";
  const service = e.serviceName ?? { en: "this service", vi: "dịch vụ này", es: "este servicio" }[l];
  const considered = e.details?.considered ?? [];
  const chosen = considered.find((c) => c.id === e.staffId);
  if (!e.automatic) {
    const from = e.details?.fromStaffId != null ? considered.find((c) => c.id === e.details!.fromStaffId)?.name : null;
    const by = e.actorName ? ` (${e.actorName})` : "";
    const why = {
      en: `Given to ${who} by staff${by}${from ? `, moved from ${from}` : ""}.${e.reason ? ` Reason: ${e.reason}` : ""}`,
      vi: `Nhân viên${by} giao cho ${who}${from ? `, chuyển từ ${from}` : ""}.${e.reason ? ` Lý do: ${e.reason}` : ""}`,
      es: `El personal${by} se lo dio a ${who}${from ? `, movido de ${from}` : ""}.${e.reason ? ` Motivo: ${e.reason}` : ""}`,
    }[l];
    return { why, passed: [] };
  }
  // Everyone ahead of the technician who got the client, and why each could not take them.
  const ahead = chosen?.position != null ? considered.filter((c) => (c.position ?? 99) < chosen.position! && c.id !== e.staffId) : [];
  const passed = ahead.map((c) => {
    const reasons = (c.reasons ?? []).map((r) => reasonText(r, service, l));
    return `${c.name} ${reasons.length ? reasons.join(", ") : { en: "was not chosen", vi: "không được chọn", es: "no fue elegido" }[l]}`;
  });
  const turns = chosen?.units != null ? ` (${formatTurns(chosen.units)} ${{ en: "turns", vi: "lượt", es: "turnos" }[l]})` : "";
  const source = e.details?.source;
  const how = source === "nail_follow_on"
    ? { en: " This was the visit's next service, given out when the first one was done.", vi: " Đây là dịch vụ kế tiếp của khách, được giao khi dịch vụ trước xong.", es: " Era el siguiente servicio de la visita, asignado al terminar el primero." }[l]
    : source === "nail_queue_compatibility"
    ? { en: " The client was waiting and went to the first technician who became free and does the service.", vi: " Khách đang chờ và được giao cho thợ đầu tiên rảnh và làm được dịch vụ.", es: " El cliente esperaba y fue al primer técnico libre que hace el servicio." }[l]
    : "";
  const why = {
    en: `${who} was next${turns} of the technicians who could take this client.${how}`,
    vi: `${who} là người kế tiếp${turns} trong số thợ có thể nhận khách này.${how}`,
    es: `${who} era el siguiente${turns} entre los técnicos que podían atender a este cliente.${how}`,
  }[l];
  return { why, passed };
}

export function TurnAssignmentHistory({ storeId, open }: { storeId: number; open: boolean }) {
  const { pick } = useLanguage();
  const lang = pick({ en: "en", vi: "vi", es: "es", fr: "en" }) as Lang;
  const { data } = useQuery<{ events: TurnEvent[] }>({
    queryKey: ["/api/turn/history", storeId],
    queryFn: async () => {
      const r = await fetch(`/api/turn/history?storeId=${storeId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Could not load the turn history");
      return r.json();
    },
    enabled: open && storeId > 0,
    refetchInterval: open ? 30_000 : false,
  });
  const assigned = (data?.events ?? []).filter((e) => e.kind === "assigned" && e.staffId != null).slice(0, 30);
  if (assigned.length === 0) return null;
  const title = { en: "Who got each client today", vi: "Khách hôm nay được giao cho ai", es: "Quién atendió a cada cliente hoy" }[lang];
  const passedLabel = { en: "Passed over", vi: "Bị bỏ qua", es: "Saltados" }[lang];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4" data-testid="turn-assignment-history">
      <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p>
      <ol className="space-y-3">
        {assigned.map((e) => {
          const { why, passed } = explain(e, lang);
          return (
            <li key={e.id} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">
                  {e.ticketNumber != null && <span className="mr-1.5 rounded bg-slate-900 px-1.5 py-0.5 text-[11px] font-black text-white">{e.ticketNumber}</span>}
                  {e.serviceName ?? "—"}{e.clientName ? ` · ${firstName(e.clientName)}` : ""} → <span className="text-blue-700">{e.staffName}</span>
                </p>
                <span className="text-xs text-slate-400">{new Date(e.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
              </div>
              <p className="mt-1 text-[13px] leading-5 text-slate-600">{why}</p>
              {passed.length > 0 && (
                <p className="mt-1 text-[13px] leading-5 text-amber-800">
                  <span className="font-semibold">{passedLabel}:</span> {passed.join(" · ")}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
