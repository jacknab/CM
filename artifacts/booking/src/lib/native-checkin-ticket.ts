/** Ask this Android tablet's native printer to print a check-in slip. */
export function printNativeCheckinTicket(ticket: {
  clientName: string;
  ticketNumber: number;
  qrValue: string;
  todayCount?: number;
  /** What the client chose (services, then "+ add-on" lines) — printed so the slip can go to the tech. */
  services?: string[];
}): Promise<boolean> {
  const bridge = (window as any).ReactNativeWebView;
  if (!bridge?.postMessage || !(window as any).CERTXA_NATIVE_APP) return Promise.resolve(false);

  const requestId = `ci_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  return new Promise((resolve) => {
    const finish = (printed: boolean) => {
      window.removeEventListener("certxa_native_print_result", onResult);
      clearTimeout(timeout);
      resolve(printed);
    };
    const onResult = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.requestId !== requestId) return;
      if (!detail.ok) console.warn("[check-in ticket print] local printer failed:", detail.error);
      finish(detail.ok === true);
    };
    const timeout = setTimeout(() => finish(false), 45_000);
    window.addEventListener("certxa_native_print_result", onResult);
    try {
      bridge.postMessage(JSON.stringify({
        type: "PRINT_CHECKIN_TICKET", requestId,
        qrValue: ticket.qrValue,
        todayCount: ticket.todayCount ?? ticket.ticketNumber,
        ticket: { clientName: ticket.clientName, ticketNumber: ticket.ticketNumber, date: new Date().toISOString(), services: ticket.services ?? [] },
      }));
    } catch (err) {
      console.warn("[check-in ticket print] native bridge failed:", err);
      finish(false);
    }
  });
}

/** Names to print from the service / add-on objects a check-in carries ({ name } or plain strings). */
export function slipServiceNames(services: unknown): string[] {
  if (!Array.isArray(services)) return [];
  return services
    .map((s) => (typeof s === "string" ? s : (s as { name?: unknown } | null)?.name))
    .filter((n): n is string => typeof n === "string" && n.trim() !== "")
    .map((n) => n.trim().slice(0, 60));
}
