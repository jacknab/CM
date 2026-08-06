import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link, useSearch } from "wouter";
import {
  useGetWebsite,
  useUpdateWebsite,
  usePublishWebsite,
  useUnpublishWebsite,
  getGetWebsiteQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Globe,
  ArrowLeft,
  Save,
  ScanText,
  RefreshCw,
  ExternalLink,
  Link2,
  CheckCircle2,
  Clock,
  Copy,
  Check,
  MousePointerClick,
  Pencil,
  RotateCcw,
  X,
  ImageIcon,
  Type,
  Undo2,
  Database,
  LayoutGrid,
  Search,
  Plus,
  Monitor,
  Smartphone,
  Upload,
  Trash2,
  Palette,
  FileSearch,
  Sparkles,
  AlertCircle,
  TrendingUp,
  ChevronRight,
  BarChart2,
  Zap,
} from "lucide-react";
import { BLOCK_LIBRARY } from "@/lib/block-library";
import type { Block, BlockCategory } from "@/lib/block-library";
import { SALON_IMAGES, IMAGE_CATEGORIES, detectCategory, type ImageCategory } from "@/lib/image-library";

interface ContentField {
  id: string;
  label: string;
  original: string;
  current: string;
  elementType: string;
}

interface BlockOps {
  order: string[];
  deleted: string[];
}

interface ColorOps {
  primary?: string;
  background?: string;
  text?: string;
}

interface WebsiteContent {
  fields?: ContentField[];
  blockOps?: BlockOps;
  imageOps?: Record<string, string>;
  colorOps?: ColorOps;
}

interface UploadedImage {
  id: number;
  filename: string;
  category: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
}

type EditorMode = "text" | "image" | "layout" | "colors" | "seo";

interface SeoState {
  title: string;
  description: string;
  keywords: string;
  googleVerification: string;
}

interface SeoScanResult {
  score: number;
  grade: string;
  summary: string;
  issues: { severity: "high" | "medium" | "low"; field: string; message: string }[];
  recommendations: { field: string; action: string }[];
  suggestedTitle?: string;
  suggestedDescription?: string;
  suggestedKeywords?: string;
}

interface SelectedImg {
  src: string;
  category: ImageCategory;
  displayWidth: number;
  displayHeight: number;
}

const VPS_IP = "216.128.140.207";

// ── Custom Domain Dialog ───────────────────────────────────────────────────────

interface CustomDomainDialogProps {
  open: boolean;
  onClose: () => void;
  websiteId: number;
  currentDomain: string | null | undefined;
  currentStatus: string | null | undefined;
  onActivated: (domain: string) => void;
  onRemoved?: () => void;
}

type VerifyStatus = { dnsOk: boolean; httpOk: boolean } | null;

function sanitizeDomain(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .split("?")[0];
}

function CustomDomainDialog({
  open, onClose, websiteId, currentDomain, currentStatus, onActivated, onRemoved,
}: CustomDomainDialogProps) {
  const [domain, setDomain] = useState(sanitizeDomain(currentDomain ?? ""));
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [verifyToken, setVerifyToken] = useState<string | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { toast } = useToast();

  const isActive = currentStatus === "active";
  const isPending = currentStatus === "pending_dns" || currentStatus === "pending_payment";
  const bothOk = !!(verifyStatus?.dnsOk && verifyStatus?.httpOk);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setDomain(sanitizeDomain(currentDomain ?? ""));
      setVerifyToken(null);
      setVerifyStatus(null);
      setIsVerifying(false);
      setHasStarted(false);
    } else {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    }
  }, [open, currentDomain]);

  // Auto-start verification if there's already a pending domain saved
  useEffect(() => {
    if (open && isPending && currentDomain && !hasStarted) {
      void startVerification(sanitizeDomain(currentDomain));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isPending, currentDomain]);

  // Kick off polling once verifying is true and token is set
  useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (isVerifying && verifyToken) {
      void doVerify();
      pollRef.current = setInterval(() => { void doVerify(); }, 5000);
    }
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVerifying, verifyToken]);

  // Stop polling once both checks pass
  useEffect(() => {
    if (bothOk && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
      setIsVerifying(false);
    }
  }, [bothOk]);

  async function doVerify() {
    try {
      const res = await fetch(`/api/websites/${websiteId}/custom-domain/verify`);
      if (res.ok) {
        const data = await res.json() as VerifyStatus;
        setVerifyStatus(data);
      }
    } catch { /* network error — keep polling */ }
  }

  async function startVerification(domainOverride?: string) {
    const d = domainOverride ?? domain;
    if (!d || d.length < 3) {
      toast({ variant: "destructive", title: "Enter a valid domain name first" });
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`/api/websites/${websiteId}/custom-domain/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: d }),
      });
      const data = await res.json() as { domain?: string; token?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save domain");
      setDomain(data.domain ?? d);
      setVerifyToken(data.token ?? null);
      setVerifyStatus(null);
      setHasStarted(true);
      setIsVerifying(true);
    } catch (err) {
      toast({ variant: "destructive", title: "Could not start verification", description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setIsLoading(false);
    }
  }

  const handleActivate = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/websites/${websiteId}/custom-domain/activate`, {
        method: "POST",
      });
      const data = await res.json() as { success?: boolean; domain?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to activate domain");
      toast({ title: "Domain activated", description: `${data.domain ?? domain} is now connected.` });
      if (data.domain) onActivated(data.domain);
      onClose();
    } catch (err) {
      toast({ variant: "destructive", title: "Activation failed", description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(VPS_IP);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const [isRemoving, setIsRemoving] = useState(false);
  const handleRemoveDomain = async () => {
    if (!confirm("Remove this custom domain? This will stop serving your site on the custom domain.")) return;
    setIsRemoving(true);
    try {
      const res = await fetch(`/api/websites/${websiteId}/custom-domain`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to remove domain");
      toast({ title: "Domain removed" });
      onRemoved?.();
      onClose();
    } catch (err) {
      toast({ variant: "destructive", title: "Could not remove domain", description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setIsRemoving(false);
    }
  };

  function CheckRow({ ok, label, pending }: { ok: boolean | undefined; label: string; pending: boolean }) {
    if (!pending && ok === undefined) return null;
    return (
      <div className="flex items-center gap-2.5 text-sm">
        {ok ? (
          <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
        ) : pending ? (
          <Loader2 className="w-4 h-4 text-amber-400 shrink-0 animate-spin" />
        ) : (
          <Clock className="w-4 h-4 text-gray-400 shrink-0" />
        )}
        <span className={ok ? "text-green-700 font-medium" : pending ? "text-amber-700" : "text-gray-500"}>{label}</span>
        {ok && <Badge className="ml-auto text-[10px] bg-green-100 text-green-700 border-green-200 px-1.5 py-0">Verified</Badge>}
        {!ok && !pending && <span className="ml-auto text-[10px] text-gray-400">Waiting…</span>}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Link2 className="w-4 h-4 text-[#3B0764]" />
            Bring Your Own Domain
          </DialogTitle>
          <DialogDescription className="text-sm text-gray-500">
            Connect your own domain — included in your subscription.
          </DialogDescription>
        </DialogHeader>

        {/* Active domain banner */}
        {isActive && currentDomain && (
          <div className="rounded-lg px-4 py-3 flex items-center gap-3 text-sm bg-green-50 border border-green-200">
            <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
            <div className="min-w-0">
              <p className="font-medium text-green-800">Domain active</p>
              <p className="text-xs text-green-600 truncate">{currentDomain}</p>
            </div>
            <Badge className="ml-auto bg-green-100 text-green-700 border-green-200 shrink-0">Live</Badge>
          </div>
        )}

        {/* ── Step 1: Enter domain ───────────────────────────────────── */}
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Step 1 — Your Domain</p>
          </div>
          <div className="px-4 py-4 space-y-3">
            <div>
              <Label htmlFor="custom-domain" className="text-xs font-medium text-gray-600 mb-1.5 block">
                Domain name <span className="text-gray-400 font-normal">(e.g. mybarbershop.com)</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  id="custom-domain"
                  placeholder="mybarbershop.com"
                  value={domain}
                  onChange={(e) => {
                    setDomain(sanitizeDomain(e.target.value));
                    // Reset verification if domain changes
                    if (hasStarted) { setHasStarted(false); setIsVerifying(false); setVerifyToken(null); setVerifyStatus(null); }
                  }}
                  className="font-mono text-sm flex-1"
                  disabled={isLoading}
                />
                <Button
                  onClick={() => { void startVerification(); }}
                  disabled={isLoading || !domain || domain.length < 3}
                  variant="outline"
                  className="shrink-0 rounded-lg border-[#3B0764] text-[#3B0764] hover:bg-[#3B0764]/5 text-xs font-semibold h-9 px-3"
                >
                  {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : hasStarted ? "Re-verify" : "Start Verification"}
                </Button>
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5">http://, https://, and www. are stripped automatically.</p>
            </div>
          </div>
        </div>

        {/* ── Step 2: DNS + verification status ─────────────────────── */}
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Step 2 — Point DNS to CertXA</p>
          </div>
          <div className="px-4 py-4 space-y-3">
            <p className="text-xs text-gray-500">Add this A record in your domain registrar's DNS settings:</p>
            <div className="rounded-lg bg-gray-900 text-gray-100 font-mono text-xs p-4">
              <div className="grid grid-cols-[60px_60px_1fr] gap-3 text-gray-400 text-[11px] uppercase tracking-wider mb-2">
                <span>Type</span><span>Name</span><span>Value</span>
              </div>
              <div className="grid grid-cols-[60px_60px_1fr] gap-3 items-center">
                <span className="text-purple-300">A</span>
                <span className="text-amber-300">@</span>
                <div className="flex items-center gap-2">
                  <span className="text-green-300">{VPS_IP}</span>
                  <button onClick={handleCopy} className="ml-auto text-gray-500 hover:text-gray-300" title="Copy IP">
                    {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Verification status — only shown after starting */}
            {hasStarted && (
              <div className="border border-gray-100 rounded-lg px-4 py-3 space-y-2.5 bg-gray-50/60">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Verification Status</p>
                <CheckRow
                  ok={verifyStatus?.dnsOk}
                  pending={isVerifying && !verifyStatus?.dnsOk}
                  label="DNS points to CertXA servers"
                />
                <CheckRow
                  ok={verifyStatus?.httpOk}
                  pending={isVerifying && !!verifyStatus?.dnsOk && !verifyStatus?.httpOk}
                  label="Domain reachable & verified"
                />
                {!bothOk && (
                  <p className="text-[11px] text-gray-400 pt-1">
                    DNS changes can take up to 48 hours to propagate. We'll keep checking automatically.
                  </p>
                )}
                {bothOk && (
                  <p className="text-[11px] text-green-600 font-medium pt-1">
                    All checks passed — you're ready to activate!
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Step 3: Activate ───────────────────────────────────────── */}
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-4 py-2.5 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Step 3 — Activate Domain</p>
          </div>
          <div className="px-4 py-4 space-y-2">
            {!bothOk && !isActive && (
              <p className="text-xs text-gray-400 text-center pb-1">
                Complete DNS verification above to activate your domain.
              </p>
            )}
            <Button
              onClick={handleActivate}
              disabled={isLoading || (!bothOk && !isActive)}
              className="w-full rounded-full bg-[#1A0333] hover:bg-[#2b0554] text-white h-10 text-sm font-medium gap-2 disabled:opacity-40"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {isLoading ? "Activating…" : isActive ? "Domain Active" : "Activate Domain"}
            </Button>
          </div>
        </div>

        {/* Disconnect domain — shown when any domain is saved */}
        {(currentDomain || domain) && currentStatus && (
          <div className="pt-1 border-t border-gray-100 flex justify-end">
            <button
              onClick={() => { void handleRemoveDomain(); }}
              disabled={isRemoving}
              className="text-xs text-red-400 hover:text-red-600 transition-colors font-medium disabled:opacity-50"
            >
              {isRemoving ? "Removing…" : "Disconnect domain"}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Block Picker Modal ──────────────────────────────────────────────────────────

interface BlockPickerModalProps {
  open: boolean;
  onClose: () => void;
  onInsert: (html: string) => void;
  activeCategoryId: string;
  setActiveCategoryId: (id: string) => void;
  search: string;
  setSearch: (s: string) => void;
}

function BlockPickerModal({
  open, onClose, onInsert, activeCategoryId, setActiveCategoryId, search, setSearch,
}: BlockPickerModalProps) {
  if (!open) return null;

  const activeCategory = BLOCK_LIBRARY.find((c) => c.id === activeCategoryId) ?? BLOCK_LIBRARY[0];
  const blocks = search.trim()
    ? BLOCK_LIBRARY.flatMap((c) => c.blocks).filter((b) =>
        b.name.toLowerCase().includes(search.toLowerCase())
      )
    : (activeCategory?.blocks ?? []);

  return (
    <div
      className="fixed inset-0 z-50 flex"
      style={{ background: "rgba(0,0,0,0.55)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="m-auto flex w-full max-w-5xl h-[85vh] bg-white rounded-2xl overflow-hidden shadow-2xl">
        {/* ── Left: Category sidebar ── */}
        <div className="w-52 bg-gray-50 border-r border-gray-200 flex flex-col shrink-0">
          <div className="px-4 py-4 border-b border-gray-200">
            <h2 className="font-bold text-gray-900 text-sm">Add Layout</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">Choose a section to add</p>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {BLOCK_LIBRARY.map((cat) => (
              <button
                key={cat.id}
                onClick={() => { setActiveCategoryId(cat.id); setSearch(""); }}
                className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm font-medium transition-colors text-left ${
                  activeCategoryId === cat.id && !search.trim()
                    ? "bg-[#1B6EF0]/10 text-[#1B6EF0] border-r-2 border-[#1B6EF0]"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                <span className="text-base leading-none">{cat.icon}</span>
                <span>{cat.name}</span>
                <span className="ml-auto text-[10px] text-gray-400 font-normal">{cat.blocks.length}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Right: Block grid ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-200 shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search layouts…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-[#1B6EF0] focus:bg-white transition-colors"
              />
            </div>
            <button
              onClick={onClose}
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Category label */}
          <div className="px-5 py-2.5 border-b border-gray-100 shrink-0 flex items-center gap-2">
            <span className="text-base">{activeCategory?.icon}</span>
            <span className="font-semibold text-gray-700 text-sm">
              {search.trim() ? `Results for "${search}"` : activeCategory?.name}
            </span>
            <span className="text-xs text-gray-400 ml-1">· {blocks.length} layout{blocks.length !== 1 ? "s" : ""}</span>
          </div>

          {/* Block grid */}
          <div className="flex-1 overflow-y-auto p-4">
            {blocks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-2">
                <Search className="w-8 h-8 text-gray-200" />
                <p className="text-sm">No layouts found</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {blocks.map((block) => (
                  <button
                    key={block.id}
                    onClick={() => onInsert(block.html)}
                    className="group text-left rounded-xl border-2 border-gray-200 hover:border-[#1B6EF0] overflow-hidden bg-white transition-all hover:shadow-lg focus:outline-none focus:border-[#1B6EF0]"
                  >
                    {/* Scaled HTML preview */}
                    <div className="relative overflow-hidden bg-gray-50" style={{ height: 130 }}>
                      <div
                        style={{
                          transform: "scale(0.22)",
                          transformOrigin: "top left",
                          width: "454%",
                          pointerEvents: "none",
                          position: "absolute",
                          top: 0,
                          left: 0,
                        }}
                        dangerouslySetInnerHTML={{ __html: block.html }}
                      />
                      {/* Hover overlay with "Add" CTA */}
                      <div className="absolute inset-0 bg-[#1B6EF0]/0 group-hover:bg-[#1B6EF0]/8 transition-colors flex items-center justify-center">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-[#1B6EF0] text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-md">
                          <Plus className="w-3 h-3" />
                          Add
                        </div>
                      </div>
                    </div>
                    {/* Block name */}
                    <div className="px-3 py-2 border-t border-gray-100 bg-white">
                      <p className="text-xs font-semibold text-gray-700 truncate">{block.name}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Editor ────────────────────────────────────────────────────────────────

export default function EditWebsite() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);
  const searchString = useSearch();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const { data: website, isLoading } = useGetWebsite(id, {
    query: { enabled: !!id, queryKey: getGetWebsiteQueryKey(id) },
  });

  const updateWebsite = useUpdateWebsite();
  const publishWebsite = usePublishWebsite();
  const unpublishWebsite = useUnpublishWebsite();

  const [fields, setFields] = useState<ContentField[]>([]);
  const [blockOps, setBlockOps] = useState<BlockOps>({ order: [], deleted: [] });
  const [imageOps, setImageOps] = useState<Record<string, string>>({});
  const [colorOps, setColorOps] = useState<ColorOps>({});
  const [isExtracting, setIsExtracting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [showDomainDialog, setShowDomainDialog] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>("text");
  const [selectedImg, setSelectedImg] = useState<SelectedImg | null>(null);
  const [activeImgCategory, setActiveImgCategory] = useState<ImageCategory>("hero");
  const [imgTab, setImgTab] = useState<"my-photos" | "library">("my-photos");
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadDragOver, setUploadDragOver] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [showBlockPicker, setShowBlockPicker] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState(BLOCK_LIBRARY[0]?.id ?? "");
  const [blockSearch, setBlockSearch] = useState("");
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const initializedForId = useRef<number | null>(null);
  const domainActivatedShown = useRef(false);

  // ── Auto-page settings state ────────────────────────────────────────────────
  const [autoSett, setAutoSett] = useState<Record<string, unknown>>({});
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const autoSettRef = useRef<Record<string, unknown>>({});
  useEffect(() => { autoSettRef.current = autoSett; }, [autoSett]);

  // ── SEO state ──────────────────────────────────────────────────────────────
  const [seo, setSeo] = useState<SeoState>({ title: "", description: "", keywords: "", googleVerification: "" });
  const [seoScanning, setSeoScanning] = useState(false);
  const [seoScanResult, setSeoScanResult] = useState<SeoScanResult | null>(null);
  const [seoSaving, setSeoSaving] = useState(false);
  const seoRef = useRef<SeoState>({ title: "", description: "", keywords: "", googleVerification: "" });
  useEffect(() => { seoRef.current = seo; }, [seo]);

  // ── Refs that always hold the latest state values ──────────────────────────
  // Prevents stale-closure bugs where handleSave captures old state when the
  // user edits text and immediately clicks Save before React re-renders.
  const fieldsRef = useRef<ContentField[]>([]);
  const blockOpsRef = useRef<BlockOps>({ order: [], deleted: [] });
  const imageOpsRef = useRef<Record<string, string>>({});
  const colorOpsRef = useRef<ColorOps>({});
  useEffect(() => { fieldsRef.current = fields; }, [fields]);
  useEffect(() => { blockOpsRef.current = blockOps; }, [blockOps]);
  useEffect(() => { imageOpsRef.current = imageOps; }, [imageOps]);
  useEffect(() => { colorOpsRef.current = colorOps; }, [colorOps]);

  const hasFields = fields.length > 0;

  // Changed fields (current !== original)
  const changedFields = fields.filter((f) => f.current !== f.original);

  // Sync fields + blockOps + imageOps + colorOps + seo + autoSett when website loads
  useEffect(() => {
    if (website && initializedForId.current !== id) {
      initializedForId.current = id;
      const content = website.content as WebsiteContent & { seo?: SeoState } | null;
      setFields(content?.fields ?? []);
      setBlockOps(content?.blockOps ?? { order: [], deleted: [] });
      setImageOps(content?.imageOps ?? {});
      setColorOps(content?.colorOps ?? {});
      setSeo({ title: "", description: "", keywords: "", googleVerification: "", ...(content?.seo ?? {}) });
      const raw = (website as any).autoSettings ?? (website as any).auto_settings ?? {};
      setAutoSett(typeof raw === "object" && raw !== null ? raw : {});
      setIsDirty(false);
    }
  }, [website, id]);

  // Notify iframe when editor mode changes
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage({ type: "certxa-set-mode", mode: editorMode }, "*");
  }, [editorMode]);

  // Re-apply colors to iframe whenever editorReady fires or colorOps changes
  useEffect(() => {
    if (!editorReady) return;
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage({ type: "certxa-apply-colors", ...colorOps }, "*");
  }, [editorReady, colorOps]);

  // Fetch uploaded images whenever the image tab opens
  useEffect(() => {
    if (editorMode !== "image") return;
    fetch("/api/image-library")
      .then((r) => r.json())
      .then((data: UploadedImage[]) => setUploadedImages(data))
      .catch(() => {/* ignore */});
  }, [editorMode]);

  const handleUploadFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!arr.length) return;
    setIsUploading(true);
    try {
      for (const file of arr) {
        const fd = new FormData();
        fd.append("image", file);
        const res = await fetch("/api/image-library/upload?category=other", { method: "POST", body: fd });
        if (res.ok) {
          const item = await res.json() as UploadedImage;
          setUploadedImages((prev) => [item, ...prev]);
        }
      }
    } finally {
      setIsUploading(false);
    }
  }, []);

  const handleImageDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setUploadDragOver(false);
    if (e.dataTransfer.files.length) void handleUploadFiles(e.dataTransfer.files);
  }, [handleUploadFiles]);

  const handleImageFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) void handleUploadFiles(e.target.files);
    e.target.value = "";
  }, [handleUploadFiles]);

  const handleReplaceWithUploaded = useCallback((img: UploadedImage) => {
    if (!selectedImg) return;
    const newSrc = `/api/image-library/images/${img.category}/${img.filename}`;
    const iframe = iframeRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: "certxa-replace-image", originalSrc: selectedImg.src, newSrc }, "*");
    }
  }, [selectedImg]);

  const handleDeleteUploaded = useCallback(async (img: UploadedImage, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this photo?")) return;
    await fetch(`/api/image-library/${img.id}`, { method: "DELETE" });
    setUploadedImages((prev) => prev.filter((i) => i.id !== img.id));
  }, []);

  // Show success toast when returning from Stripe
  useEffect(() => {
    if (!domainActivatedShown.current && searchString.includes("domain_activated=true")) {
      domainActivatedShown.current = true;
      setTimeout(() => {
        toast({ title: "Custom domain activated!", description: "DNS changes may take up to 48 hours." });
        queryClient.invalidateQueries({ queryKey: getGetWebsiteQueryKey(id) });
      }, 500);
    }
  }, [searchString, id, toast, queryClient]);

  // Listen for postMessage from the editor iframe
  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (!e.data || typeof e.data !== "object") return;

      if (e.data.type === "certxa-editor-ready") {
        setEditorReady(true);
      }

      if (e.data.type === "certxa-open-block-picker") {
        setShowBlockPicker(true);
        setBlockSearch("");
        setActiveCategoryId(BLOCK_LIBRARY[0]?.id ?? "");
      }

      // Known field edited (matched against saved fields)
      if (e.data.type === "certxa-field-update") {
        const { fieldId, value } = e.data as { fieldId: string; value: string };
        setFields((prev) =>
          prev.map((f) => (f.id === fieldId ? { ...f, current: value } : f))
        );
        setIsDirty(true);
      }

      // Block operations (move / delete / duplicate)
      if (e.data.type === "certxa-block-ops") {
        const { order, deleted } = e.data as { order: string[]; deleted: string[] };
        setBlockOps({ order: order ?? [], deleted: deleted ?? [] });
        setIsDirty(true);
      }

      // Image clicked in image-editor mode — show replacement picker
      if (e.data.type === "certxa-image-click") {
        const { src, displayWidth, displayHeight, alt, category } = e.data as {
          src: string; displayWidth: number; displayHeight: number; alt: string; category: string;
        };
        const cat = detectCategory(src, alt, displayWidth, displayHeight) as ImageCategory;
        setSelectedImg({ src, category: cat, displayWidth, displayHeight });
        setActiveImgCategory(cat);
      }

      // Image replaced in iframe — persist in imageOps
      if (e.data.type === "certxa-image-replaced") {
        const { originalSrc, newSrc } = e.data as { originalSrc: string; newSrc: string };
        setImageOps((prev) => ({ ...prev, [originalSrc]: newSrc }));
        setSelectedImg((prev) => prev ? { ...prev, src: newSrc } : null);
        setIsDirty(true);
      }

      // New field discovered live in the DOM (auto-wired, not previously scanned)
      if (e.data.type === "certxa-field-new") {
        const { fieldId, original, label, value } = e.data as {
          fieldId: string; original: string; label: string; value: string;
        };
        if (!original || value === original) return; // no change — nothing to save
        setFields((prev) => {
          const exists = prev.find((f) => f.id === fieldId);
          if (exists) return prev.map((f) => f.id === fieldId ? { ...f, current: value } : f);
          return [...prev, { id: fieldId, label: label || fieldId, original, current: value, elementType: "auto" }];
        });
        setIsDirty(true);
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const handleExtract = async () => {
    setIsExtracting(true);
    setEditorReady(false);
    try {
      const res = await fetch(`/api/websites/${id}/extract-content`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Extraction failed");
      }
      const updated = await res.json();
      const content = (updated as { content: WebsiteContent }).content;
      const newFields = content?.fields ?? [];
      setFields(newFields);
      setIsDirty(false);
      // Reset the iframe key so it reloads with the editor script + fresh fields
      setIframeKey((k) => k + 1);
      queryClient.setQueryData(getGetWebsiteQueryKey(id), updated);
      toast({ title: `Found ${newFields.length} editable text fields`, description: "Click any text in the preview to edit it." });
    } catch (err) {
      toast({ variant: "destructive", title: "Scan failed", description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSave = useCallback(() => {
    // Always read from refs so we capture the absolute latest state regardless
    // of whether React has flushed the most recent setFields/setBlockOps/setImageOps.
    // This prevents the blur→save race where the user edits then immediately clicks
    // Save before a re-render commits the new field value to the handleSave closure.
    const content = {
      fields: fieldsRef.current,
      blockOps: blockOpsRef.current,
      imageOps: imageOpsRef.current,
      colorOps: colorOpsRef.current,
      seo: seoRef.current,
    } as Record<string, unknown>;
    updateWebsite.mutate(
      { id, data: { content } },
      {
        onSuccess: (data: unknown) => {
          toast({ title: "Changes saved" });
          setIsDirty(false);
          queryClient.setQueryData(getGetWebsiteQueryKey(id), data);
          // Reload iframe so it picks up the freshly-saved state from the server
          setIframeKey((k) => k + 1);
          setEditorReady(false);
        },
        onError: () => toast({ variant: "destructive", title: "Failed to save changes" }),
      }
    );
  // fieldsRef/blockOpsRef/imageOpsRef/seoRef are refs — no need to list them as deps
  }, [id, updateWebsite, queryClient, toast]);

  const handleSaveSeo = useCallback(async () => {
    setSeoSaving(true);
    const existing = website?.content as Record<string, unknown> | null ?? {};
    const content = { ...existing, seo: seoRef.current };
    updateWebsite.mutate(
      { id, data: { content } },
      {
        onSuccess: (data: unknown) => {
          toast({ title: "SEO settings saved" });
          queryClient.setQueryData(getGetWebsiteQueryKey(id), data);
          setSeoSaving(false);
        },
        onError: () => {
          toast({ variant: "destructive", title: "Failed to save SEO settings" });
          setSeoSaving(false);
        },
      }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, updateWebsite, queryClient, toast, website]);

  const handleSeoScan = useCallback(async () => {
    setSeoScanning(true);
    setSeoScanResult(null);
    try {
      const res = await fetch(`/api/websites/${id}/seo-scan`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Scan failed");
      }
      const result = await res.json() as SeoScanResult;
      setSeoScanResult(result);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "SEO scan failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSeoScanning(false);
    }
  }, [id, toast]);

  const handleTogglePublish = () => {
    if (!website) return;
    const mutation = website.published ? unpublishWebsite : publishWebsite;
    mutation.mutate(
      { id },
      {
        onSuccess: (data: unknown) => {
          toast({ title: website.published ? "Website unpublished" : "Website published" });
          queryClient.setQueryData(getGetWebsiteQueryKey(id), data);
        },
        onError: () => toast({ variant: "destructive", title: "Failed to update status" }),
      }
    );
  };

  const handleResetField = useCallback((fieldId: string) => {
    // Read the original value from the ref so we always have the latest, even if
    // this callback was created before the most recent render.
    const field = fieldsRef.current.find((f) => f.id === fieldId);
    if (!field) return;
    const originalValue = field.original;

    setFields((prev) => prev.map((f) => (f.id === fieldId ? { ...f, current: f.original } : f)));

    // Recompute dirty: are there still any text changes after this reset?
    const remainingTextChanges = fieldsRef.current.filter(
      (f) => f.id !== fieldId && f.current !== f.original
    );
    const stillDirty =
      remainingTextChanges.length > 0 ||
      Object.keys(imageOpsRef.current).length > 0 ||
      blockOpsRef.current.deleted.length > 0;
    setIsDirty(stillDirty);

    // Update the iframe in-place via postMessage instead of doing a full reload.
    // A full reload re-fetches from the server (which still has the old saved value)
    // causing the preview to show the previously-saved text — not the undone original.
    const iframe = iframeRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage(
        { type: "certxa-revert-field", fieldId, value: originalValue },
        "*"
      );
    }
  }, []);

  const handleInsertBlock = useCallback((html: string) => {
    const iframe = iframeRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: "certxa-insert-block", html }, "*");
    }
    setShowBlockPicker(false);
    setIsDirty(true);
  }, []);

  if (isLoading || !website) {
    return (
      <div className="flex h-[calc(100vh-64px)] items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#3B0764] animate-spin" />
      </div>
    );
  }

  const customDomain = (website as unknown as { customDomain?: string | null }).customDomain;
  const customDomainStatus = (website as unknown as { customDomainStatus?: string | null }).customDomainStatus;
  const domainIsActive = customDomainStatus === "active";
  const isAutoMode = (website as any).publisherType === "auto" || (website as any).publisher_type === "auto";

  // Always load in editor mode — the bridge script now wires all DOM text nodes live
  const previewSrc = isAutoMode
    ? `/api/websites/${id}/auto-preview`
    : `/api/websites/${id}/preview?editor=1`;

  return (
    <div className="flex flex-col bg-background">
      {/* ── Header ── */}
      <div className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-5 shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/websites">
            <Button variant="ghost" size="icon" className="text-gray-500 rounded-full hover:bg-gray-100 h-8 w-8">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="w-px h-5 bg-gray-200" />
          <div>
            <h2 className="font-bold text-gray-900 text-sm leading-none">{website.name}</h2>
            <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-0.5">
              <Globe className="w-3 h-3 text-[#C97B2B]" />
              <span>{website.slug}.certxa.com</span>
              {domainIsActive && customDomain && (
                <><span className="text-gray-300">·</span><Link2 className="w-3 h-3 text-green-500" /><span className="text-green-600 font-medium">{customDomain}</span></>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link href={`/websites/${id}/analytics`}>
            <Button
              variant="ghost" size="sm"
              className="rounded-full h-8 px-3 text-xs gap-1.5 text-gray-500 hover:text-gray-700"
            >
              <BarChart2 className="w-3.5 h-3.5" />
              Analytics
            </Button>
          </Link>

          <Button
            variant="ghost" size="sm"
            className={`rounded-full h-8 px-3 text-xs gap-1.5 ${domainIsActive ? "text-green-600 bg-green-50 hover:bg-green-100" : "text-gray-500 hover:text-gray-700"}`}
            onClick={() => setShowDomainDialog(true)}
          >
            <Link2 className="w-3.5 h-3.5" />
            {domainIsActive ? "Domain Active" : "Custom Domain"}
          </Button>

          {!isAutoMode && (
            <Button
              variant="ghost" size="sm"
              className="rounded-full text-gray-500 hover:text-gray-700 h-8 px-3 text-xs gap-1.5"
              onClick={handleExtract}
              disabled={isExtracting}
              title="Re-scan to refresh editable fields"
            >
              {isExtracting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanText className="w-3.5 h-3.5" />}
              {isExtracting ? "Scanning…" : "Re-scan"}
            </Button>
          )}

          <Button
            variant="outline" size="sm"
            className={`rounded-full border-gray-200 h-8 px-3 text-xs ${website.published ? "text-green-600 bg-green-50 hover:bg-green-100 border-green-200" : "text-gray-600 hover:bg-gray-50"}`}
            onClick={handleTogglePublish}
            disabled={publishWebsite.isPending || unpublishWebsite.isPending}
          >
            {website.published ? "Published ✓" : "Draft — Publish"}
          </Button>

          {!isAutoMode && (
            <Button
              size="sm" onClick={handleSave}
              disabled={updateWebsite.isPending || !isDirty}
              className="rounded-full bg-[#1A0333] hover:bg-[#2b0554] text-white h-8 px-4 text-xs gap-1.5 shadow-[0px_4px_16px_0px_rgba(201,123,43,0.20)] disabled:opacity-50"
            >
              {updateWebsite.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {isDirty ? `Save (${changedFields.length + Object.keys(imageOps).length})` : "Save"}
            </Button>
          )}
        </div>
      </div>

      <div className="flex overflow-hidden" style={{ height: 'calc(100vh - 56px)', minHeight: '600px' }}>
        {/* ── Left Panel ── */}
        <div className="w-72 bg-white border-r border-gray-200 flex flex-col shrink-0 overflow-hidden">
          {isAutoMode ? (
            // ── AUTO-MODE PANEL ───────────────────────────────────────────────
            <div className="flex flex-col h-full overflow-hidden">
              {/* Header */}
              <div className="px-4 pt-3 pb-2 border-b border-gray-100 bg-gray-50/60 shrink-0">
                <div className="flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-[#3B0764]" />
                  <span className="font-semibold text-gray-900 text-sm">Site Settings</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  Your site is built automatically from your business data. Adjust style and content here.
                </p>
              </div>

              {/* Settings form */}
              <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-5">

                {/* Brand color */}
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-semibold text-gray-700">Brand Color</p>
                  <div className="flex items-center gap-2">
                    <label className="relative w-9 h-9 rounded-lg border-2 border-gray-200 overflow-hidden cursor-pointer hover:border-[#3B0764] transition-colors shrink-0 shadow-sm">
                      <input
                        type="color"
                        value={(autoSett.brandColor as string | undefined) ?? "#1A0333"}
                        onChange={(e) => setAutoSett((p) => ({ ...p, brandColor: e.target.value }))}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <div className="absolute inset-0" style={{ backgroundColor: (autoSett.brandColor as string | undefined) ?? "#1A0333" }} />
                    </label>
                    <div className="flex-1">
                      <p className="text-[11px] text-gray-600">Buttons, accents & nav</p>
                      <p className="text-[10px] font-mono text-gray-400 uppercase">{(autoSett.brandColor as string | undefined) ?? "#1A0333"}</p>
                    </div>
                  </div>
                </div>

                {/* Tagline */}
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-semibold text-gray-700">Tagline</p>
                  <input
                    type="text"
                    value={(autoSett.tagline as string | undefined) ?? ""}
                    onChange={(e) => setAutoSett((p) => ({ ...p, tagline: e.target.value }))}
                    placeholder="e.g. Where Beauty Meets Precision"
                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-[#3B0764] focus:bg-white transition-colors"
                  />
                  <p className="text-[10px] text-gray-400">Shown under your salon name in the hero section.</p>
                </div>

                {/* Announcement bar */}
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-semibold text-gray-700">Announcement Bar</p>
                  <input
                    type="text"
                    value={(autoSett.announcementBar as string | undefined) ?? ""}
                    onChange={(e) => setAutoSett((p) => ({ ...p, announcementBar: e.target.value }))}
                    placeholder="e.g. Now accepting walk-ins!"
                    className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-[#3B0764] focus:bg-white transition-colors"
                  />
                  <p className="text-[10px] text-gray-400">Leave blank to hide the top announcement bar.</p>
                </div>

                {/* Section toggles */}
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold text-gray-700">Sections</p>
                  {([
                    { key: "showServices", label: "Services & Prices" },
                    { key: "showStaff", label: "Meet the Team" },
                    { key: "showReviews", label: "Reviews" },
                    { key: "showHours", label: "Business Hours" },
                    { key: "showContact", label: "Contact & Location" },
                  ] as const).map(({ key, label }) => {
                    const enabled = (autoSett[key] as boolean | undefined) !== false;
                    return (
                      <label key={key} className="flex items-center justify-between gap-3 cursor-pointer">
                        <span className="text-[12px] text-gray-600">{label}</span>
                        <div
                          onClick={() => setAutoSett((p) => ({ ...p, [key]: !enabled }))}
                          className={`relative w-9 h-5 rounded-full transition-colors ${enabled ? "bg-[#3B0764]" : "bg-gray-200"}`}
                        >
                          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${enabled ? "translate-x-4" : "translate-x-0.5"}`} />
                        </div>
                      </label>
                    );
                  })}
                </div>

                {/* Social links */}
                <div className="flex flex-col gap-2">
                  <div>
                    <p className="text-xs font-semibold text-gray-700">Social Links</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Facebook and Yelp auto-fill from your business profile. Only add overrides here if you want a different URL.</p>
                  </div>
                  {([
                    { field: "instagramUrl" as const, label: "Instagram", placeholder: "https://instagram.com/yoursalon" },
                    { field: "facebookUrl"  as const, label: "Facebook (override)", placeholder: "Auto-filled from profile" },
                    { field: "tiktokUrl"    as const, label: "TikTok",    placeholder: "https://tiktok.com/@yoursalon" },
                    { field: "yelpUrl"      as const, label: "Yelp (override)",      placeholder: "Auto-filled from profile" },
                  ]).map(({ field, label, placeholder }) => (
                    <div key={field} className="flex flex-col gap-0.5">
                      <label className="text-[10px] text-gray-400">{label}</label>
                      <input
                        type="url"
                        value={(autoSett[field] as string | undefined) ?? ""}
                        onChange={(e) => setAutoSett((p) => ({ ...p, [field]: e.target.value }))}
                        placeholder={placeholder}
                        className="w-full px-2.5 py-1.5 text-[11px] border border-gray-200 rounded-md bg-gray-50 focus:outline-none focus:border-[#3B0764] focus:bg-white transition-colors"
                      />
                    </div>
                  ))}
                </div>

                {/* SEO */}
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold text-gray-700">SEO</p>
                  <div className="flex flex-col gap-0.5">
                    <label className="text-[10px] text-gray-400">Google Search Console verification code</label>
                    <input
                      type="text"
                      value={(autoSett.googleVerification as string | undefined) ?? ""}
                      onChange={(e) => setAutoSett((p) => ({ ...p, googleVerification: e.target.value }))}
                      placeholder="Paste your verification code here"
                      className="w-full px-2.5 py-1.5 text-[11px] border border-gray-200 rounded-md bg-gray-50 focus:outline-none focus:border-[#3B0764] focus:bg-white transition-colors font-mono"
                    />
                    <p className="text-[10px] text-gray-400 mt-0.5">From Google Search Console → Verify → HTML tag method. Paste only the <code>content</code> value.</p>
                  </div>
                </div>
              </div>

              {/* Save + Reload */}
              <div className="border-t border-gray-100 p-3 shrink-0 bg-gray-50/60 flex flex-col gap-2">
                <Button
                  onClick={async () => {
                    setIsAutoSaving(true);
                    try {
                      await updateWebsite.mutateAsync({ id, data: { autoSettings: autoSettRef.current } });
                      toast({ title: "Settings saved" });
                      queryClient.invalidateQueries({ queryKey: getGetWebsiteQueryKey(id) });
                      setIframeKey((k) => k + 1);
                    } catch {
                      toast({ variant: "destructive", title: "Save failed" });
                    } finally {
                      setIsAutoSaving(false);
                    }
                  }}
                  disabled={isAutoSaving}
                  className="w-full rounded-full bg-[#1A0333] hover:bg-[#2b0554] text-white h-9 text-xs gap-1.5 shadow-[0px_4px_16px_0px_rgba(201,123,43,0.20)] disabled:opacity-50"
                >
                  {isAutoSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {isAutoSaving ? "Saving…" : "Save & Refresh Preview"}
                </Button>
              </div>
            </div>
          ) : isExtracting ? (
            // Scanning state
            <div className="flex flex-col items-center justify-center h-full gap-5 px-6 text-center">
              <div className="w-14 h-14 rounded-full bg-[#3B0764]/5 flex items-center justify-center">
                <ScanText className="w-7 h-7 text-[#3B0764] animate-pulse" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">Scanning template…</p>
                <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">Reading all text fields. This takes about 10–20 seconds.</p>
              </div>
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-2 h-2 rounded-full bg-[#3B0764]/30 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          ) : !hasFields ? (
            // No fields — show scan CTA
            <div className="flex flex-col items-center justify-center h-full gap-5 px-6 text-center">
              <div className="w-16 h-16 rounded-full bg-[#3B0764]/5 flex items-center justify-center">
                <MousePointerClick className="w-8 h-8 text-[#3B0764]" />
              </div>
              <div>
                <p className="font-bold text-gray-900 text-base">Visual Editor</p>
                <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                  Scan your template to detect every text element — then click directly on the preview to edit it, just like a real website builder.
                </p>
              </div>
              <Button
                onClick={handleExtract}
                className="rounded-full bg-[#1A0333] hover:bg-[#2b0554] text-white text-sm h-10 px-6 gap-2 w-full shadow-[0px_4px_16px_0px_rgba(201,123,43,0.25)]"
              >
                <ScanText className="w-4 h-4" />
                Scan Template Text
              </Button>
              <p className="text-xs text-gray-400">Takes ~10–20 seconds</p>
            </div>
          ) : (
            // Editor mode — compact status + changed fields
            <>
              {/* Panel header */}
              <div className="px-4 pt-3 pb-2 border-b border-gray-100 bg-gray-50/60 shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Pencil className="w-3.5 h-3.5 text-[#3B0764]" />
                    <span className="font-semibold text-gray-900 text-sm">Visual Editor</span>
                  </div>
                  {editorReady ? (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">Active</span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />Loading
                    </span>
                  )}
                </div>
                {/* Mode toggle */}
                <div className="flex rounded-lg overflow-hidden border border-gray-200 bg-white text-xs font-semibold">
                  <button
                    onClick={() => { setEditorMode("text"); setSelectedImg(null); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 transition-colors ${
                      editorMode === "text"
                        ? "bg-[#1B6EF0] text-white"
                        : "text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    <Type className="w-3 h-3" />
                    Text
                  </button>
                  <button
                    onClick={() => setEditorMode("image")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 transition-colors border-l border-gray-200 ${
                      editorMode === "image"
                        ? "bg-[#1B6EF0] text-white"
                        : "text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    <ImageIcon className="w-3 h-3" />
                    Images
                  </button>
                  <button
                    onClick={() => setEditorMode("layout")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 transition-colors border-l border-gray-200 ${
                      editorMode === "layout"
                        ? "bg-[#1B6EF0] text-white"
                        : "text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    <LayoutGrid className="w-3 h-3" />
                    Layout
                  </button>
                  <button
                    onClick={() => setEditorMode("colors")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 transition-colors border-l border-gray-200 ${
                      editorMode === "colors"
                        ? "bg-[#1B6EF0] text-white"
                        : "text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    <Palette className="w-3 h-3" />
                    Colors
                  </button>
                  <button
                    onClick={() => setEditorMode("seo")}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 transition-colors border-l border-gray-200 ${
                      editorMode === "seo"
                        ? "bg-[#1B6EF0] text-white"
                        : "text-gray-500 hover:bg-gray-50"
                    }`}
                  >
                    <FileSearch className="w-3 h-3" />
                    SEO
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 mt-1.5">
                  {editorMode === "text"
                    ? editorReady ? "Click any text in the preview to edit." : "Loading editable fields…"
                    : editorMode === "image"
                    ? "Click any image in the preview to swap it."
                    : editorMode === "layout"
                    ? "Click a section in the preview to move or delete it."
                    : editorMode === "seo"
                    ? "Set your page title, description, and keywords for search engines."
                    : "Pick colors for your brand, background, and text."}
                </p>
              </div>

              {/* ── TEXT MODE: Field summary / changes ── */}
              {editorMode === "text" && (
                <>
                  <div className="flex-1 overflow-y-auto">
                    {changedFields.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full gap-3 px-5 text-center">
                        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                          <MousePointerClick className="w-5 h-5 text-gray-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-600">No changes yet</p>
                          <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                            Click any text in the preview to start editing.
                          </p>
                        </div>
                        <div className="w-full border-t border-gray-100 pt-3">
                          <p className="text-xs text-gray-400">{fields.length} field{fields.length !== 1 ? "s" : ""} detected</p>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 flex flex-col gap-2">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                          {changedFields.length} change{changedFields.length !== 1 ? "s" : ""}
                        </p>
                        {changedFields.map((field) => (
                          <div key={field.id} className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2.5 group">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-wider truncate">{field.label}</p>
                                <p className="text-xs text-gray-600 mt-0.5 line-clamp-2 leading-snug">{field.current}</p>
                              </div>
                              <button
                                onClick={() => handleResetField(field.id)}
                                className="shrink-0 text-gray-400 hover:text-red-500 transition-colors mt-0.5"
                                title="Reset to original"
                              >
                                <RotateCcw className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))}
                        <div className="mt-1 border-t border-gray-100 pt-3">
                          <p className="text-xs text-gray-400 text-center">
                            {fields.length - changedFields.length} of {fields.length} fields unchanged
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-gray-100 p-3 shrink-0 bg-gray-50/60">
                    <Button
                      variant="ghost" size="sm"
                      onClick={handleExtract}
                      disabled={isExtracting}
                      className="w-full text-xs text-gray-500 hover:text-gray-700 h-8 gap-1.5"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Re-scan template
                    </Button>
                  </div>
                </>
              )}

              {/* ── IMAGE MODE: Image picker ── */}
              {editorMode === "image" && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Selected image info */}
                  {selectedImg ? (
                    <div className="px-3 py-2 bg-blue-50 border-b border-blue-100 shrink-0">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-semibold text-[#1B6EF0]">Image selected — choose a replacement below</p>
                        <button onClick={() => setSelectedImg(null)} className="text-blue-300 hover:text-blue-500">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-[10px] text-blue-400 mt-0.5">{selectedImg.displayWidth}×{selectedImg.displayHeight}px</p>
                    </div>
                  ) : (
                    <div className="px-3 py-2 bg-amber-50 border-b border-amber-100 shrink-0">
                      <p className="text-[11px] text-amber-600 text-center">Click any image in the preview to select it</p>
                    </div>
                  )}

                  {/* Tab toggle: My Photos / Library */}
                  <div className="flex border-b border-gray-100 shrink-0">
                    <button
                      onClick={() => setImgTab("my-photos")}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold transition-colors ${
                        imgTab === "my-photos"
                          ? "text-[#3B0764] border-b-2 border-[#3B0764]"
                          : "text-gray-400 hover:text-gray-600"
                      }`}
                    >
                      <Upload className="w-3 h-3" />
                      My Photos
                      {uploadedImages.length > 0 && (
                        <span className="bg-[#3B0764] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                          {uploadedImages.length}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => setImgTab("library")}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold transition-colors ${
                        imgTab === "library"
                          ? "text-[#1B6EF0] border-b-2 border-[#1B6EF0]"
                          : "text-gray-400 hover:text-gray-600"
                      }`}
                    >
                      <ImageIcon className="w-3 h-3" />
                      Stock Library
                    </button>
                  </div>

                  {/* MY PHOTOS TAB */}
                  {imgTab === "my-photos" && (
                    <div className="flex-1 flex flex-col overflow-hidden">
                      {/* Drag-and-drop / click upload zone */}
                      <div className="px-2 pt-2 shrink-0">
                        <div
                          className={`rounded-xl border-2 border-dashed transition-colors cursor-pointer ${
                            uploadDragOver
                              ? "border-[#3B0764] bg-purple-50"
                              : "border-gray-200 hover:border-[#3B0764]/50 hover:bg-gray-50"
                          }`}
                          onDragOver={(e) => { e.preventDefault(); setUploadDragOver(true); }}
                          onDragLeave={() => setUploadDragOver(false)}
                          onDrop={handleImageDrop}
                          onClick={() => uploadInputRef.current?.click()}
                        >
                          <div className="flex items-center justify-center gap-2 py-3">
                            {isUploading ? (
                              <Loader2 className="w-4 h-4 text-[#3B0764] animate-spin" />
                            ) : (
                              <Upload className="w-4 h-4 text-gray-400" />
                            )}
                            <p className="text-[11px] text-gray-500">
                              {isUploading ? "Uploading…" : "Drag photos here, or click to upload"}
                            </p>
                          </div>
                        </div>
                        <input
                          ref={uploadInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={handleImageFileSelect}
                        />
                      </div>

                      {/* Uploaded images grid */}
                      <div className="flex-1 overflow-y-auto p-2 grid grid-cols-2 gap-2 content-start mt-1">
                        {uploadedImages.map((img) => (
                          <button
                            key={img.id}
                            onClick={() => handleReplaceWithUploaded(img)}
                            className={`relative rounded-lg overflow-hidden border-2 transition-all aspect-square group ${
                              selectedImg
                                ? "hover:border-[#1B6EF0] cursor-pointer border-gray-200"
                                : "border-gray-100 cursor-default"
                            }`}
                          >
                            <img
                              src={`/api/image-library/images/${img.category}/${img.filename}`}
                              alt={img.filename}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                            <button
                              onClick={(e) => void handleDeleteUploaded(img, e)}
                              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                              title="Delete photo"
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                            </button>
                          </button>
                        ))}
                        {uploadedImages.length === 0 && !isUploading && (
                          <div className="col-span-2 flex flex-col items-center justify-center h-24 gap-1 text-gray-400">
                            <ImageIcon className="w-6 h-6 text-gray-300" />
                            <p className="text-xs">No photos uploaded yet</p>
                            <p className="text-[10px] text-gray-300">Upload your own salon photos above</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* STOCK LIBRARY TAB */}
                  {imgTab === "library" && (
                    <div className="flex-1 flex flex-col overflow-hidden">
                      {/* Category filter tabs */}
                      <div className="flex overflow-x-auto gap-1 px-2 py-2 border-b border-gray-100 shrink-0 scrollbar-none">
                        {IMAGE_CATEGORIES.map((cat) => (
                          <button
                            key={cat.id}
                            onClick={() => setActiveImgCategory(cat.id)}
                            className={`shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap transition-colors ${
                              activeImgCategory === cat.id
                                ? "bg-[#1B6EF0] text-white"
                                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                            }`}
                          >
                            <span>{cat.icon}</span>
                            <span>{cat.label}</span>
                          </button>
                        ))}
                      </div>

                      {/* Image grid */}
                      <div className="flex-1 overflow-y-auto p-2 grid grid-cols-2 gap-2 content-start">
                        {SALON_IMAGES.filter((img) => img.category === activeImgCategory).map((img) => (
                          <button
                            key={img.id}
                            onClick={() => {
                              if (!selectedImg) return;
                              const iframe = iframeRef.current;
                              if (iframe?.contentWindow) {
                                iframe.contentWindow.postMessage({
                                  type: "certxa-replace-image",
                                  originalSrc: selectedImg.src,
                                  newSrc: img.full,
                                }, "*");
                              }
                            }}
                            title={img.alt}
                            className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                              selectedImg ? "hover:border-[#1B6EF0] cursor-pointer border-gray-200" : "border-transparent opacity-60 cursor-default"
                            }`}
                            style={{ aspectRatio: activeImgCategory === "hero" ? "16/9" : activeImgCategory === "team" ? "4/5" : "1/1" }}
                          >
                            <img
                              src={img.thumb}
                              alt={img.alt}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                            {!selectedImg && (
                              <div className="absolute inset-0 flex items-end p-1.5">
                                <p className="text-[9px] text-white/80 leading-tight bg-black/30 rounded px-1 py-0.5 line-clamp-2">{img.alt}</p>
                              </div>
                            )}
                          </button>
                        ))}
                        {SALON_IMAGES.filter((img) => img.category === activeImgCategory).length === 0 && (
                          <div className="col-span-2 flex items-center justify-center h-32 text-gray-400 text-xs">No images in this category</div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Image ops summary */}
                  {Object.keys(imageOps).length > 0 && (
                    <div className="border-t border-gray-100 px-3 py-2 bg-gray-50/60 shrink-0 flex items-center justify-between">
                      <p className="text-[11px] text-gray-500">
                        <span className="font-semibold text-[#1B6EF0]">{Object.keys(imageOps).length}</span> image{Object.keys(imageOps).length !== 1 ? "s" : ""} swapped
                      </p>
                      <button
                        onClick={() => {
                          setImageOps({});
                          setSelectedImg(null);
                          setIframeKey((k) => k + 1);
                          setEditorReady(false);
                          setIsDirty(true);
                        }}
                        className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Undo2 className="w-3 h-3" />
                        Reset all
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── COLORS MODE: Color customization ── */}
              {editorMode === "colors" && (() => {
                const COLOR_PRESETS = [
                  { name: "Rose Gold",  primary: "#C9956C", background: "#FFF8F5", text: "#2D1B1B" },
                  { name: "Midnight",   primary: "#C9A84C", background: "#0A0A0A", text: "#F0EBE3" },
                  { name: "Forest",     primary: "#059669", background: "#F0FDF4", text: "#1A3D2B" },
                  { name: "Classic",    primary: "#374151", background: "#FFFFFF", text: "#111827" },
                  { name: "Blush",      primary: "#EC4899", background: "#FFF0F7", text: "#4A1942" },
                  { name: "Ocean",      primary: "#2563EB", background: "#F0F7FF", text: "#1E3A5F" },
                ];
                const hasCustomColors = !!(colorOps.primary || colorOps.background || colorOps.text);
                return (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Presets */}
                    <div className="px-3 pt-3 pb-2 shrink-0">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Quick Themes</p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {COLOR_PRESETS.map((preset) => (
                          <button
                            key={preset.name}
                            onClick={() => {
                              setColorOps({ primary: preset.primary, background: preset.background, text: preset.text });
                              setIsDirty(true);
                            }}
                            className="flex flex-col items-center gap-1 p-1.5 rounded-lg border border-gray-100 hover:border-[#1B6EF0] transition-colors group"
                          >
                            <div className="flex gap-0.5">
                              <div className="w-4 h-4 rounded-full border border-white shadow-sm" style={{ backgroundColor: preset.background }} />
                              <div className="w-4 h-4 rounded-full border border-white shadow-sm" style={{ backgroundColor: preset.primary }} />
                              <div className="w-4 h-4 rounded-full border border-white shadow-sm" style={{ backgroundColor: preset.text }} />
                            </div>
                            <span className="text-[10px] text-gray-500 group-hover:text-[#1B6EF0] font-medium">{preset.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="border-t border-gray-100 mx-3" />

                    {/* Individual pickers */}
                    <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-3">
                      {(
                        [
                          { key: "primary" as const, label: "Brand Color", desc: "Buttons, accents, CTAs", default: "#1B6EF0" },
                          { key: "background" as const, label: "Page Background", desc: "Main page background color", default: "#FFFFFF" },
                          { key: "text" as const, label: "Text Color", desc: "Headings and body text", default: "#111827" },
                        ] as const
                      ).map(({ key, label, desc, default: def }) => (
                        <div key={key} className="flex items-center gap-3">
                          <label
                            className="relative w-9 h-9 rounded-lg border-2 border-gray-200 overflow-hidden cursor-pointer hover:border-[#1B6EF0] transition-colors shrink-0 shadow-sm"
                            title={`Pick ${label}`}
                          >
                            <input
                              type="color"
                              value={colorOps[key] ?? def}
                              onChange={(e) => {
                                setColorOps((prev) => ({ ...prev, [key]: e.target.value }));
                                setIsDirty(true);
                              }}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <div
                              className="absolute inset-0"
                              style={{ backgroundColor: colorOps[key] ?? def }}
                            />
                          </label>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-semibold text-gray-700">{label}</p>
                            <p className="text-[10px] text-gray-400">{desc}</p>
                          </div>
                          <span className="text-[10px] font-mono text-gray-400 uppercase">
                            {colorOps[key] ?? def}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Reset */}
                    {hasCustomColors && (
                      <div className="border-t border-gray-100 px-3 py-2 shrink-0 flex items-center justify-between">
                        <p className="text-[11px] text-gray-400">Custom colors applied</p>
                        <button
                          onClick={() => { setColorOps({}); setIsDirty(true); }}
                          className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Reset
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── SEO MODE: Page title, description, keywords + AI scan ── */}
              {editorMode === "seo" && (
                <div className="flex-1 flex flex-col overflow-y-auto">
                  {/* SEO fields */}
                  <div className="px-4 pt-4 pb-3 flex flex-col gap-4">
                    {/* Page Title */}
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold text-gray-700">Page Title</Label>
                        <span className={`text-[10px] font-mono ${seo.title.length > 60 ? "text-red-500" : "text-gray-400"}`}>
                          {seo.title.length}/60
                        </span>
                      </div>
                      <Input
                        value={seo.title}
                        onChange={(e) => setSeo((p) => ({ ...p, title: e.target.value }))}
                        placeholder="My Salon — Best Haircuts in NYC"
                        className="text-xs h-8 rounded-lg"
                        maxLength={80}
                      />
                      <p className="text-[10px] text-gray-400">Shown in browser tabs and Google results. Keep under 60 characters.</p>
                    </div>

                    {/* Meta Description */}
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold text-gray-700">Meta Description</Label>
                        <span className={`text-[10px] font-mono ${seo.description.length > 160 ? "text-red-500" : "text-gray-400"}`}>
                          {seo.description.length}/160
                        </span>
                      </div>
                      <textarea
                        value={seo.description}
                        onChange={(e) => setSeo((p) => ({ ...p, description: e.target.value }))}
                        placeholder="Award-winning salon offering cuts, color & treatments. Book online today!"
                        className="text-xs rounded-lg border border-input bg-background px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-ring leading-relaxed"
                        rows={3}
                        maxLength={200}
                      />
                      <p className="text-[10px] text-gray-400">The snippet Google shows below your title. Aim for 120–160 characters.</p>
                    </div>

                    {/* Keywords */}
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs font-semibold text-gray-700">Keywords</Label>
                      <Input
                        value={seo.keywords}
                        onChange={(e) => setSeo((p) => ({ ...p, keywords: e.target.value }))}
                        placeholder="hair salon, haircut, balayage, NYC salon"
                        className="text-xs h-8 rounded-lg"
                      />
                      <p className="text-[10px] text-gray-400">Comma-separated keywords related to your business.</p>
                    </div>

                    {/* Google Search Console Verification */}
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs font-semibold text-gray-700">Google Search Console</Label>
                      <Input
                        value={seo.googleVerification}
                        onChange={(e) => setSeo((p) => ({ ...p, googleVerification: e.target.value.trim() }))}
                        placeholder="Paste your verification code here"
                        className="text-xs h-8 rounded-lg font-mono"
                      />
                      <p className="text-[10px] text-gray-400 leading-relaxed">
                        From Search Console → Settings → Ownership verification → HTML tag. Paste only the <code className="bg-gray-100 px-0.5 rounded">content="…"</code> value.
                      </p>
                    </div>

                    {/* Google Preview */}
                    {(seo.title || seo.description) && (
                      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Google Preview</p>
                        <p className="text-[13px] text-blue-700 font-medium leading-tight truncate">
                          {seo.title || website.name}
                        </p>
                        <p className="text-[11px] text-green-700 truncate mt-0.5">{website.slug}.certxa.com</p>
                        <p className="text-[11px] text-gray-600 mt-1 leading-snug line-clamp-2">
                          {seo.description || "No description set — add one above."}
                        </p>
                      </div>
                    )}

                    {/* Save button */}
                    <Button
                      onClick={() => void handleSaveSeo()}
                      disabled={seoSaving}
                      className="w-full rounded-full bg-[#1A0333] hover:bg-[#2b0554] text-white h-9 text-xs font-semibold gap-2"
                    >
                      {seoSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      {seoSaving ? "Saving…" : "Save SEO Settings"}
                    </Button>
                  </div>

                  {/* Divider */}
                  <div className="mx-4 border-t border-gray-100" />

                  {/* AI SEO Scan */}
                  <div className="px-4 pt-3 pb-4 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-[#C97B2B]" />
                      <p className="text-xs font-semibold text-gray-700">Agent SEO Scan</p>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-relaxed -mt-1">
                      AI analyzes your page content, title, and description then scores your SEO and suggests improvements.
                    </p>

                    <Button
                      onClick={() => void handleSeoScan()}
                      disabled={seoScanning}
                      variant="outline"
                      className="w-full rounded-full border-[#C97B2B]/40 text-[#C97B2B] hover:bg-[#C97B2B]/5 h-9 text-xs font-semibold gap-2"
                    >
                      {seoScanning ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" />Scanning with AI…</>
                      ) : (
                        <><Sparkles className="w-3.5 h-3.5" />Run AI SEO Scan</>
                      )}
                    </Button>

                    {/* Scan results */}
                    {seoScanResult && (
                      <div className="flex flex-col gap-3">
                        {/* Score badge */}
                        <div className={`rounded-xl px-4 py-3 flex items-center justify-between ${
                          seoScanResult.score >= 80 ? "bg-green-50 border border-green-200"
                          : seoScanResult.score >= 50 ? "bg-amber-50 border border-amber-200"
                          : "bg-red-50 border border-red-200"
                        }`}>
                          <div>
                            <p className={`text-lg font-bold ${
                              seoScanResult.score >= 80 ? "text-green-700"
                              : seoScanResult.score >= 50 ? "text-amber-700"
                              : "text-red-700"
                            }`}>{seoScanResult.score}/100</p>
                            <p className="text-[10px] text-gray-500 mt-0.5">SEO Score</p>
                          </div>
                          <div className={`text-2xl font-black ${
                            seoScanResult.score >= 80 ? "text-green-600"
                            : seoScanResult.score >= 50 ? "text-amber-600"
                            : "text-red-600"
                          }`}>{seoScanResult.grade}</div>
                        </div>

                        {/* Summary */}
                        <p className="text-[11px] text-gray-600 leading-relaxed">{seoScanResult.summary}</p>

                        {/* Issues */}
                        {seoScanResult.issues.length > 0 && (
                          <div className="flex flex-col gap-1.5">
                            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Issues</p>
                            {seoScanResult.issues.map((issue, i) => (
                              <div key={i} className={`rounded-lg px-2.5 py-2 text-[11px] flex items-start gap-2 ${
                                issue.severity === "high" ? "bg-red-50 text-red-700"
                                : issue.severity === "medium" ? "bg-amber-50 text-amber-700"
                                : "bg-blue-50 text-blue-700"
                              }`}>
                                <AlertCircle className="w-3 h-3 mt-0.5 shrink-0" />
                                <span>{issue.message}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Recommendations */}
                        {seoScanResult.recommendations.length > 0 && (
                          <div className="flex flex-col gap-1.5">
                            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Recommendations</p>
                            {seoScanResult.recommendations.map((rec, i) => (
                              <div key={i} className="rounded-lg px-2.5 py-2 text-[11px] bg-purple-50 text-purple-700 flex items-start gap-2">
                                <ChevronRight className="w-3 h-3 mt-0.5 shrink-0" />
                                <span>{rec.action}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Apply suggestions */}
                        {(seoScanResult.suggestedTitle || seoScanResult.suggestedDescription || seoScanResult.suggestedKeywords) && (
                          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 flex flex-col gap-2">
                            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Suggested Updates</p>
                            {seoScanResult.suggestedTitle && (
                              <div>
                                <p className="text-[10px] text-gray-400">Title</p>
                                <p className="text-[11px] font-medium text-gray-700">{seoScanResult.suggestedTitle}</p>
                              </div>
                            )}
                            {seoScanResult.suggestedDescription && (
                              <div>
                                <p className="text-[10px] text-gray-400">Description</p>
                                <p className="text-[11px] text-gray-700">{seoScanResult.suggestedDescription}</p>
                              </div>
                            )}
                            {seoScanResult.suggestedKeywords && (
                              <div>
                                <p className="text-[10px] text-gray-400">Keywords</p>
                                <p className="text-[11px] text-gray-700">{seoScanResult.suggestedKeywords}</p>
                              </div>
                            )}
                            <Button
                              size="sm"
                              onClick={() => {
                                setSeo({
                                  title: seoScanResult.suggestedTitle || seo.title,
                                  description: seoScanResult.suggestedDescription || seo.description,
                                  keywords: seoScanResult.suggestedKeywords || seo.keywords,
                                  googleVerification: seo.googleVerification,
                                });
                              }}
                              className="w-full rounded-full bg-[#3B0764] hover:bg-[#2b0554] text-white text-xs h-8 gap-1.5 mt-1"
                            >
                              <TrendingUp className="w-3 h-3" />
                              Apply AI Suggestions
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── LAYOUT MODE: Block management ── */}
              {editorMode === "layout" && (
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="flex-1 flex flex-col items-center justify-center gap-4 px-5 text-center">
                    <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
                      <LayoutGrid className="w-5 h-5 text-[#1B6EF0]" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">Layout mode active</p>
                      <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                        Click any section in the preview to select it, then use the blue toolbar to move, duplicate, or delete it.
                      </p>
                    </div>
                  </div>
                  <div className="border-t border-gray-100 p-3 shrink-0">
                    <Button
                      className="w-full rounded-xl h-9 text-xs font-semibold gap-2 bg-[#1B6EF0] hover:bg-[#0f55cc] text-white"
                      onClick={() => { setShowBlockPicker(true); setBlockSearch(""); setActiveCategoryId(BLOCK_LIBRARY[0]?.id ?? ""); }}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      Add New Section
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Preview Pane ── */}
        <div className="flex-1 bg-gray-100 flex flex-col overflow-hidden">
          {/* Browser chrome bar */}
          <div className="h-9 bg-gray-200 border-b border-gray-300 flex items-center px-4 gap-3 shrink-0">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
            </div>
            <div className="flex-1 bg-white rounded px-3 py-1 text-xs text-gray-500 font-mono flex items-center gap-1.5 min-w-0">
              <Globe className="w-3 h-3 text-gray-400 shrink-0" />
              <span className="truncate">
                {domainIsActive && customDomain ? customDomain : `${website.slug}.certxa.com`}
              </span>
              {hasFields && (
                <span className="ml-auto shrink-0 text-[10px] font-bold text-[#3B0764] bg-[#3B0764]/10 px-1.5 py-0.5 rounded">
                  EDIT MODE
                </span>
              )}
            </div>
            {/* Device toggle */}
            <div className="flex items-center rounded-md border border-gray-300 overflow-hidden bg-white shrink-0">
              <button
                onClick={() => setPreviewDevice("desktop")}
                title="Desktop view"
                className={`flex items-center justify-center w-7 h-6 transition-colors ${
                  previewDevice === "desktop"
                    ? "bg-[#1B6EF0] text-white"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setPreviewDevice("mobile")}
                title="Mobile view"
                className={`flex items-center justify-center w-7 h-6 border-l border-gray-300 transition-colors ${
                  previewDevice === "mobile"
                    ? "bg-[#1B6EF0] text-white"
                    : "text-gray-500 hover:bg-gray-100"
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
              </button>
            </div>

            <a href={`/api/websites/${id}/preview`} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="icon" className="h-6 w-6 rounded text-gray-500 hover:text-gray-700">
                <ExternalLink className="w-3.5 h-3.5" />
              </Button>
            </a>
            <Button
              variant="ghost" size="icon"
              className="h-6 w-6 rounded text-gray-500 hover:text-gray-700"
              onClick={() => { setIframeKey((k) => k + 1); setEditorReady(false); }}
              title="Refresh preview"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>

          {/* Preview iframe */}
          <div
            className={`flex-1 relative overflow-auto ${
              previewDevice === "mobile" ? "bg-gray-200" : ""
            }`}
          >
            <div
              className={
                previewDevice === "mobile"
                  ? "mx-auto my-4 rounded-[2rem] border-4 border-gray-700 shadow-2xl overflow-hidden bg-white"
                  : "w-full h-full"
              }
              style={
                previewDevice === "mobile"
                  ? { width: 390, minHeight: "calc(100% - 2rem)" }
                  : undefined
              }
            >
            {(website.templateId || isAutoMode) ? (
              <iframe
                key={iframeKey}
                ref={iframeRef}
                src={previewSrc}
                className="w-full h-full border-none"
                style={previewDevice === "mobile" ? { minHeight: "80vh" } : undefined}
                title="Website Preview"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50 gap-3">
                <p className="text-gray-500 text-sm font-medium">No template selected</p>
              </div>
            )}

            {/* "Click to edit" first-use hint overlay — fades away after editor is ready */}
            {hasFields && !editorReady && !isExtracting && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-[#1A0333]/80 backdrop-blur-sm text-white text-sm font-medium px-5 py-3 rounded-full flex items-center gap-2.5 shadow-xl">
                  <Loader2 className="w-4 h-4 animate-spin text-[#C97B2B]" />
                  Activating visual editor…
                </div>
              </div>
            )}
            </div>{/* end device wrapper */}
          </div>{/* end preview area */}
        </div>
      </div>

      <CustomDomainDialog
        open={showDomainDialog}
        onClose={() => setShowDomainDialog(false)}
        websiteId={id}
        currentDomain={customDomain}
        currentStatus={customDomainStatus}
        onActivated={(domain) => {
          queryClient.invalidateQueries({ queryKey: getGetWebsiteQueryKey(id) });
          toast({ title: "Custom domain connected", description: domain });
        }}
        onRemoved={() => {
          queryClient.invalidateQueries({ queryKey: getGetWebsiteQueryKey(id) });
        }}
      />

      <BlockPickerModal
        open={showBlockPicker}
        onClose={() => setShowBlockPicker(false)}
        onInsert={handleInsertBlock}
        activeCategoryId={activeCategoryId}
        setActiveCategoryId={setActiveCategoryId}
        search={blockSearch}
        setSearch={setBlockSearch}
      />
    </div>
  );
}
