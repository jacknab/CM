import { Timer } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

interface AvailableTimeBannerProps {
  availableMinutes: number;
  usedMinutes?: number;
}

export function AvailableTimeBanner({ availableMinutes, usedMinutes = 0 }: AvailableTimeBannerProps) {
  const { pick } = useLanguage();
  const emph = { color: "#e5e5e7", fontWeight: 600 } as const;
  const avail = <span style={emph}>{availableMinutes} {pick({ en: "min", vi: "phút", es: "min", fr: "min" })}</span>;

  return (
    <div
      className="rounded-xl px-3.5 py-3 flex items-start gap-3"
      style={{ backgroundColor: "rgba(96,165,250,0.09)", border: "1px solid rgba(96,165,250,0.22)" }}
    >
      <Timer className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#60a5fa" }} />
      <div>
        <p className="text-sm font-semibold" style={{ color: "#93c5fd" }}>
          {pick({ en: "Available Time", vi: "Thời gian còn trống", es: "Tiempo disponible", fr: "Temps disponible" })}
        </p>
        <p className="text-xs mt-0.5" style={{ color: "#8e8e93" }}>
          {pick({
            en: <>You have {avail} available for this slot · used {usedMinutes} min.</>,
            vi: <>Bạn còn {avail} trống cho khung giờ này · đã dùng {usedMinutes} phút.</>,
            es: <>Tienes {avail} disponibles para este espacio · usados {usedMinutes} min.</>,
            fr: <>Vous avez {avail} disponibles pour ce créneau · utilisées {usedMinutes} min.</>,
          })}
        </p>
      </div>
    </div>
  );
}
