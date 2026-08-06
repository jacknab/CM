import { useContext, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { StoreContext } from "@/hooks/use-store";
import { Plus, Receipt, Search, Send, CheckCircle2, DollarSign } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const STATUS_COLOR: Record<string, string> = {
  draft: "#64748b", sent: "#3b82f6", paid: "#22c55e", overdue: "#ef4444",
};
const STATUS_LABEL: Record<string, string> = { draft: "Draft", sent: "Sent", paid: "Paid", overdue: "Overdue" };

function NewInvoiceModal({ storeId, onClose, onCreated }: any) {
  const [form, setForm] = useState({ customerName:"", customerPhone:"", customerEmail:"", address:"", notes:"" });
  const [items, setItems] = useState([{ name:"", qty:1, unitPrice:"" }]);
  const set = (k: string, v: string) => setForm(p => ({...p, [k]:v}));

  const subtotal = items.reduce((s,i) => s + Number(i.qty) * Number(i.unitPrice||0), 0);
  const tax = subtotal * 0.085;
  const total = subtotal + tax;

  const create = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/pro-dashboard/invoices?storeId=${storeId}`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ ...form, lineItems: JSON.stringify(items), subtotal: subtotal.toFixed(2), tax: tax.toFixed(2), total: total.toFixed(2), status:"draft" }),
      });
      return r.json();
    },
    onSuccess: () => { onCreated(); onClose(); },
  });

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-[#0A1628] border border-white/15 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-white font-bold">New Invoice</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[["Customer Name *","customerName"],["Phone","customerPhone"],["Email","customerEmail","email"],["Address","address"]].map(([l,n,t="text"]) => (
              <div key={n}>
                <Label className="text-white/50 text-[11px] uppercase tracking-wider mb-1 block">{l}</Label>
                <Input value={(form as any)[n]} onChange={e=>set(n,e.target.value)} type={t}
                  className="bg-white/6 border-white/15 text-white h-9 rounded-xl text-sm" />
              </div>
            ))}
          </div>

          <div>
            <Label className="text-white/50 text-[11px] uppercase tracking-wider mb-2 block">Line Items</Label>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <Input value={item.name} onChange={e=>setItems(p=>p.map((x,j)=>j===i?{...x,name:e.target.value}:x))}
                    placeholder="Service description" className="col-span-6 bg-white/6 border-white/15 text-white h-9 rounded-xl text-sm" />
                  <Input value={String(item.qty)} onChange={e=>setItems(p=>p.map((x,j)=>j===i?{...x,qty:Number(e.target.value)}:x))}
                    type="number" placeholder="Qty" className="col-span-2 bg-white/6 border-white/15 text-white h-9 rounded-xl text-sm" />
                  <Input value={String(item.unitPrice)} onChange={e=>setItems(p=>p.map((x,j)=>j===i?{...x,unitPrice:e.target.value}:x))}
                    placeholder="Price" className="col-span-3 bg-white/6 border-white/15 text-white h-9 rounded-xl text-sm" />
                  <button onClick={()=>setItems(p=>p.filter((_,j)=>j!==i))} className="col-span-1 text-white/30 hover:text-red-400">✕</button>
                </div>
              ))}
              <button onClick={()=>setItems(p=>[...p,{name:"",qty:1,unitPrice:""}])} className="text-[#00D4AA] text-xs hover:underline">+ Add item</button>
            </div>
            <div className="mt-3 bg-white/4 rounded-xl p-3 text-right text-sm space-y-1">
              <p className="text-white/40">Subtotal: <span className="text-white">${subtotal.toFixed(2)}</span></p>
              <p className="text-white/40">Tax (8.5%): <span className="text-white">${tax.toFixed(2)}</span></p>
              <p className="text-white font-bold text-lg">Total: ${total.toFixed(2)}</p>
            </div>
          </div>

          <div>
            <Label className="text-white/50 text-[11px] uppercase tracking-wider mb-1 block">Notes</Label>
            <textarea value={form.notes} onChange={e=>set("notes",e.target.value)} rows={2}
              className="w-full bg-white/6 border border-white/15 text-white rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-[#00D4AA]/50" />
          </div>

          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 border border-white/15 text-white/60 rounded-xl text-sm">Cancel</button>
            <button onClick={()=>create.mutate()} disabled={!form.customerName||create.isPending}
              className="flex-1 py-2 bg-[#00D4AA] text-[#050C18] font-bold rounded-xl text-sm disabled:opacity-40">
              {create.isPending ? "Creating…" : "Create Invoice"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InvoicesPage() {
  const ctx = useContext(StoreContext);
  const storeId = ctx?.selectedStore?.id;
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ["/api/pro-dashboard/invoices", storeId, filter],
    queryFn: async () => {
      const params = new URLSearchParams({ storeId: String(storeId) });
      if (filter !== "all") params.set("status", filter);
      const r = await fetch(`/api/pro-dashboard/invoices?${params}`);
      return r.json();
    },
    enabled: !!storeId,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, paidAt }: any) => {
      await fetch(`/api/pro-dashboard/invoices/${id}?storeId=${storeId}`, {
        method:"PUT", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ status, ...(paidAt ? { paidAt } : {}) }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/pro-dashboard/invoices"] }),
  });

  const filtered = invoices.filter((inv: any) =>
    !search || inv.customerName?.toLowerCase().includes(search.toLowerCase()) || inv.invoiceNumber?.toLowerCase().includes(search.toLowerCase())
  );

  const totalRevenue = invoices.filter((i: any) => i.status === "paid").reduce((s: number, i: any) => s + Number(i.total||0), 0);
  const outstanding = invoices.filter((i: any) => ["sent","overdue"].includes(i.status)).reduce((s: number, i: any) => s + Number(i.total||0), 0);

  return (
    <div className="p-6">
      {showNew && <NewInvoiceModal storeId={storeId} onClose={() => setShowNew(false)} onCreated={() => qc.invalidateQueries({ queryKey: ["/api/pro-dashboard/invoices"] })} />}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-extrabold text-white">Invoices</h1>
          <p className="text-white/40 text-xs mt-0.5">{invoices.length} total</p>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#00D4AA] text-[#050C18] font-bold text-sm">
          <Plus className="w-4 h-4" /> New Invoice
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Total Revenue", value: `$${totalRevenue.toLocaleString("en-US",{minimumFractionDigits:2})}`, icon: DollarSign, color: "text-green-400" },
          { label: "Outstanding", value: `$${outstanding.toLocaleString("en-US",{minimumFractionDigits:2})}`, icon: Receipt, color: "text-yellow-400" },
          { label: "Paid Invoices", value: invoices.filter((i: any)=>i.status==="paid").length, icon: CheckCircle2, color: "text-[#00D4AA]" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-[#0D1F35] border border-white/10 rounded-xl px-4 py-3 flex items-center gap-3">
            <Icon className={`w-5 h-5 ${color}`} />
            <div>
              <p className="text-white font-bold text-lg leading-none">{value}</p>
              <p className="text-white/40 text-xs mt-0.5">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search invoices…"
            className="pl-9 bg-white/5 border-white/15 text-white placeholder:text-white/25 h-9 rounded-xl" />
        </div>
        <div className="flex gap-1.5">
          {[["all","All"],["draft","Draft"],["sent","Sent"],["paid","Paid"],["overdue","Overdue"]].map(([v,l]) => (
            <button key={v} onClick={() => setFilter(v)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${filter===v ? "bg-[#00D4AA]/15 text-[#00D4AA] border-[#00D4AA]/30" : "border-white/10 text-white/50 hover:text-white bg-white/4"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? <div className="text-center py-16 text-white/30">Loading…</div> :
        filtered.length === 0 ? (
          <div className="text-center py-16">
            <Receipt className="w-8 h-8 text-white/20 mx-auto mb-3" />
            <p className="text-white/30 text-sm">No invoices yet</p>
            <button onClick={() => setShowNew(true)} className="text-[#00D4AA] text-sm mt-2 hover:underline">Create your first invoice →</button>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((inv: any) => (
              <div key={inv.id} className="bg-white/4 hover:bg-white/7 border border-white/8 rounded-2xl px-5 py-4 flex items-center gap-4 transition-all">
                <div className="w-2 h-10 rounded-full flex-shrink-0" style={{ background: STATUS_COLOR[inv.status] }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-white font-bold text-sm">{inv.customerName}</span>
                    <span className="text-white/30 text-xs">·</span>
                    <span className="text-white/40 text-xs">{inv.invoiceNumber}</span>
                  </div>
                  <p className="text-white/30 text-xs">{new Date(inv.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-white font-bold">${Number(inv.total??0).toFixed(2)}</p>
                </div>
                <div className="flex-shrink-0">
                  <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: STATUS_COLOR[inv.status] + "33", color: STATUS_COLOR[inv.status], border: `1px solid ${STATUS_COLOR[inv.status]}40` }}>
                    {STATUS_LABEL[inv.status]}
                  </span>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  {inv.status === "draft" && (
                    <button onClick={() => updateStatus.mutate({ id: inv.id, status: "sent" })}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-500/15 text-blue-400 text-xs hover:bg-blue-500/25">
                      <Send className="w-3 h-3" /> Send
                    </button>
                  )}
                  {inv.status === "sent" && (
                    <button onClick={() => updateStatus.mutate({ id: inv.id, status: "paid", paidAt: new Date().toISOString() })}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-green-500/15 text-green-400 text-xs hover:bg-green-500/25">
                      <CheckCircle2 className="w-3 h-3" /> Mark Paid
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      }
    </div>
  );
}
