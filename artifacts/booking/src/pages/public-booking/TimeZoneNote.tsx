import { visitorTimeZoneNote } from "@/lib/timezone";

/** "Times are in Mountain Time (Denver)." above the times, only for visitors in another time zone. */
export function TimeZoneNote({ timezone, at, className, style }: { timezone: string; at?: string | Date; className?: string; style?: React.CSSProperties }) {
  const note = visitorTimeZoneNote(timezone, at ? new Date(at) : new Date());
  if (!note) return null;
  return <p data-testid="text-timezone-note" className={className ?? "text-center text-xs text-gray-500"} style={style}>{note}</p>;
}
