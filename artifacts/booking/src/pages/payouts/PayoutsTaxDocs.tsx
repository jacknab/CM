import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSelectedStore } from "@/hooks/use-store";
import { useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import {
  BookOpen, Plus, FileText, CheckCircle2, Search, Download, AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

type Contractor = { id: number; firstName: string; lastName: string; };

type W9Record = {
  id: number; contractorId: number; legalName: string; businessName: string | null;
  taxClassification: string; taxIdLast4: string | null; address: string | null;
  city: string | null; state: string | null; zip: string | null;
  year: number; certifiedAt: string | null; createdAt: string;
};

type W9WithName = W9Record & { contractorName: string };

function W9Dialog({
  open, onClose, storeId, preselectedContractorId,
}: { open: boolean; onClose: () => void; storeId: number; preselectedContractorId?: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();

  const [form, setForm] = useState({
    contractorId: preselectedContractorId ? String(preselectedContractorId) : "",
    legalName: "", businessName: "", taxClassification: "individual",
    taxIdLast4: "", address: "", city: "", state: "", zip: "",
    year: String(currentYear),
  });
  const f = (k: keyof typeof form) => (v: string) => setForm(p => ({ ...p, [k]: v }));

  const { data: contractors = [] } = useQuery<Contractor[]>({
    queryKey: ["/api/contractor-payouts/contractors", storeId],
    queryFn: async () => {
      const res = await fetch(`/api/contractor-payouts/contractors?storeId=${storeId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/contractor-payouts/w9", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          contractorId: parseInt(form.contractorId),
          year: parseInt(form.year),
          taxIdLast4: form.taxIdLast4 || undefined,
          businessName: form.businessName || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/contractor-payouts/w9-all", storeId] });
      toast({ title: "W9 record saved" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "Outfit, sans-serif" }}>Record W9</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
          <div>
            <Label className="text-xs text-gray-500 mb-1">Contractor *</Label>
            <Select value={form.contractorId} onValueChange={f("contractorId")}>
              <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select contractor…" /></SelectTrigger>
              <SelectContent>
                {contractors.map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.firstName} {c.lastName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-500 mb-1">Tax Year *</Label>
              <Select value={form.year} onValueChange={f("year")}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[currentYear, currentYear - 1, currentYear - 2].map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1">Tax Classification *</Label>
              <Select value={form.taxClassification} onValueChange={f("taxClassification")}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">Individual / Sole Prop</SelectItem>
                  <SelectItem value="c_corp">C Corporation</SelectItem>
                  <SelectItem value="s_corp">S Corporation</SelectItem>
                  <SelectItem value="partnership">Partnership</SelectItem>
                  <SelectItem value="llc_single">LLC (single member)</SelectItem>
                  <SelectItem value="llc_multi">LLC (multi member)</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs text-gray-500 mb-1">Legal Name *</Label>
            <Input value={form.legalName} onChange={e => f("legalName")(e.target.value)} className="rounded-xl" />
          </div>
          <div>
            <Label className="text-xs text-gray-500 mb-1">Business Name (if different)</Label>
            <Input value={form.businessName} onChange={e => f("businessName")(e.target.value)} className="rounded-xl" />
          </div>
          <div>
            <Label className="text-xs text-gray-500 mb-1">SSN / EIN (last 4 digits only)</Label>
            <Input maxLength={4} value={form.taxIdLast4} onChange={e => f("taxIdLast4")(e.target.value)} className="rounded-xl" placeholder="e.g. 5678" />
          </div>
          <div>
            <Label className="text-xs text-gray-500 mb-1">Address</Label>
            <Input value={form.address} onChange={e => f("address")(e.target.value)} className="rounded-xl" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <Label className="text-xs text-gray-500 mb-1">City</Label>
              <Input value={form.city} onChange={e => f("city")(e.target.value)} className="rounded-xl" />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1">State</Label>
              <Input maxLength={2} value={form.state} onChange={e => f("state")(e.target.value)} className="rounded-xl" placeholder="TX" />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1">ZIP</Label>
              <Input value={form.zip} onChange={e => f("zip")(e.target.value)} className="rounded-xl" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-xl">Cancel</Button>
          <Button onClick={() => save.mutate()}
            disabled={!form.contractorId || !form.legalName || !form.taxClassification || save.isPending}
            className="rounded-xl bg-teal-600 hover:bg-teal-700 text-white">
            {save.isPending ? "Saving…" : "Save W9 Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PayoutsTaxDocs() {
  const { selectedStore } = useSelectedStore();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [addW9Open, setAddW9Open] = useState(!!searchParams.get("contractorId"));
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()));

  const preselected = searchParams.get("contractorId");

  // Fetch all W9 records by fetching all contractors and then their w9 records via the overview
  const { data: contractors = [] } = useQuery<Contractor[]>({
    queryKey: ["/api/contractor-payouts/contractors", selectedStore?.id],
    queryFn: async () => {
      const res = await fetch(`/api/contractor-payouts/contractors?storeId=${selectedStore!.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  // Fetch all W9 records for all contractors in this store
  const { data: w9Records = [], isLoading } = useQuery<W9WithName[]>({
    queryKey: ["/api/contractor-payouts/w9-all", selectedStore?.id],
    queryFn: async () => {
      const all: W9WithName[] = [];
      for (const c of contractors) {
        const res = await fetch(`/api/contractor-payouts/w9/${c.id}`, { credentials: "include" });
        if (res.ok) {
          const recs: W9Record[] = await res.json();
          recs.forEach(r => all.push({ ...r, contractorName: `${c.firstName} ${c.lastName}` }));
        }
      }
      return all.sort((a, b) => b.year - a.year || a.contractorName.localeCompare(b.contractorName));
    },
    enabled: !!selectedStore?.id && contractors.length > 0,
  });

  const filtered = w9Records.filter(w => {
    const q = search.toLowerCase();
    const matchQ = !q || w.contractorName.toLowerCase().includes(q) || w.legalName.toLowerCase().includes(q);
    const matchY = yearFilter === "all" || String(w.year) === yearFilter;
    return matchQ && matchY;
  });

  const currentYear = new Date().getFullYear();
  const yearsWithW9 = [...new Set(w9Records.map(w => w.year))].sort((a, b) => b - a);
  const contractorsWithW9 = new Set(w9Records.map(w => w.contractorId));
  const contractorsNeedingW9 = contractors.filter(c => !contractorsWithW9.has(c.id));

  return (
    <div className="p-6 max-w-[1000px] mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900" style={{ fontFamily: "Outfit, sans-serif" }}>Tax Documents</h2>
          <p className="text-sm text-gray-500 mt-0.5">W9 records and 1099 preparation for contractor tax compliance</p>
        </div>
        <Button size="sm" onClick={() => setAddW9Open(true)}
          className="rounded-xl gap-2 bg-teal-600 hover:bg-teal-700 text-white">
          <Plus className="w-4 h-4" /> Record W9
        </Button>
      </div>

      {/* Alert: contractors missing W9 */}
      {contractorsNeedingW9.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-800">
              {contractorsNeedingW9.length} contractor{contractorsNeedingW9.length !== 1 ? "s" : ""} missing W9
            </p>
            <p className="text-sm text-amber-600 mt-0.5">
              {contractorsNeedingW9.map(c => `${c.firstName} ${c.lastName}`).join(", ")} — W9 required for 1099 filing.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setAddW9Open(true)} className="rounded-xl shrink-0 border-amber-300 text-amber-700 hover:bg-amber-100">
            Add W9
          </Button>
        </div>
      )}

      {/* Tabs: W9 / 1099 */}
      <Tabs defaultValue="w9">
        <TabsList className="rounded-xl bg-gray-100 p-1">
          <TabsTrigger value="w9" className="rounded-lg text-sm">W9 Records</TabsTrigger>
          <TabsTrigger value="1099" className="rounded-lg text-sm">1099 Prep</TabsTrigger>
        </TabsList>

        <TabsContent value="w9">
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search by contractor or legal name…"
                  className="pl-9 rounded-xl border-gray-200 bg-white" />
              </div>
              <Select value={yearFilter} onValueChange={setYearFilter}>
                <SelectTrigger className="w-32 rounded-xl border-gray-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="all">All Years</SelectItem>
                  {[currentYear, currentYear-1, currentYear-2].map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Card className="rounded-2xl border-gray-100 shadow-sm overflow-hidden">
              {isLoading ? (
                <div className="p-6 space-y-3">
                  {[1,2,3].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
                </div>
              ) : filtered.length === 0 ? (
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
                    <BookOpen className="w-7 h-7 text-blue-400" />
                  </div>
                  <p className="text-sm text-gray-500">No W9 records found</p>
                  <p className="text-xs text-gray-400 mt-1">Record W9 information for each contractor for tax compliance.</p>
                </CardContent>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50/50 text-xs font-medium text-gray-400 uppercase tracking-wide">
                      <th className="text-left px-6 py-3">Contractor</th>
                      <th className="text-left px-6 py-3">Legal Name</th>
                      <th className="text-left px-6 py-3">Classification</th>
                      <th className="text-left px-6 py-3">Tax ID</th>
                      <th className="text-left px-6 py-3">Year</th>
                      <th className="text-left px-6 py-3">Certified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(w => (
                      <tr key={w.id} className="border-t border-gray-50 hover:bg-gray-50/30">
                        <td className="px-6 py-4 font-medium text-gray-800">{w.contractorName}</td>
                        <td className="px-6 py-4 text-gray-600">{w.legalName}</td>
                        <td className="px-6 py-4 text-gray-500 capitalize text-xs">{w.taxClassification.replace(/_/g, " ")}</td>
                        <td className="px-6 py-4 text-gray-500 font-mono text-xs">···{w.taxIdLast4 ?? "N/A"}</td>
                        <td className="px-6 py-4 text-gray-700 font-medium">{w.year}</td>
                        <td className="px-6 py-4">
                          {w.certifiedAt ? (
                            <span className="flex items-center gap-1 text-xs text-emerald-600">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {format(new Date(w.certifiedAt), "MMM d, yyyy")}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="1099">
          <Card className="rounded-2xl border-gray-100 shadow-sm">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
                <FileText className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-800">1099-NEC Preparation</p>
                  <p className="text-sm text-blue-600 mt-0.5">
                    Contractors who earn $600 or more during the tax year require a 1099-NEC.
                    Use the Reports section to generate an earnings summary for each contractor.
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-800 mb-3" style={{ fontFamily: "Outfit, sans-serif" }}>
                  {currentYear} 1099 Eligibility
                </h3>
                {contractors.length === 0 ? (
                  <p className="text-sm text-gray-400">No contractors found.</p>
                ) : (
                  <div className="space-y-2">
                    {contractors.map(c => {
                      const hasW9 = contractorsWithW9.has(c.id);
                      return (
                        <div key={c.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:bg-gray-50">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center text-teal-700 text-xs font-semibold">
                              {c.firstName[0]}{c.lastName[0]}
                            </div>
                            <span className="text-sm font-medium text-gray-800">{c.firstName} {c.lastName}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {hasW9 ? (
                              <span className="flex items-center gap-1 text-xs text-emerald-600">
                                <CheckCircle2 className="w-3.5 h-3.5" /> W9 on file
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-xs text-amber-600">
                                <AlertCircle className="w-3.5 h-3.5" /> W9 needed
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-400">
                  1099-NEC forms must be filed with the IRS and provided to contractors by January 31st of the following year.
                  Certxa provides earnings data to assist with preparation — consult your accountant for official filing.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {selectedStore?.id && (
        <W9Dialog
          open={addW9Open}
          onClose={() => setAddW9Open(false)}
          storeId={selectedStore.id}
          preselectedContractorId={preselected ? parseInt(preselected) : undefined}
        />
      )}
    </div>
  );
}
