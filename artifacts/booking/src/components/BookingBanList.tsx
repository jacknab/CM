import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

// ── Booking ban list — self-managed CRUD, independent of any settings form ────
// Phone numbers here can't make an online booking. Staff can still book them
// manually and it doesn't affect the check-in kiosk.

type BanEntry = { id: number; phoneE164: string; reason: string | null; createdAt: string };

function formatPhone(e164: string): string {
  const d = e164.replace(/\D/g, "").slice(-10);
  if (d.length !== 10) return e164;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export function BookingBanList() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");

  const { data: entries = [], isLoading } = useQuery<BanEntry[]>({
    queryKey: ["/api/booking-ban-list"],
    queryFn: async () => {
      const res = await fetch("/api/booking-ban-list", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load ban list");
      return res.json();
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/booking-ban-list"] });

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/booking-ban-list", { phone, reason: reason.trim() || undefined });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.message || "Failed to add");
      }
      return res.json();
    },
    onSuccess: () => { setPhone(""); setReason(""); invalidate(); toast({ title: "Added to ban list" }); },
    onError: (e: any) => toast({ title: e?.message || "Failed to add", variant: "destructive" }),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/booking-ban-list/${id}`);
      if (!res.ok && res.status !== 204) throw new Error("Failed to remove");
    },
    onSuccess: () => { invalidate(); toast({ title: "Removed from ban list" }); },
    onError: () => toast({ title: "Failed to remove", variant: "destructive" }),
  });

  const canAdd = phone.replace(/\D/g, "").length === 10 && !addMutation.isPending;

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="(555) 000-0000"
          type="tel"
          inputMode="tel"
          className="sm:w-44"
        />
        <Input
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Reason (optional)"
          className="flex-1"
        />
        <Button
          onClick={() => addMutation.mutate()}
          disabled={!canAdd}
          className="bg-[#1a1f36] hover:bg-[#2d3452] text-white shrink-0"
        >
          <Plus className="h-4 w-4 mr-1.5" />
          {addMutation.isPending ? "Adding…" : "Add"}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No numbers are banned.</p>
      ) : (
        <div className="rounded-lg border divide-y">
          {entries.map(entry => (
            <div key={entry.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">{formatPhone(entry.phoneE164)}</p>
                {entry.reason && <p className="text-xs text-muted-foreground truncate">{entry.reason}</p>}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Remove ${formatPhone(entry.phoneE164)} from the ban list?`)) {
                    removeMutation.mutate(entry.id);
                  }
                }}
                className="text-muted-foreground hover:text-destructive shrink-0"
                aria-label="Remove"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
