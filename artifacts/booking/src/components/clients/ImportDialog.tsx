import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useSelectedStore } from "@/hooks/use-store";
import { Upload, FileText, AlertCircle, CheckCircle2, Loader2, ArrowRight, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "upload" | "mapping" | "options" | "result";

const TARGET_FIELDS = [
  { value: "firstName", label: "First Name" },
  { value: "lastName", label: "Last Name" },
  { value: "fullName", label: "Full Name" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Mobile Phone" },
  { value: "altPhone", label: "Alternate Phone" },
  { value: "tags", label: "Tags" },
  { value: "notes", label: "Notes" },
  { value: "city", label: "City" },
  { value: "state", label: "State" },
  { value: "postalCode", label: "Postal Code" },
  { value: "country", label: "Country" },
  { value: "skip", label: "— Skip this column —" },
];

export function ImportDialog({ open, onOpenChange }: ImportDialogProps) {
  const { selectedStore } = useSelectedStore();
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const [preview, setPreview] = useState<any[]>([]);
  const [detectedFields, setDetectedFields] = useState<string[]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [totalRows, setTotalRows] = useState(0);

  const [duplicateStrategy, setDuplicateStrategy] = useState("skip");
  const [result, setResult] = useState<any>(null);

  function reset() {
    setStep("upload");
    setFile(null);
    setPreview([]);
    setDetectedFields([]);
    setFieldMapping({});
    setTotalRows(0);
    setResult(null);
  }

  function handleClose() {
    reset();
    onOpenChange(false);
  }

  async function handleFileSelected(f: File) {
    setFile(f);
    setIsLoading(true);
    try {
      const form = new FormData();
      form.append("file", f);
      form.append("storeId", String(selectedStore?.id));
      const res = await fetch("/api/clients/import/preview", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Preview failed");
      const data = await res.json();
      setPreview(data.preview);
      setDetectedFields(data.detectedFields);
      setFieldMapping(data.suggestedMapping);
      setTotalRows(data.totalRows);
      setStep("mapping");
    } catch {
      toast({ title: "Failed to read file", description: "Please check the file format and try again.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleImport() {
    if (!file) return;
    setIsLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("storeId", String(selectedStore?.id));
      form.append("fieldMapping", JSON.stringify(fieldMapping));
      form.append("duplicateStrategy", duplicateStrategy);

      const res = await fetch("/api/clients/import/execute", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Import failed");
      const data = await res.json();
      setResult(data);
      setStep("result");
      qc.invalidateQueries({ queryKey: ["/api/clients"] });
    } catch {
      toast({ title: "Import failed", description: "Please try again.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelected(f);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Import Clients
          </DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel file to import your client list.
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {(["upload", "mapping", "options", "result"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-1">
              {i > 0 && <ArrowRight className="w-3 h-3" />}
              <span className={step === s ? "text-primary font-semibold" : ""}>
                {s === "upload" ? "Upload" : s === "mapping" ? "Map Fields" : s === "options" ? "Options" : "Done"}
              </span>
            </div>
          ))}
        </div>

        {/* ── Step 1: Upload ── */}
        {step === "upload" && (
          <div className="space-y-4">
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
              }`}
            >
              <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
              <p className="font-semibold text-sm mb-1">Drop your file here or click to browse</p>
              <p className="text-xs text-muted-foreground">Supports CSV and Excel (.xlsx)</p>
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept=".csv,.xlsx,.xls"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelected(f); }}
              />
            </div>

            <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1.5">
              <p className="font-semibold text-sm">Tips for best results</p>
              <ul className="space-y-1 text-muted-foreground list-disc list-inside">
                <li>Include column headers in the first row</li>
                <li>Use one row per client</li>
                <li>Phone numbers can be in any format — we normalize them</li>
                <li>Email addresses will be automatically lowercased</li>
              </ul>
            </div>

            {isLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Reading file...
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Field Mapping ── */}
        {step === "mapping" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                <strong className="text-foreground">{totalRows.toLocaleString()}</strong> rows found in <strong className="text-foreground">{file?.name}</strong>
              </span>
              <Badge variant="secondary">{detectedFields.length} columns</Badge>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Map your columns to client fields</Label>
              <p className="text-xs text-muted-foreground">We've auto-detected what we can. Review and adjust as needed.</p>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {detectedFields.map((field) => (
                <div key={field} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{field}</p>
                    {preview[0]?.[field] && (
                      <p className="text-xs text-muted-foreground truncate">e.g. {preview[0][field]}</p>
                    )}
                  </div>
                  <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                  <Select
                    value={fieldMapping[field] ?? "skip"}
                    onValueChange={(v) => setFieldMapping((prev) => ({ ...prev, [field]: v }))}
                  >
                    <SelectTrigger className="h-8 w-44 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TARGET_FIELDS.map((t) => (
                        <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {/* Preview */}
            {preview.length > 0 && (
              <div className="rounded-lg border overflow-hidden">
                <div className="bg-muted/50 px-3 py-2 text-xs font-semibold">Preview (first 3 rows)</div>
                <div className="overflow-x-auto">
                  <table className="text-xs w-full">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        {detectedFields.slice(0, 5).map((f) => (
                          <th key={f} className="px-3 py-2 text-left font-medium truncate max-w-24">{f}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.slice(0, 3).map((row, i) => (
                        <tr key={i} className="border-b last:border-0">
                          {detectedFields.slice(0, 5).map((f) => (
                            <td key={f} className="px-3 py-2 truncate max-w-24 text-muted-foreground">{row[f] ?? ""}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-between gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep("upload")}>Back</Button>
              <Button onClick={() => setStep("options")}>
                Continue
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Options ── */}
        {step === "options" && (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Duplicate handling</Label>
              <p className="text-xs text-muted-foreground">We detect duplicates using email and phone number.</p>
              <div className="grid gap-2">
                {[
                  { value: "skip", label: "Skip duplicates", desc: "Leave existing clients unchanged" },
                  { value: "update", label: "Update duplicates", desc: "Update name and info for matched clients" },
                  { value: "create", label: "Create anyway", desc: "Import all rows, even if duplicates exist" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setDuplicateStrategy(opt.value)}
                    className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                      duplicateStrategy === opt.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/30"
                    }`}
                  >
                    <div className={`mt-0.5 w-3.5 h-3.5 rounded-full border-2 shrink-0 ${duplicateStrategy === opt.value ? "border-primary bg-primary" : "border-muted-foreground"}`} />
                    <div>
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
              <p className="font-semibold">Ready to import</p>
              <p className="text-muted-foreground text-xs">
                <strong>{totalRows.toLocaleString()}</strong> rows · <strong>{file?.name}</strong>
              </p>
            </div>

            <div className="flex justify-between gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep("mapping")}>Back</Button>
              <Button onClick={handleImport} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Import {totalRows.toLocaleString()} clients
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 4: Result ── */}
        {step === "result" && result && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-green-50 border border-green-200 text-green-800">
              <CheckCircle2 className="w-6 h-6 shrink-0" />
              <div>
                <p className="font-semibold">Import complete</p>
                <p className="text-sm">{result.imported} clients added successfully.</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Imported", value: result.imported, color: "text-green-600" },
                { label: "Skipped", value: result.skipped, color: "text-muted-foreground" },
                { label: "Duplicates found", value: result.duplicates, color: "text-amber-600" },
                { label: "Errors", value: result.errors, color: "text-red-600" },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border p-3 text-center">
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {result.errorList?.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1">
                <div className="flex items-center gap-2 text-red-700 font-medium text-sm">
                  <AlertCircle className="w-4 h-4" />
                  Row errors
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {result.errorList.slice(0, 10).map((e: any, i: number) => (
                    <p key={i} className="text-xs text-red-600">Row {e.row}: {e.error}</p>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={reset}>Import another file</Button>
              <Button onClick={handleClose}>
                <Users className="w-4 h-4 mr-2" />
                View clients
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
