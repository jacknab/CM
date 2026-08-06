import { useContext, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { StoreContext } from "@/hooks/use-store";
import { Plus, Search, User, MapPin, Phone, Mail, Home, Building2, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

function NewCustomerModal({ storeId, onClose, onCreated }: any) {
  const [form, setForm] = useState({ name:"", phone:"", email:"", address:"", city:"", state:"", zip:"", propertyType:"residential", notes:"" });
  const set = (k: string, v: string) => setForm(p => ({...p, [k]:v}));
  const create = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/pro-dashboard/customers?storeId=${storeId}`, {
        method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(form),
      });
      return r.json();
    },
    onSuccess: () => { onCreated(); onClose(); },
  });
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-[#0A1628] border border-white/15 rounded-2xl w-full max-w-md">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-white font-bold">Add Customer</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white">✕</button>
        </div>
        <div className="p-5 space-y-3">
          {[["Full Name *","name","text"],["Phone","phone","tel"],["Email","email","email"],["Address","address","text"],["City","city","text"],["State","state","text"],["Zip","zip","text"]].map(([l,n,t]) => (
            <div key={n}>
              <Label className="text-white/50 text-[11px] uppercase tracking-wider mb-1 block">{l}</Label>
              <Input value={(form as any)[n]} onChange={e=>set(n,e.target.value)} type={t}
                className="bg-white/6 border-white/15 text-white h-9 rounded-xl text-sm" />
            </div>
          ))}
          <div>
            <Label className="text-white/50 text-[11px] uppercase tracking-wider mb-1 block">Property Type</Label>
            <Select value={form.propertyType} onValueChange={v=>set("propertyType",v)}>
              <SelectTrigger className="bg-white/6 border-white/15 text-white h-9 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-[#0D1F35] border-white/15 text-white">
                <SelectItem value="residential" className="text-white focus:bg-white/10">Residential</SelectItem>
                <SelectItem value="commercial" className="text-white focus:bg-white/10">Commercial</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-white/50 text-[11px] uppercase tracking-wider mb-1 block">Notes</Label>
            <textarea value={form.notes} onChange={e=>set("notes",e.target.value)} rows={2}
              className="w-full bg-white/6 border border-white/15 text-white rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-[#00D4AA]/50" />
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2 border border-white/15 text-white/60 rounded-xl text-sm">Cancel</button>
            <button onClick={() => create.mutate()} disabled={!form.name || create.isPending}
              className="flex-1 py-2 bg-[#00D4AA] text-[#050C18] font-bold rounded-xl text-sm disabled:opacity-40">
              {create.isPending ? "Adding…" : "Add Customer"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CustomersPage() {
  const ctx = useContext(StoreContext);
  const storeId = ctx?.selectedStore?.id;
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ["/api/pro-dashboard/customers", storeId, search],
    queryFn: async () => {
      const params = new URLSearchParams({ storeId: String(storeId) });
      if (search) params.set("search", search);
      const r = await fetch(`/api/pro-dashboard/customers?${params}`);
      return r.json();
    },
    enabled: !!storeId,
  });

  const { data: detail } = useQuery({
    queryKey: ["/api/pro-dashboard/customers", selected?.id, storeId],
    queryFn: async () => {
      const r = await fetch(`/api/pro-dashboard/customers/${selected.id}?storeId=${storeId}`);
      return r.json();
    },
    enabled: !!selected?.id && !!storeId,
  });

  return (
    <div className="flex h-full overflow-hidden">
      {showNew && <NewCustomerModal storeId={storeId} onClose={() => setShowNew(false)} onCreated={() => qc.invalidateQueries({ queryKey: ["/api/pro-dashboard/customers"] })} />}

      {/* List */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-6 py-5 border-b border-white/8 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold text-white">Customers</h1>
            <p className="text-white/40 text-xs mt-0.5">{customers.length} contacts</p>
          </div>
          <button onClick={() => setShowNew(true)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#00D4AA] text-[#050C18] font-bold text-sm">
            <Plus className="w-4 h-4" /> Add Customer
          </button>
        </div>

        <div className="px-6 py-3 border-b border-white/8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, email, or phone…"
              className="pl-9 bg-white/5 border-white/15 text-white placeholder:text-white/25 h-9 rounded-xl" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? <div className="text-center py-16 text-white/30 text-sm">Loading…</div> :
            customers.length === 0 ? (
              <div className="text-center py-16">
                <User className="w-8 h-8 text-white/20 mx-auto mb-3" />
                <p className="text-white/30 text-sm">No customers yet</p>
                <button onClick={() => setShowNew(true)} className="text-[#00D4AA] text-sm mt-2 hover:underline">Add your first customer →</button>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {customers.map((c: any) => (
                  <button key={c.id} onClick={() => setSelected(c)} className={`w-full flex items-center gap-4 px-6 py-4 hover:bg-white/4 text-left transition-all ${selected?.id === c.id ? "bg-white/6 border-l-2 border-[#00D4AA]" : ""}`}>
                    <div className="w-10 h-10 rounded-full bg-[#00D4AA]/15 border border-[#00D4AA]/20 flex items-center justify-center text-[#00D4AA] font-bold text-sm flex-shrink-0">
                      {c.name[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-sm">{c.name}</p>
                      {c.phone && <p className="text-white/40 text-xs">{c.phone}</p>}
                      {c.address && <p className="text-white/30 text-xs truncate">{c.address}{c.city ? `, ${c.city}` : ""}</p>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {c.propertyType === "commercial" ? <Building2 className="w-3.5 h-3.5 text-blue-400" /> : <Home className="w-3.5 h-3.5 text-white/30" />}
                      <ChevronRight className="w-4 h-4 text-white/20" />
                    </div>
                  </button>
                ))}
              </div>
            )
          }
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="w-80 bg-[#0A1628] border-l border-white/8 flex flex-col overflow-y-auto">
          <div className="px-5 py-4 border-b border-white/8 flex items-center justify-between">
            <h2 className="text-white font-bold text-sm">Customer Profile</h2>
            <button onClick={() => setSelected(null)} className="text-white/30 hover:text-white text-sm">✕</button>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#00D4AA]/15 border border-[#00D4AA]/20 flex items-center justify-center text-[#00D4AA] font-black text-lg">
                {selected.name[0].toUpperCase()}
              </div>
              <div>
                <p className="text-white font-bold">{selected.name}</p>
                <p className="text-white/40 text-xs capitalize">{selected.propertyType}</p>
              </div>
            </div>
            {selected.phone && <div className="flex items-center gap-2 text-sm"><Phone className="w-4 h-4 text-white/30" /><span className="text-white/60">{selected.phone}</span></div>}
            {selected.email && <div className="flex items-center gap-2 text-sm"><Mail className="w-4 h-4 text-white/30" /><span className="text-white/60">{selected.email}</span></div>}
            {selected.address && <div className="flex items-center gap-2 text-sm"><MapPin className="w-4 h-4 text-white/30" /><span className="text-white/60">{selected.address}{selected.city ? `, ${selected.city}` : ""}</span></div>}
            {selected.notes && <p className="text-white/40 text-xs bg-white/4 rounded-xl p-3">{selected.notes}</p>}

            {/* Jobs */}
            {detail?.jobs?.length > 0 && (
              <div>
                <p className="text-white/40 text-xs font-semibold uppercase tracking-wider mb-2">Recent Jobs</p>
                <div className="space-y-2">
                  {detail.jobs.slice(0,3).map((j: any) => (
                    <div key={j.id} className="bg-white/5 rounded-xl px-3 py-2 text-xs">
                      <p className="text-white font-semibold">{j.orderNumber} · {j.serviceType}</p>
                      <p className="text-white/40">{new Date(j.createdAt).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
