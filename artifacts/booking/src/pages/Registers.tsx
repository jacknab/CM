import { useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Copy, Check, Tablet, ExternalLink, Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppLayout } from "@/components/layout/AppLayout";
import { useInSettingsShell } from "@/lib/settings-shell-context";
import { useToast } from "@/hooks/use-toast";
import { useSelectedStore } from "@/hooks/use-store";
import {
  useRegisters,
  useCreateRegister,
  useDeleteRegister,
} from "@/hooks/use-registers";
import type { Register } from "@shared/schema";

// Names are auto-assigned ("POS #2", "POS #3", …) and not editable by the
// salon owner, on purpose: support needs "POS #2" to mean the same thing on
// every account, so a custom name can never drift from what support sees.
function StationRow({
  name,
  url,
  isDefault,
  onDelete,
  deletePending,
}: {
  name: string;
  url: string;
  isDefault: boolean;
  onDelete?: () => void;
  deletePending?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Tablet className="w-5 h-5 text-teal-500" />
          <h3 className="font-semibold text-slate-700">{name}</h3>
          {isDefault && (
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">
              Original station
            </span>
          )}
        </div>
        {!isDefault && onDelete && (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50"
            onClick={onDelete} disabled={deletePending} title="Remove register">
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <code className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-700 font-mono truncate">
          {url}
        </code>
        <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={handleCopy}>
          {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
          {copied ? "Copied!" : "Copy"}
        </Button>
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => window.open(url, "_blank")} title="Open">
          <ExternalLink className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex flex-col items-center gap-3 pt-2">
        <p className="text-xs text-slate-400 uppercase tracking-widest font-medium">
          Scan to open on this station's tablet
        </p>
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm inline-block">
          <QRCodeCanvas value={url} size={140} level="M" includeMargin={false} />
        </div>
      </div>
    </div>
  );
}

export default function Registers() {
  const { toast } = useToast();
  const inShell = useInSettingsShell();
  const { selectedStore } = useSelectedStore();
  const { data: allRegisters, isLoading } = useRegisters(selectedStore?.id);
  const createRegister = useCreateRegister();
  const deleteRegister = useDeleteRegister();

  const bookingSlug = (selectedStore as any)?.bookingSlug ?? null;
  const registerList = allRegisters ?? [];

  // The server assigns the actual name ("POS #2", "POS #3", …) — this is only
  // a preview for the button label, computed the same way it does. The
  // implicit default/shared register (registerId 0, used before any row
  // exists) is conceptually "POS #1", so the first row created here is #2.
  const usedNumbers = registerList
    .map((r) => {
      const m = r.name.match(/^POS #(\d+)$/);
      return m ? parseInt(m[1], 10) : null;
    })
    .filter((n): n is number => n !== null);
  const nextPosNumber = Math.max(1, ...usedNumbers) + 1;

  const handleAdd = () => {
    createRegister.mutate(undefined, {
      onError: () => toast({ title: "Failed to add register", variant: "destructive" }),
    });
  };

  const handleDelete = (register: Register) => {
    if (!window.confirm(`Remove "${register.name}"? Its paired tablet will need a new URL from this page.`)) return;
    deleteRegister.mutate(register.id, {
      onError: () => toast({ title: "Failed to delete register", variant: "destructive" }),
    });
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl px-4 py-6 md:px-8 space-y-8">
        {!inShell && (
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">POS Stations</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Every checkout station's front-desk tablet URL, in one place. "POS #1" below is your original
              station — it's always there, even before you add any others.
            </p>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 text-slate-400 py-12 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading…
          </div>
        ) : !bookingSlug ? (
          <p className="text-sm text-slate-500">
            Registers require a booking slug — make sure your store has one set in Business Settings.
          </p>
        ) : (
          <div className="space-y-6">
            {registerList.length === 0 && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 text-sm text-slate-600">
                You're running a single checkout station today — no extra setup needed, "POS #1" below is
                already paired with every staff terminal. Add a second station here only if you run more
                than one independent checkout tablet (e.g. two front-desk stations).
              </div>
            )}

            {/* Once this store has a real "POS #1" row (created the first
                time it added a second station), it's rendered from real data
                below like every other station. Until then, POS #1 is shown
                as a synthetic row pointing at the bare /frontdesk/:slug URL
                — nothing to set up, it's just always been there. */}
            {!registerList.some((r) => r.isDefault) && (
              <StationRow
                name="POS #1"
                url={`${window.location.origin}/frontdesk/${bookingSlug}`}
                isDefault
              />
            )}

            {registerList.map((r) => (
              <StationRow
                key={r.id}
                name={r.name}
                // The default/original station keeps the bare URL forever —
                // that's the one already paired with the salon's existing
                // tablet, and the kiosk config route falls back to whichever
                // register is flagged isDefault when no id is in the URL.
                // Only non-default stations get an id-suffixed URL.
                url={r.isDefault
                  ? `${window.location.origin}/frontdesk/${bookingSlug}`
                  : `${window.location.origin}/frontdesk/${bookingSlug}/${r.id}`}
                isDefault={r.isDefault}
                onDelete={() => handleDelete(r)}
                deletePending={deleteRegister.isPending}
              />
            ))}

            <Button
              onClick={handleAdd}
              disabled={createRegister.isPending}
              variant="outline"
              className="w-full h-16 gap-2 rounded-2xl border-dashed border-2 text-base font-semibold text-slate-600 hover:text-slate-900 hover:border-slate-400"
            >
              <Plus className="w-5 h-5" />
              {createRegister.isPending ? "Adding…" : `Add POS #${nextPosNumber}`}
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
