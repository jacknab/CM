import { cn } from "@/lib/utils";

/**
 * Three "Quick Area Codes" buttons under a phone keypad. Tapping one types that area code exactly as if staff had
 * pressed its three digits. A button the salon hasn't set up shows blank and does nothing.
 * Two looks: `page` (the full-screen Check-In page) and `sheet` (the walk-in sheet's wrapper styling).
 */
export function QuickAreaCodes({ codes, onPick, variant }: { codes: string[]; onPick: (code: string) => void; variant: "page" | "sheet" }) {
  if (variant === "sheet") {
    return (
      <div data-testid="nail-quick-area-codes">
        <div className="walkin-quick-label">QUICK AREA CODES</div>
        <div className="walkin-quick-row">
          {codes.map((c, i) => c ? (
            <button key={i} type="button" className="walkin-quick" onClick={() => onPick(c)} data-testid={`nail-quick-area-${i + 1}`}>{c}</button>
          ) : (
            <button key={i} type="button" className="walkin-quick walkin-quick-blank" disabled aria-label="Quick area code not set" data-testid={`nail-quick-area-${i + 1}`} />
          ))}
        </div>
      </div>
    );
  }
  const KEY = "w-[clamp(84px,9vw,124px)] h-[clamp(52px,9.5vh,84px)] rounded-lg border text-[clamp(24px,4vh,36px)] font-semibold";
  return (
    <div className="pt-[1.4vh]" data-testid="nail-quick-area-codes">
      <div className="text-center text-[11px] font-semibold tracking-[0.2em] text-muted-foreground mb-[0.8vh]">QUICK AREA CODES</div>
      <div className="flex justify-center gap-2">
        {codes.map((c, i) => c ? (
          <button key={i} onClick={() => onPick(c)} data-testid={`nail-quick-area-${i + 1}`}
            className={cn(KEY, "border-primary/40 bg-primary/10 text-primary transition-colors active:bg-primary/30 active:scale-[0.97]")}>{c}</button>
        ) : (
          <button key={i} disabled aria-label="Quick area code not set" data-testid={`nail-quick-area-${i + 1}`}
            className={cn(KEY, "border-dashed border-border bg-transparent opacity-50")} />
        ))}
      </div>
    </div>
  );
}
