import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useSelectedStore } from "@/hooks/use-store";
import { Download, FileJson, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { useClientTags } from "@/hooks/use-clients";
import { useToast } from "@/hooks/use-toast";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FORMAT_OPTIONS = [
  { value: "csv", label: "CSV", description: "Works with Excel, Google Sheets, most tools", icon: FileText },
  { value: "xlsx", label: "Excel (.xlsx)", description: "Native Excel format with formatting", icon: FileSpreadsheet },
  { value: "json", label: "JSON", description: "For developers and API integrations", icon: FileJson },
];

export function ExportDialog({ open, onOpenChange }: ExportDialogProps) {
  const { selectedStore } = useSelectedStore();
  const { data: tags = [] } = useClientTags();
  const { toast } = useToast();

  const [format, setFormat] = useState("csv");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterTag, setFilterTag] = useState("all");
  const [filterSmsOptIn, setFilterSmsOptIn] = useState(false);
  const [filterEmailOptIn, setFilterEmailOptIn] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    if (!selectedStore?.id) return;
    setIsExporting(true);

    try {
      const filter: any = {};
      if (filterStatus !== "all") filter.status = filterStatus;
      if (filterTag !== "all") filter.tag = filterTag;
      if (filterSmsOptIn) filter.smsOptIn = true;
      if (filterEmailOptIn) filter.emailOptIn = true;

      const res = await fetch("/api/clients/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: selectedStore.id, format, filter }),
        credentials: "include",
      });

      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ext = format === "xlsx" ? "xlsx" : format === "json" ? "json" : "csv";
      a.download = `clients-${new Date().toISOString().split("T")[0]}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({ title: "Export complete", description: "Your client list has been downloaded." });
      onOpenChange(false);
    } catch {
      toast({ title: "Export failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="w-5 h-5" />
            Export Clients
          </DialogTitle>
          <DialogDescription>
            Download your client data in the format that works best for you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Format selection */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Export format</Label>
            <div className="grid gap-2">
              {FORMAT_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const selected = format === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setFormat(opt.value)}
                    className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
                      selected
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <div>
                      <p className="font-medium text-sm">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.description}</p>
                    </div>
                    {selected && (
                      <div className="ml-auto w-3 h-3 rounded-full bg-primary" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Filters */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold">Filters (optional)</Label>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All clients</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="vip">VIP</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {tags.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Tag</Label>
                  <Select value={filterTag} onValueChange={setFilterTag}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All tags</SelectItem>
                      {tags.map((t) => (
                        <SelectItem key={t.id} value={t.tagName}>{t.tagName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="space-y-2 pt-1">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="sms-opt-in"
                  checked={filterSmsOptIn}
                  onCheckedChange={(v) => setFilterSmsOptIn(!!v)}
                />
                <label htmlFor="sms-opt-in" className="text-sm cursor-pointer">
                  SMS marketing opt-ins only
                </label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="email-opt-in"
                  checked={filterEmailOptIn}
                  onCheckedChange={(v) => setFilterEmailOptIn(!!v)}
                />
                <label htmlFor="email-opt-in" className="text-sm cursor-pointer">
                  Email marketing opt-ins only
                </label>
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">What's included</p>
            <p>Name, email, phone, address, tags, notes, visit history, lifetime spend, and marketing preferences.</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Download
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
