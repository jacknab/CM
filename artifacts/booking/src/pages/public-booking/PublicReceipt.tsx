import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { XCircle, Receipt as ReceiptIcon } from "lucide-react";

interface ReceiptSnapshot {
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  ticketNumber: number | string;
  dateIso: string;
  clientName?: string;
  items: { label: string; price: number }[];
  subtotal: number;
  discount: number;
  tip: number;
  total: number;
  tenders: { method: string; amount: number }[];
}

const money = (n: number) => `$${(Number(n) || 0).toFixed(2)}`;

/**
 * The public, read-only web receipt (certxa.com/receipt/:token) texted from the Nail POS's "Text Receipt" button.
 * The token is the same per-appointment one used for "manage my booking" links (see ManageBooking.tsx) — it's the
 * only credential this page needs, and it never exposes anything the client didn't just pay for themselves.
 */
export default function PublicReceipt() {
  const { token } = useParams();
  const { data, isLoading, error } = useQuery<ReceiptSnapshot>({
    queryKey: ["/api/public/receipt", token],
    queryFn: async () => {
      const res = await fetch(`/api/public/receipt/${token}`);
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50">
        <div className="text-center text-muted-foreground">Loading your receipt…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="pt-8 pb-8 text-center">
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <p className="text-lg font-semibold">Receipt not found</p>
            <p className="text-sm text-muted-foreground mt-1">This link may no longer be valid.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const r = data;
  const date = new Date(r.dateIso);
  const dateStr = Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const timeStr = Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <Card className="w-full max-w-md mx-auto">
        <CardContent className="pt-8 pb-8">
          <div className="text-center mb-6">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <ReceiptIcon className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-xl font-bold">{r.storeName}</h1>
            {r.storeAddress && <p className="text-sm text-muted-foreground mt-1">{r.storeAddress}</p>}
            {r.storePhone && <p className="text-sm text-muted-foreground">{r.storePhone}</p>}
            <p className="text-xs text-muted-foreground mt-3">
              {[dateStr, timeStr].filter(Boolean).join(" · ")}{r.ticketNumber ? ` · Ticket #${r.ticketNumber}` : ""}
            </p>
          </div>

          {r.clientName && <p className="text-sm font-medium mb-3">{r.clientName}</p>}

          <div className="divide-y">
            {r.items.map((it, i) => (
              <div key={i} className="flex justify-between py-2 text-sm">
                <span className={it.label.startsWith("+") ? "text-muted-foreground" : "font-medium"}>{it.label}</span>
                <span className="font-medium tabular-nums">{money(it.price)}</span>
              </div>
            ))}
          </div>

          <div className="border-t mt-2 pt-3 space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span className="tabular-nums">{money(r.subtotal)}</span></div>
            {r.discount > 0 && <div className="flex justify-between text-green-600"><span>Discount</span><span className="tabular-nums">-{money(r.discount)}</span></div>}
            {r.tip > 0 && <div className="flex justify-between text-muted-foreground"><span>Tip</span><span className="tabular-nums">{money(r.tip)}</span></div>}
            <div className="flex justify-between text-base font-bold pt-1.5 border-t"><span>Total</span><span className="tabular-nums">{money(r.total)}</span></div>
          </div>

          {r.tenders.length > 0 && (
            <div className="mt-4 pt-3 border-t space-y-1.5 text-sm">
              {r.tenders.map((t, i) => (
                <div key={i} className="flex justify-between text-muted-foreground">
                  <span className="capitalize">{t.method}</span><span className="tabular-nums">{money(t.amount)}</span>
                </div>
              ))}
            </div>
          )}

          <p className="text-center text-sm text-muted-foreground mt-6">Thank you!</p>
        </CardContent>
      </Card>
    </div>
  );
}
