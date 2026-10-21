/**
 * "How turns work" — a plain-language guide for technicians to the turn method THIS salon runs, opened from the
 * Turn popup's header (owner, 2026-10-21). Everything in it is worked out from the salon's own turn settings
 * (shared/turnRules.ts), so the examples are exactly what the line will do.
 */
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { formatTurns, normalizeTurnRules, turnUnits, TURN_PRESETS, type TurnRules } from "@shared/turnRules";
import { useLanguage } from "@/hooks/use-language";

type Lang = "en" | "vi" | "es";
const EXAMPLE_AMOUNTS = [15, 30, 45, 60, 75, 90];
const money = (n: number) => `$${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}`;

/** The method's name in the tech's language. */
const METHOD: Record<TurnRules["mode"], Record<Lang, string>> = {
  round_robin: { en: "Fixed order", vi: "Theo thứ tự cố định", es: "Orden fijo" },
  client_count: { en: "Equal clients", vi: "Đếm số khách", es: "Clientes iguales" },
  classic: { en: "Counted Turns", vi: "Đếm lượt", es: "Turnos contados" },
  dollar: { en: "Dollar-Based Turns", vi: "Lượt theo số tiền", es: "Turnos por dólares" },
  brackets: { en: "Dollar brackets", vi: "Lượt theo mức tiền", es: "Turnos por rangos de dólares" },
  proportional: { en: "Proportional to price", vi: "Lượt theo tỷ lệ giá", es: "Proporcional al precio" },
};

function howYouEarn(r: TurnRules, l: Lang): string[] {
  const T = money(r.dollarsPerTurn);
  const half = formatTurns(Math.round(r.partialTurnValue * 1000));
  switch (r.mode) {
    case "round_robin":
      return [{
        en: "Walk-ins go to each technician in order. When you take a client, you go to the end of the line.",
        vi: "Khách walk-in được chia cho từng thợ theo thứ tự. Khi bạn nhận khách, bạn xuống cuối hàng.",
        es: "Los clientes sin cita van a cada técnico en orden. Cuando atiendes a un cliente, pasas al final de la fila.",
      }[l], {
        en: "The price of the service does not matter.",
        vi: "Giá dịch vụ không ảnh hưởng.",
        es: "El precio del servicio no importa.",
      }[l]];
    case "client_count":
      return [{
        en: "Every paid walk-in ticket counts as 1 client, whatever it costs.",
        vi: "Mỗi phiếu walk-in đã tính tiền được tính là 1 khách, dù giá bao nhiêu.",
        es: "Cada ticket sin cita pagado cuenta como 1 cliente, cueste lo que cueste.",
      }[l], {
        en: "The technician with the fewest clients is next.",
        vi: "Thợ có ít khách nhất sẽ được khách kế tiếp.",
        es: "El técnico con menos clientes es el siguiente.",
      }[l]];
    case "classic":
      return [{
        en: `A ticket of ${T} or more earns 1 turn.`,
        vi: `Phiếu từ ${T} trở lên được 1 lượt.`,
        es: `Un ticket de ${T} o más gana 1 turno.`,
      }[l], {
        en: `A ticket under ${T} earns 1/2 turn.`,
        vi: `Phiếu dưới ${T} được 1/2 lượt.`,
        es: `Un ticket de menos de ${T} gana 1/2 turno.`,
      }[l]];
    case "dollar":
      return [{
        en: `Every ${T} of service earns 1 turn.`,
        vi: `Mỗi ${T} tiền dịch vụ được 1 lượt.`,
        es: `Cada ${T} de servicio gana 1 turno.`,
      }[l], {
        en: `A ticket of ${T} or less earns ${half} turn. Over ${T}, any amount left over earns another ${half} turn.`,
        vi: `Phiếu từ ${T} trở xuống được ${half} lượt. Trên ${T}, phần tiền dư được thêm ${half} lượt.`,
        es: `Un ticket de ${T} o menos gana ${half} turno. Por encima de ${T}, lo que sobre gana otro ${half} turno.`,
      }[l]];
    case "brackets": {
      const list = (r.brackets ?? []).map((b) => `${b.fromCents === 0 ? { en: "Under", vi: "Dưới", es: "Menos de" }[l] + " " + money((r.brackets?.[1]?.fromCents ?? 0) / 100) : { en: "From", vi: "Từ", es: "Desde" }[l] + " " + money(b.fromCents / 100)}: ${formatTurns(b.units)}`);
      return [{ en: "The salon sets what each amount earns:", vi: "Tiệm đặt số lượt cho từng mức tiền:", es: "El salón fija lo que gana cada monto:" }[l], ...list];
    }
    case "proportional":
      return [{
        en: `Every ${T} of service earns 1 turn, and part of ${T} earns part of a turn.`,
        vi: `Mỗi ${T} tiền dịch vụ được 1 lượt, và một phần của ${T} được một phần lượt.`,
        es: `Cada ${T} de servicio gana 1 turno, y una parte de ${T} gana una parte de turno.`,
      }[l]];
  }
}

function rulesForEveryone(r: TurnRules, l: Lang): string[] {
  const out: string[] = [];
  if (r.mode !== "round_robin") out.push({
    en: "The technician with the lowest total goes next.",
    vi: "Thợ có tổng thấp nhất sẽ được khách kế tiếp.",
    es: "El técnico con el total más bajo va siguiente.",
  }[l]);
  out.push(r.tieBreak === "clock_in_order" ? {
    en: "If two technicians are level, the one who clocked in first goes first.",
    vi: "Nếu hai thợ bằng nhau, ai vào ca trước được trước.",
    es: "Si dos técnicos están empatados, va primero quien marcó entrada antes.",
  }[l] : {
    en: "If two technicians are level, the one who has waited longest goes first.",
    vi: "Nếu hai thợ bằng nhau, ai chờ lâu hơn được trước.",
    es: "Si dos técnicos están empatados, va primero quien lleva más tiempo esperando.",
  }[l]);
  out.push({
    en: "To get a client you must be clocked in, not on break, not with a client, and do that service.",
    vi: "Để nhận khách, bạn phải đã vào ca, không nghỉ, không đang làm khách, và làm được dịch vụ đó.",
    es: "Para recibir un cliente debes haber marcado entrada, no estar en descanso ni con un cliente, y hacer ese servicio.",
  }[l]);
  if (r.mode !== "round_robin") out.push({
    en: `Only walk-in tickets count. Booked appointments earn no turns. Turns are counted on the services only${r.amountBasis === "service_after_discount" ? ", after any discount" : ""} — not tips, not products.`,
    vi: `Chỉ phiếu walk-in mới tính. Khách hẹn trước không được lượt. Lượt tính trên tiền dịch vụ${r.amountBasis === "service_after_discount" ? " sau giảm giá" : ""} — không tính tip, không tính sản phẩm.`,
    es: `Solo cuentan los tickets sin cita. Las citas reservadas no ganan turnos. Los turnos se cuentan solo sobre los servicios${r.amountBasis === "service_after_discount" ? ", después de descuentos" : ""}: no propinas ni productos.`,
  }[l]);
  out.push({
    en: "Your turn is counted when you press DONE, or when the ticket is paid.",
    vi: "Lượt của bạn được tính khi bạn bấm XONG, hoặc khi phiếu được tính tiền.",
    es: "Tu turno se cuenta cuando presionas LISTO, o cuando se paga el ticket.",
  }[l]);
  out.push({
    en: "A client has one service at a time: their next service waits until the one in the chair is done.",
    vi: "Mỗi khách chỉ làm một dịch vụ một lúc: dịch vụ kế tiếp chờ cho đến khi dịch vụ đang làm xong.",
    es: "Un cliente recibe un servicio a la vez: el siguiente espera hasta que termine el que está en la silla.",
  }[l]);
  if (r.categoryRotation) out.push({
    en: "Each service category has its own line.",
    vi: "Mỗi loại dịch vụ có hàng lượt riêng.",
    es: "Cada categoría de servicio tiene su propia fila.",
  }[l]);
  out.push(r.resetPeriod === "continuous" ? {
    en: "Turns keep adding up; they are not reset each day.",
    vi: "Lượt được cộng dồn, không làm lại mỗi ngày.",
    es: "Los turnos se siguen sumando; no se reinician cada día.",
  }[l] : r.resetPeriod === "business_day" ? {
    en: "Everyone starts again at 0 each business day.",
    vi: "Mọi người bắt đầu lại từ 0 mỗi ngày làm việc.",
    es: "Todos empiezan de nuevo en 0 cada día de trabajo.",
  }[l] : {
    en: "Everyone starts again at 0 after Day Close.",
    vi: "Mọi người bắt đầu lại từ 0 sau khi Đóng Ngày.",
    es: "Todos empiezan de nuevo en 0 después del Cierre del Día.",
  }[l]);
  return out;
}

export function TechTurnGuide({ open, settings, onClose }: { open: boolean; settings: Record<string, unknown> | null | undefined; onClose: () => void }) {
  const { pick } = useLanguage();
  const lang = pick({ en: "en", vi: "vi", es: "es", fr: "en" }) as Lang;
  const rules = normalizeTurnRules(settings ?? {});
  const showExamples = rules.mode !== "round_robin" && rules.mode !== "client_count";
  const title = { en: "How turns work here", vi: "Cách tính lượt ở tiệm", es: "Cómo funcionan los turnos aquí" }[lang];
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="absolute inset-0 z-10 bg-black/30" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div className="absolute bottom-0 left-0 right-0 z-20 flex max-h-[82%] flex-col rounded-t-2xl bg-white shadow-2xl"
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 30, stiffness: 300 }}
            data-testid="tech-turn-guide">
            <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">{title}</h3>
                <p className="text-sm text-slate-500">
                  {{ en: "This salon uses", vi: "Tiệm dùng cách", es: "Este salón usa" }[lang]}: <strong className="text-slate-800">{METHOD[rules.mode][lang]}</strong>
                </p>
              </div>
              <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4 text-[15px] leading-relaxed text-slate-700">
              <section>
                <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">{{ en: "How you earn turns", vi: "Cách bạn được lượt", es: "Cómo ganas turnos" }[lang]}</h4>
                <ul className="list-disc space-y-1 pl-5">{howYouEarn(rules, lang).map((line) => <li key={line}>{line}</li>)}</ul>
              </section>
              {showExamples && (
                <section>
                  <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">{{ en: "Examples", vi: "Ví dụ", es: "Ejemplos" }[lang]}</h4>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {EXAMPLE_AMOUNTS.map((a) => (
                      <div key={a} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-center">
                        <div className="text-sm font-semibold text-slate-800">{money(a)}</div>
                        <div className="text-xs text-blue-700">{formatTurns(turnUnits(rules, a))} {{ en: "turn", vi: "lượt", es: "turno" }[lang]}</div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              <section>
                <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">{{ en: "Who goes next", vi: "Ai được khách kế tiếp", es: "Quién va siguiente" }[lang]}</h4>
                <ul className="list-disc space-y-1 pl-5">{rulesForEveryone(rules, lang).map((line) => <li key={line}>{line}</li>)}</ul>
              </section>
              <p className="text-xs text-slate-400">{TURN_PRESETS[rules.mode].description}</p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
