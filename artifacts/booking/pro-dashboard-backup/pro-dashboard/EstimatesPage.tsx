import { useContext, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { StoreContext } from "@/hooks/use-store";
import { Plus, Search, FileText, ChevronRight, ArrowRight, CheckCircle2, Clock, XCircle, Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const STATUS_COLOR: Record<string, string> = {
  draft: "#64748b", sent: "#3b82f6", approved: "#00D4AA",
  declined: "#ef4444", converted: "#22c55e",
};
const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", sent: "Sent", approved: "Approved", declined: "Declined", converted: "Converted",
};

const SERVICE_TYPES = [
  "HVAC - Installation", "HVAC - Repair", "HVAC - Maintenance",
  "Plumbing - Repair", "Plumbing - Installation",
  "Electrical - Wiring", "Electrical - Repair",
  "Handyman", "Roofing", "Landscaping", "Other",
];

function NewEstimateModal({ storeId, onClose, onCreated }: { storeId: number; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    customerName: "", customerPhone: "", customerEmail: "",
    address: "", city: "", state: "", zip: "",
    serviceType: "", description: "",
    lineItems: JSON.stringify([{ name: "", qty: 1, unitPrice: 0 }]),
  });
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const [items, setItems] = useState([{ name: "", qty: 1, unitPrice: "" }]);
  const subtotal = items.reduce((s, i) => s + (Number(i.qty) * Number(i.unitPrice || 0)), 0);
  const tax = subtotal * 0.085;
  const total = subtotal + tax;

  const create = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/pro-dashboard/estimates?storeId=${storeId}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          lineItems: JSON.stringify(items),
          subtotal: subtotal.toFixed(2),
          tax: tax.toFixed(2),
          total: total.toFixed(2),
        }),
      });
      return r.json();
    },
    onSuccess: () => { onCreated(); onClose(); },
  });

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-[#0A1628] border border-white/15 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-white font-bold">New Estimate</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[["Customer Name *","customerName","text"],["Phone","customerPhone","text"],["Email","customerEmail","email"],["Address","address","text"],["City","city","text"],["State","state","text"]].map(([l,n,t]) => (
              <div key={n} className="space-y-1">
                <Label className="text-white/50 text-[11px] uppercase tracking-wider">{l}</Label>
                <Input value={(form as any)[n]} onChange={e => set(n, e.target.value)} type={t}
                  className="bg-white/6 border-white/15 text-white placeholder:text-white/20 h-9 rounded-xl text-sm" />
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <Label className="text-white/50 text-[11px] uppercase tracking-wider">Service Type</Label>
            <Select value={form.serviceType} onValueChange={v => set("serviceType", v)}>
              <SelectTrigger className="bg-white/6 border-white/15 text-white h-9 rounded-xl"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent className="bg-[#0D1F35] border-white/15 text-white">
                {SERVICE_TYPES.map(s => <SelectItem key={s} value={s} className="text-white focus:bg-white/10">{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Line items */}
          <div>
            <Label className="text-white/50 text-[11px] uppercase tracking-wider mb-2 block">Line Items</Label>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <Input value={item.name} onChange={e => setItems(prev => prev.map((p,j) => j===i ? {...p,name:e.target.value} : p))}
                    placeholder="Description" className="col-span-6 bg-white/6 border-white/15 text-white placeholder:text-white/20 h-9 rounded-xl text-sm" />
                  <Input value={String(item.qty)} onChange={e => setItems(prev => prev.map((p,j) => j===i ? {...p,qty:Number(e.target.value)} : p))}
                    type="number" placeholder="Qty" className="col-span-2 bg-white/6 border-white/15 text-white h-9 rounded-xl text-sm" />
                  <Input value={String(item.unitPrice)} onChange={e => setItems(prev => prev.map((p,j) => j===i ? {...p,unitPrice:e.target.value} : p))}
                    placeholder="Price" className="col-span-3 bg-white/6 border-white/15 text-white placeholder:text-white/20 h-9 rounded-xl text-sm" />
                  <button onClick={() => setItems(prev => prev.filter((_,j) => j!==i))} className="col-span-1 text-white/30 hover:text-red-400">✕</button>
                </div>
              ))}
              <button onClick={() => setItems(prev => [...prev, {name:"",qty:1,unitPrice:""}])}
                className="text-[#00D4AA] text-xs hover:underline">+ Add line item</button>
            </div>
            <div className="mt-3 bg-white/4 rounded-xl p-3 text-right text-sm space-y-1">
              <p className="text-white/40">Subtotal: <span className="text-white">${subtotal.toFixed(2)}</span></p>
              <p className="text-white/40">Tax (8.5%): <span className="text-white">${tax.toFixed(2)}</span></p>
              <p className="text-white font-bold text-base">Total: ${total.toFixed(2)}</p>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="px-4 py-2 border border-white/15 text-white/60 rounded-xl text-sm">Cancel</button>
            <button onClick={() => create.mutate()} disabled={!form.customerName || create.isPending}
              className="flex-1 py-2 bg-[#00D4AA] text-[#050C18] font-bold rounded-xl text-sm disabled:opacity-40">
              {create.isPending ? "Creating…" : "Create Estimate"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EstimatesPage() {
  const ctx = useContext(StoreContext);
  const storeId = ctx?.selectedStore?.id;
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [filter, setFilter] = useState("all");

  const { data: estimates = [], isLoading } = useQuery({
    queryKey: ["/api/pro-dashboard/estimates", storeId, filter],
    queryFn: async () => {
      const params = new URLSearchParams({ storeId: String(storeId) });
      if (filter !== "all") params.set("status", filter);
      const r = await fetch(`/api/pro-dashboard/estimates?${params}`);
      return r.json();
    },
    enabled: !!storeId,
  });

  const convert = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/pro-dashboard/estimates/${id}/convert?storeId=${storeId}`, { method: "POST" });
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/pro-dashboard/estimates"] }),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      await fetch(`/api/pro-dashboard/estimates/${id}?storeId=${storeId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/pro-dashboard/estimates"] }),
  });

  const filtered = estimates.filter((e: any) =>
    !search || e.customerName?.toLowerCase().includes(search.toLowerCase()) || e.estimateNumber?.toLowerCase().includes(search.toLowerCase())
  );

  const statusCounts = ["draft","sent","approved","declined","converted"].reduce((acc, s) => {
    acc[s] = estimates.filter((e: any) => e.status === s).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="p-6">
      {showNew && <NewEstimateModal storeId={storeId!} onClose={() => setShowNew(false)} onCreated={() => qc.invalidateQueries({ queryKey: ["/api/pro-dashboard/estimates"] })} />}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-extrabold text-white">Estimates</h1>
          <p className="text-white/40 text-xs mt-0.5">{estimates.length} total</p>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#00D4AA] text-[#050C18] font-bold text-sm">
          <Plus className="w-4 h-4" /> New Estimate
        </button>
      </div>

      {/* Status tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {[["all","All"],["draft","Drafts"],["sent","Sent"],["approved","Approved"],["declined","Declined"],["converted","Converted"]].map(([v,l]) => (
          <button key={v} onClick={() => setFilter(v)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${filter===v ? "bg-[#00D4AA]/15 text-[#00D4AA] border-[#00D4AA]/30" : "border-white/10 text-white/50 hover:text-white bg-white/4"}`}>
            {l} {v !== "all" && <span className="ml-1 opacity-60">{statusCounts[v] ?? 0}</span>}
          </button>
        ))}
      </div>

      <div className="relative mb-5">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search estimates…"
          className="pl-9 bg-white/5 border-white/15 text-white placeholder:text-white/25 h-9 rounded-xl" />
      </div>

      {isLoading ? <div className="text-white/30 text-center py-16">Loading…</div> :
        filtered.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="w-8 h-8 text-white/20 mx-auto mb-3" />
            <p className="text-white/30 text-sm">No estimates yet</p>
            <button onClick={() => setShowNew(true)} className="text-[#00D4AA] text-sm mt-2 hover:underline">Create your first estimate →</button>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((est: any) => (
              <div key={est.id} className="bg-white/4 hover:bg-white/7 border border-white/8 rounded-2xl px-5 py-4 flex items-center gap-4 transition-all">
                <div className="w-2 h-10 rounded-full flex-shrink-0" style={{ background: STATUS_COLOR[est.status] }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-white font-bold text-sm">{est.customerName}</span>
                    <span className="text-white/30 text-xs">·</span>
                    <span className="text-white/40 text-xs">{est.estimateNumber}</span>
                  </div>
                  <p className="text-white/50 text-sm">{est.serviceType}</p>
                  <p className="text-white/30 text-xs">{new Date(est.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-white font-bold">${Number(est.total ?? 0).toLocaleString()}</p>
                  <p className="text-white/30 text-xs">total</p>
                </div>
                <div className="flex-shrink-0">
                  <span className="text-xs font-bold px-2 py-1 rounded-lg text-white" style={{ background: STATUS_COLOR[est.status] + "33", color: STATUS_COLOR[est.status], border: `1px solid ${STATUS_COLOR[est.status]}40` }}>
                    {STATUS_LABEL[est.status]}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {est.status === "draft" && (
                    <button onClick={() => updateStatus.mutate({ id: est.id, status: "sent" })}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-500/15 text-blue-400 text-xs hover:bg-blue-500/25 transition-all">
                      <Send className="w-3 h-3" /> Send
                    </button>
                  )}
                  {est.status === "sent" && (
                    <button onClick={() => updateStatus.mutate({ id: est.id, status: "approved" })}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-green-500/15 text-green-400 text-xs hover:bg-green-500/25 transition-all">
                      <CheckCircle2 className="w-3 h-3" /> Approve
                    </button>
                  )}
                  {est.status === "approved" && (
                    <button onClick={() => convert.mutate(est.id)}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#00D4AA]/15 text-[#00D4AA] text-xs hover:bg-[#00D4AA]/25 transition-all">
                      <ArrowRight className="w-3 h-3" /> Convert to Job
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
