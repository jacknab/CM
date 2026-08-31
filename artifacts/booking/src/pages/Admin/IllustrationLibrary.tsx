import { useState, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { confirm, appAlert } from "@/lib/confirm";
import {
  Image, Upload, Plus, Trash2, Edit2, Check, X, Loader2,
  Grid3X3, AlertTriangle, Tag, RefreshCw, ChevronDown, Globe, ImageIcon,
  Layers, Search,
} from "lucide-react";

const INDUSTRIES = [
  { value: "ALL",        label: "All Industries" },
  { value: "NAIL_SALON", label: "Nail Salon" },
  { value: "HAIR_SALON", label: "Hair Salon" },
  { value: "BARBER_SHOP",label: "Barber Shop" },
  { value: "SPA",        label: "Spa" },
];

const INDUSTRY_COLORS: Record<string, string> = {
  NAIL_SALON:  "#e879f9",
  HAIR_SALON:  "#f59e0b",
  BARBER_SHOP: "#3b82f6",
  SPA:         "#10b981",
};

// Pre-defined site image slots (kiosk marketing page screenshots)
const SITE_IMAGE_SLOTS = [
  { key: "kiosk-cat-screen.png",     label: "Kiosk — Category Selection Screen" },
  { key: "kiosk-svc-screen.png",     label: "Kiosk — Service Selection Screen" },
  { key: "kiosk-confirm-screen.png", label: "Kiosk — Check-in Confirmation Screen" },
  { key: "kiosk-screen.png",         label: "Kiosk — Hero Screenshot" },
];

interface IllustrationCategory {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  industry: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
}

// ─── Pre-defined service slot catalog ─────────────────────────────────────────
const SERVICE_SLOT_GROUPS = [
  {
    category: "Manicures",
    color: "#e879f9",
    subcategories: [
      { name: "Classic", services: ["Basic Manicure","Express Manicure","Classic Manicure","Deluxe Manicure","Luxury Manicure","Signature Manicure","Spa Manicure","European Manicure","Dry Manicure","Russian Manicure","Japanese Manicure","Men's Manicure","Kids Manicure","Teen Manicure","Senior Manicure","Bridal Manicure"] },
      { name: "Gel Polish", services: ["Gel Manicure","Gel Polish Change","Gel Polish Hands","Gel Overlay","Gel Strengthening","Hard Gel Overlay","Soft Gel Overlay","Builder Gel (BIAB)","Structured Gel Manicure","Rubber Base Gel"] },
      { name: "Natural Nail Treatments", services: ["Nail Strengthening Treatment","Nail Repair Treatment","Nail Recovery Treatment","IBX Treatment","Cuticle Treatment","Nail Buff & Shine"] },
    ],
  },
  {
    category: "Pedicures",
    color: "#f59e0b",
    subcategories: [
      { name: "Basic", services: ["Express Pedicure","Basic Pedicure","Classic Pedicure","Deluxe Pedicure","Luxury Pedicure","Signature Pedicure","Spa Pedicure","Men's Pedicure","Kids Pedicure","Senior Pedicure"] },
      { name: "Specialty", services: ["Jelly Pedicure","Volcano Pedicure","CBD Pedicure","Hot Stone Pedicure","Paraffin Pedicure","Milk & Honey Pedicure","Lavender Pedicure","Green Tea Pedicure","Charcoal Pedicure","Detox Pedicure","Collagen Pedicure","Herbal Pedicure","Rose Pedicure","Citrus Pedicure","Peppermint Pedicure","Eucalyptus Pedicure","Organic Pedicure","Seasonal Pedicure","Luxury Spa Pedicure"] },
      { name: "Medical / Foot Care", services: ["Callus Removal","Heel Treatment","Cracked Heel Repair","Ingrown Toenail Care","Foot Mask","Foot Scrub","Foot Massage","Reflexology Add-on"] },
    ],
  },
  {
    category: "Acrylic Nails",
    color: "#f97316",
    subcategories: [
      { name: "Full Sets", services: ["Acrylic Full Set","Acrylic Pink & White","Acrylic Ombre","Acrylic Glitter","Acrylic Colored Powder","Acrylic Overlay","Acrylic Toes"] },
      { name: "Maintenance", services: ["Acrylic Fill","Pink Fill","Back Fill","Rebalance","Acrylic Repair","Acrylic Removal"] },
    ],
  },
  {
    category: "Gel Extensions",
    color: "#3b82f6",
    subcategories: [
      { name: "", services: ["Gel-X Full Set","Gel-X Fill","Gel-X Removal","Hard Gel Extensions","Builder Gel Extensions","Sculpted Gel Extensions","Gel Overlay","Hard Gel Fill","Hard Gel Removal"] },
    ],
  },
  {
    category: "Dip Powder",
    color: "#8b5cf6",
    subcategories: [
      { name: "", services: ["Dip Full Set","Dip Overlay","Dip with Tips","Dip Ombre","Dip French","Dip Removal","Dip Repair"] },
    ],
  },
  {
    category: "PolyGel",
    color: "#ec4899",
    subcategories: [
      { name: "", services: ["PolyGel Full Set","PolyGel Overlay","PolyGel Fill","PolyGel Removal"] },
    ],
  },
  {
    category: "Builder Gel",
    color: "#06b6d4",
    subcategories: [
      { name: "BIAB", services: ["BIAB Overlay","BIAB Extensions","BIAB Fill","BIAB Removal"] },
    ],
  },
  {
    category: "Nail Extensions",
    color: "#10b981",
    subcategories: [
      { name: "", services: ["Nail Tips","Sculpted Nails","Forms Extensions","Short Extensions","Medium Extensions","Long Extensions","XL Extensions","XXL Extensions"] },
    ],
  },
  {
    category: "Toe Nail Services",
    color: "#84cc16",
    subcategories: [
      { name: "", services: ["Acrylic Toes","Gel Toes","Big Toe Repair","Big Toe Acrylic","Toe Reconstruction","Toe Polish","Toe Gel Polish"] },
    ],
  },
  {
    category: "Polish Services",
    color: "#f43f5e",
    subcategories: [
      { name: "", services: ["Regular Polish Change","Gel Polish Change","French Polish","American Polish","Buff Shine","Matte Finish","Gloss Finish"] },
    ],
  },
  {
    category: "French Variations",
    color: "#a78bfa",
    subcategories: [
      { name: "", services: ["Classic French","Reverse French","Deep French","V French","Double French","Colored French","Glitter French","Ombre French","Chrome French"] },
    ],
  },
  {
    category: "Nail Shapes",
    color: "#fb923c",
    subcategories: [
      { name: "", services: ["Square","Squoval","Round","Oval","Almond","Coffin","Ballerina","Stiletto","Lipstick","Edge","Mountain Peak"] },
    ],
  },
  {
    category: "Nail Art",
    color: "#e11d48",
    subcategories: [
      { name: "Basic", services: ["Accent Nail","Two Accent Nails","Full Nail Art","Custom Nail Art","Hand Painted Art","Character Art","Cartoon Art","Portrait Art"] },
      { name: "Effects", services: ["Chrome","Mermaid Chrome","Unicorn Chrome","Holographic","Aurora","Mirror Chrome","Cat Eye","Velvet Cat Eye","Magnetic Gel","Pearl Finish","Glazed Donut","Mermaid Powder","Holographic Powder"] },
      { name: "Designs", services: ["Ombre","Baby Boomer","Marble","Blooming Gel","Aura Nails","Airbrush","Watercolor","Tortoise Shell","Animal Print","Cow Print","Leopard Print","Snake Print","Plaid","Sweater Nails","Abstract Design","Minimalist Design","Floral Design","Seasonal Design","Holiday Design"] },
      { name: "Embellishments", services: ["Rhinestones","Swarovski Crystals","Gems","Pearls","Charms","Chains","Studs","Foil","Gold Leaf","Silver Leaf","Stickers","Decals","Encapsulated Glitter","Dried Flowers","Sugar Effect","Velvet Powder","3D Gel Art","3D Acrylic Flowers"] },
    ],
  },
  {
    category: "Repairs",
    color: "#ef4444",
    subcategories: [
      { name: "", services: ["Single Nail Repair","Multiple Nail Repair","Tip Replacement","Crack Repair","Split Nail Repair","Broken Nail Repair"] },
    ],
  },
  {
    category: "Removal Services",
    color: "#6b7280",
    subcategories: [
      { name: "", services: ["Acrylic Removal","Gel Removal","Dip Removal","PolyGel Removal","Hard Gel Removal","Gel-X Removal","BIAB Removal","Polish Removal","Foreign Product Removal"] },
    ],
  },
  {
    category: "Add-ons",
    color: "#14b8a6",
    subcategories: [
      { name: "", services: ["Cuticle Trim","Cuticle Oil Treatment","Nail Buffing","Nail Shaping","Nail Shortening","Length Upgrade","Long Nails","XL Length","XXL Length","Soak Off","Paraffin Wax","Hot Towels","Extra Massage","Collagen Gloves","Collagen Socks","Sugar Scrub","Salt Scrub","Hydrating Mask","Cooling Gel","CBD Add-on","Hot Stone Massage","Callus Treatment","Nail Strengthener","Nail Repair","Matte Top Coat","Gel Top Coat","Quick Dry Drops","Nail Whitening"] },
    ],
  },
  {
    category: "Kids",
    color: "#22c55e",
    subcategories: [
      { name: "", services: ["Kids Manicure","Kids Pedicure","Kids Polish","Kids Nail Art"] },
    ],
  },
  {
    category: "Men's",
    color: "#0ea5e9",
    subcategories: [
      { name: "", services: ["Men's Manicure","Men's Pedicure","Men's Nail Cleanup","Men's Buff & Shine"] },
    ],
  },
  {
    category: "Package Services",
    color: "#d946ef",
    subcategories: [
      { name: "", services: ["Manicure & Pedicure","Gel Manicure & Pedicure","Deluxe Mani/Pedi","Luxury Mani/Pedi","Spa Package","Bride Package","Bridal Party Package","Mother & Daughter Package","Couples Package"] },
    ],
  },
  {
    category: "Specialty Services",
    color: "#f59e0b",
    subcategories: [
      { name: "", services: ["Russian Gel Manicure","E-File Manicure","Japanese Gel","Kokoist Gel","Luminary Nail System","Aprés Gel-X","Bio Sculpture Gel","Medical Pedicure","IBX Repair System","Dry Pedicure","Structured Gel Overlay","Builder Base Overlay","Nail Consultation","Nail Removal + New Set","Nail Design Consultation","Press-On Nail Application","Press-On Nail Removal","Press-On Custom Sizing","Press-On Custom Design"] },
    ],
  },
  {
    category: "Waxing",
    color: "#c026d3",
    subcategories: [
      {
        name: "Facial Waxing",
        services: [
          "Eyebrow Wax",
          "Lip Wax",
          "Chin Wax",
          "Sideburns Wax",
          "Full Face Wax",
        ],
      },
      {
        name: "Body Waxing",
        services: [
          "Stomach Area Wax",
          "Half Arm Wax",
          "Full Arm Wax",
          "Underarm Wax",
          "Half Leg Wax",
          "Full Leg Wax",
          "Bikini Wax",
          "Brazilian Wax",
          "Chest Wax",
          "Back Wax",
        ],
      },
      {
        name: "Threading",
        services: ["Eyebrow Threading"],
      },
    ],
  },
];

type ServiceSlotGroup = {
  category: string;
  color: string;
  subcategories: { name: string; services: string[] }[];
};

interface ServiceImage {
  id: number;
  name: string;
  slug: string;
  category: string;
  subcategory: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  r2Key: string | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface SiteAsset {
  key: string;
  label: string;
  r2_url: string;
  updated_at: string;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(path, { credentials: "include", ...opts });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ─── Tab: Illustration Categories ─────────────────────────────────────────────
function IllustrationCategoriesTab() {
  const qc = useQueryClient();
  const [industryFilter, setIndustryFilter] = useState("ALL");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editForm, setEditForm] = useState<Partial<IllustrationCategory>>({});
  const [createForm, setCreateForm] = useState({ name: "", slug: "", description: "", industry: "NAIL_SALON" });
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const { data, isLoading, isError } = useQuery<{ categories: IllustrationCategory[] }>({
    queryKey: ["illustration-categories", industryFilter],
    queryFn: () => apiFetch(
      `/api/illustration-categories${industryFilter !== "ALL" ? `?industry=${industryFilter}` : ""}`
    ),
  });

  const { data: usageData } = useQuery<{ usage: Record<number, number> }>({
    queryKey: ["illustration-usage"],
    queryFn: () => apiFetch("/api/illustration-categories/usage"),
  });

  const categories = data?.categories ?? [];
  const usage = usageData?.usage ?? {};

  const createMutation = useMutation({
    mutationFn: (body: object) => apiFetch("/api/illustration-categories", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["illustration-categories"] });
      setShowCreate(false);
      setCreateForm({ name: "", slug: "", description: "", industry: "NAIL_SALON" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Record<string, unknown>) =>
      apiFetch(`/api/illustration-categories/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["illustration-categories"] }); setEditingId(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/illustration-categories/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["illustration-categories"] }),
  });

  const handleUpload = async (id: number, file: File) => {
    setUploadingId(id);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch(`/api/illustration-categories/${id}/upload`, {
        method: "POST", credentials: "include", body: fd,
      });
      if (!res.ok) throw new Error("Upload failed");
      qc.invalidateQueries({ queryKey: ["illustration-categories"] });
    } catch {
      void appAlert("Upload failed. Please try again.", "Error");
    } finally {
      setUploadingId(null);
    }
  };

  const startEdit = (cat: IllustrationCategory) => {
    setEditingId(cat.id);
    setEditForm({ name: cat.name, slug: cat.slug, description: cat.description ?? "", industry: cat.industry, isActive: cat.isActive, sortOrder: cat.sortOrder });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Grid3X3 className="w-5 h-5 text-purple-600" />
            Illustration Categories
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Manage illustration categories automatically assigned to services on kiosk screens.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> New Category
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        {INDUSTRIES.slice(1).map(ind => {
          const count = categories.filter(c => c.industry === ind.value).length;
          return (
            <div key={ind.value} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: INDUSTRY_COLORS[ind.value] }} />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{ind.label}</span>
              </div>
              <p className="text-3xl font-bold text-gray-900">{count}</p>
              <p className="text-xs text-gray-400 mt-0.5">categories</p>
            </div>
          );
        })}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {INDUSTRIES.map(ind => (
          <button
            key={ind.value}
            onClick={() => setIndustryFilter(ind.value)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
              industryFilter === ind.value
                ? "bg-purple-600 text-white border-purple-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-purple-300"
            }`}
          >
            {ind.label}
            {ind.value !== "ALL" && (
              <span className="ml-1.5 text-xs opacity-70">
                ({categories.filter(c => c.industry === ind.value).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-purple-50 border-2 border-purple-200 rounded-2xl p-6 space-y-4">
          <h3 className="font-bold text-purple-900">New Illustration Category</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Name *</label>
              <input
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                value={createForm.name}
                onChange={e => setCreateForm(f => ({ ...f, name: e.target.value, slug: slugify(e.target.value) }))}
                placeholder="e.g. Acrylic Full Set"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Slug *</label>
              <input
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-400"
                value={createForm.slug}
                onChange={e => setCreateForm(f => ({ ...f, slug: e.target.value }))}
                placeholder="acrylic-full-set"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Industry *</label>
              <select
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                value={createForm.industry}
                onChange={e => setCreateForm(f => ({ ...f, industry: e.target.value }))}
              >
                {INDUSTRIES.slice(1).map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Description</label>
              <input
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                value={createForm.description}
                onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Optional description"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button
              onClick={() => createMutation.mutate(createForm)}
              disabled={!createForm.name || !createForm.slug || createMutation.isPending}
              className="px-4 py-2 text-sm bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
            >
              {createMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Create Category
            </button>
          </div>
          {createMutation.isError && (
            <p className="text-red-600 text-sm">{(createMutation.error as Error).message}</p>
          )}
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
        </div>
      ) : isError ? (
        <div className="flex items-center justify-center py-20 gap-3 text-red-500">
          <AlertTriangle className="w-5 h-5" /> Failed to load categories
        </div>
      ) : categories.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Grid3X3 className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No categories yet</p>
          <p className="text-sm mt-1">Run the DB seed to populate the default library.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {categories.map(cat => {
            const isEditing = editingId === cat.id;
            const isUploading = uploadingId === cat.id;
            const usageCount = usage[cat.id] ?? 0;
            const indColor = INDUSTRY_COLORS[cat.industry] ?? "#9ca3af";

            return (
              <div
                key={cat.id}
                className={`bg-white border rounded-2xl overflow-hidden flex flex-col transition-all ${
                  !cat.isActive ? "opacity-50" : "hover:shadow-md"
                } ${isEditing ? "border-purple-400 ring-2 ring-purple-200" : "border-gray-200"}`}
              >
                {/* Image area */}
                <div className="relative bg-gray-50 flex items-center justify-center" style={{ height: 140 }}>
                  {isUploading ? (
                    <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
                  ) : cat.imageUrl ? (
                    <>
                      <img src={cat.imageUrl} alt={cat.name} className="w-full h-full object-cover" loading="lazy" />
                      <label
                        className="absolute inset-0 flex items-end justify-center pb-2 opacity-0 hover:opacity-100 transition-opacity cursor-pointer bg-black/30"
                        title="Replace image"
                      >
                        <span className="flex items-center gap-1 bg-white text-gray-800 text-xs font-semibold px-2.5 py-1 rounded-full shadow">
                          <Upload className="w-3 h-3" /> Replace
                        </span>
                        <input
                          ref={el => { fileRefs.current[cat.id] = el; }}
                          type="file" accept="image/*" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(cat.id, f); e.target.value = ""; }}
                        />
                      </label>
                    </>
                  ) : (
                    <label className="flex flex-col items-center gap-2 cursor-pointer group w-full h-full justify-center">
                      <div className="flex flex-col items-center gap-1.5 text-gray-300 group-hover:text-purple-400 transition-colors">
                        <Upload className="w-8 h-8" />
                        <span className="text-xs font-medium">Upload Image</span>
                      </div>
                      <input
                        ref={el => { fileRefs.current[cat.id] = el; }}
                        type="file" accept="image/*" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(cat.id, f); e.target.value = ""; }}
                      />
                    </label>
                  )}
                  <span
                    className="absolute top-2 left-2 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full text-white pointer-events-none"
                    style={{ background: indColor }}
                  >
                    {cat.industry.replace("_", " ")}
                  </span>
                </div>

                {/* Card body */}
                <div className="p-3 flex flex-col flex-1 gap-2">
                  {isEditing ? (
                    <div className="space-y-2">
                      <input
                        className="w-full border border-purple-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-purple-400"
                        value={editForm.name ?? ""}
                        onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="Name"
                        autoFocus
                      />
                      <input
                        className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs font-mono focus:outline-none"
                        value={editForm.slug ?? ""}
                        onChange={e => setEditForm(f => ({ ...f, slug: e.target.value }))}
                        placeholder="slug"
                      />
                      <div className="flex gap-1">
                        <button
                          onClick={() => updateMutation.mutate({ id: cat.id, ...editForm })}
                          disabled={updateMutation.isPending}
                          className="flex-1 flex items-center justify-center gap-1 bg-purple-600 text-white text-xs font-semibold py-1.5 rounded-lg"
                        >
                          {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="flex-1 flex items-center justify-center gap-1 border border-gray-200 text-gray-600 text-xs py-1.5 rounded-lg hover:bg-gray-50"
                        >
                          <X className="w-3 h-3" /> Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-900 leading-tight">{cat.name}</p>
                        <p className="text-xs text-gray-400 font-mono mt-0.5">{cat.slug}</p>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 text-xs text-gray-400">
                          <Tag className="w-3 h-3" />
                          <span>{usageCount} service{usageCount !== 1 ? "s" : ""}</span>
                        </div>
                        {!cat.isActive && (
                          <span className="text-[10px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded-full border border-gray-200">Disabled</span>
                        )}
                      </div>
                      <div className="flex gap-1 pt-1 border-t border-gray-100">
                        <button onClick={() => startEdit(cat)} className="flex-1 flex items-center justify-center gap-1 text-xs text-gray-500 hover:text-purple-600 py-1 rounded transition-colors" title="Edit">
                          <Edit2 className="w-3 h-3" /> Edit
                        </button>
                        <button onClick={() => updateMutation.mutate({ id: cat.id, isActive: !cat.isActive })} className="flex-1 flex items-center justify-center gap-1 text-xs text-gray-500 hover:text-blue-600 py-1 rounded transition-colors" title={cat.isActive ? "Disable" : "Enable"}>
                          <RefreshCw className="w-3 h-3" /> {cat.isActive ? "Disable" : "Enable"}
                        </button>
                        <button
                          onClick={async () => { if (await confirm(`Delete "${cat.name}"? This will unassign it from all services.`, { destructive: true })) deleteMutation.mutate(cat.id); }}
                          className="flex items-center justify-center text-xs text-gray-400 hover:text-red-500 py-1 px-1.5 rounded transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Site Images ──────────────────────────────────────────────────────────
function SiteImagesTab() {
  const qc = useQueryClient();
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [customKey, setCustomKey] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [showCustomForm, setShowCustomForm] = useState(false);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const { data, isLoading } = useQuery<{ assets: SiteAsset[] }>({
    queryKey: ["site-assets"],
    queryFn: () => apiFetch("/api/admin/site-assets"),
  });

  const assetMap = Object.fromEntries((data?.assets ?? []).map(a => [a.key, a]));

  const handleUpload = async (key: string, label: string, file: File) => {
    setUploadingKey(key);
    try {
      const fd = new FormData();
      fd.append("key", key);
      fd.append("label", label);
      fd.append("image", file);
      const res = await fetch("/api/admin/site-assets/upload", {
        method: "POST", credentials: "include", body: fd,
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Upload failed");
      }
      await qc.invalidateQueries({ queryKey: ["site-assets"] });
    } catch (err: any) {
      void appAlert(`Upload failed: ${err?.message ?? "Unknown error"}`, "Error");
    } finally {
      setUploadingKey(null);
    }
  };

  const handleDelete = async (key: string) => {
    if (!(await confirm(`Remove "${key}" from R2? The image will no longer be served from this URL.`, { destructive: true }))) return;
    setDeletingKey(key);
    try {
      await apiFetch(`/api/admin/site-assets/${encodeURIComponent(key)}`, { method: "DELETE" });
      qc.invalidateQueries({ queryKey: ["site-assets"] });
    } catch (err: any) {
      void appAlert(`Delete failed: ${err?.message}`, "Error");
    } finally {
      setDeletingKey(null);
    }
  };

  // All slots = pre-defined + any extra assets not in the pre-defined list
  const extraAssets = (data?.assets ?? []).filter(a => !SITE_IMAGE_SLOTS.some(s => s.key === a.key));
  const allSlots = [
    ...SITE_IMAGE_SLOTS,
    ...extraAssets.map(a => ({ key: a.key, label: a.label })),
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Globe className="w-5 h-5 text-blue-600" />
            Site Images
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Upload images to Cloudflare R2. They are served automatically at{" "}
            <code className="bg-gray-100 px-1 rounded text-xs">/assets/&lt;filename&gt;</code> on the site — no VPS file uploads needed.
          </p>
        </div>
        <button
          onClick={() => setShowCustomForm(v => !v)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> Custom Image
        </button>
      </div>

      {/* Custom slot form */}
      {showCustomForm && (
        <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-5 space-y-3">
          <h3 className="font-bold text-blue-900 text-sm">Upload a Custom Site Image</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Filename (key) *</label>
              <input
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={customKey}
                onChange={e => setCustomKey(e.target.value)}
                placeholder="my-image.png"
              />
              <p className="text-[11px] text-gray-400 mt-0.5">Served at /assets/my-image.png</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Label</label>
              <input
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={customLabel}
                onChange={e => setCustomLabel(e.target.value)}
                placeholder="Descriptive name"
              />
            </div>
          </div>
          <label className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${customKey ? "border-blue-300 hover:border-blue-500 bg-white" : "border-gray-200 opacity-50 pointer-events-none"}`}>
            {uploadingKey === customKey ? (
              <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
            ) : (
              <Upload className="w-5 h-5 text-blue-400" />
            )}
            <span className="text-sm text-gray-600">{uploadingKey === customKey ? "Uploading…" : "Click to choose image file"}</span>
            <input
              type="file" accept="image/*" className="hidden"
              disabled={!customKey || !!uploadingKey}
              onChange={e => {
                const f = e.target.files?.[0];
                if (f && customKey) {
                  handleUpload(customKey, customLabel || customKey, f).then(() => {
                    setCustomKey(""); setCustomLabel(""); setShowCustomForm(false);
                  });
                }
                e.target.value = "";
              }}
            />
          </label>
          <button onClick={() => setShowCustomForm(false)} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
        </div>
      )}

      {/* Slots grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-7 h-7 animate-spin text-blue-400" />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {allSlots.map(slot => {
            const asset = assetMap[slot.key];
            const isUploading = uploadingKey === slot.key;
            const isDeleting = deletingKey === slot.key;

            return (
              <div key={slot.key} className="bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col hover:shadow-md transition-all">
                {/* Preview */}
                <div className="relative bg-gray-50 flex items-center justify-center" style={{ height: 160 }}>
                  {isUploading || isDeleting ? (
                    <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                  ) : asset?.r2_url ? (
                    <>
                      <img src={asset.r2_url} alt={slot.label} className="w-full h-full object-cover" loading="lazy" />
                      <div className="absolute top-2 right-2 flex items-center gap-1">
                        <span className="text-[9px] bg-green-500 text-white px-1.5 py-0.5 rounded-full font-bold">R2</span>
                      </div>
                      <label className="absolute inset-0 flex items-end justify-center pb-2 opacity-0 hover:opacity-100 transition-opacity cursor-pointer bg-black/30">
                        <span className="flex items-center gap-1 bg-white text-gray-800 text-xs font-semibold px-2.5 py-1 rounded-full shadow">
                          <Upload className="w-3 h-3" /> Replace
                        </span>
                        <input
                          ref={el => { fileRefs.current[slot.key] = el; }}
                          type="file" accept="image/*" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(slot.key, slot.label, f); e.target.value = ""; }}
                        />
                      </label>
                    </>
                  ) : (
                    <label className="flex flex-col items-center gap-2 cursor-pointer group w-full h-full justify-center">
                      <div className="flex flex-col items-center gap-1.5 text-gray-300 group-hover:text-blue-400 transition-colors">
                        <ImageIcon className="w-8 h-8" />
                        <span className="text-xs font-medium">Upload Image</span>
                      </div>
                      <input
                        ref={el => { fileRefs.current[slot.key] = el; }}
                        type="file" accept="image/*" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(slot.key, slot.label, f); e.target.value = ""; }}
                      />
                    </label>
                  )}
                </div>

                {/* Info */}
                <div className="p-3 flex flex-col gap-2 flex-1">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 leading-tight">{slot.label}</p>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">/assets/{slot.key}</p>
                  </div>

                  {asset?.r2_url && (
                    <div className="flex items-center gap-1 text-[11px] text-gray-400 break-all">
                      <span className="shrink-0 font-semibold text-green-600">R2 URL:</span>
                      <a href={asset.r2_url} target="_blank" rel="noreferrer" className="hover:text-blue-500 truncate">{asset.r2_url}</a>
                    </div>
                  )}

                  <div className="flex gap-1.5 pt-1 border-t border-gray-100 mt-auto">
                    <label className="flex-1 flex items-center justify-center gap-1 text-xs text-gray-500 hover:text-blue-600 py-1.5 rounded cursor-pointer transition-colors border border-transparent hover:border-blue-200 hover:bg-blue-50">
                      <Upload className="w-3 h-3" /> {asset ? "Replace" : "Upload"}
                      <input
                        type="file" accept="image/*" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(slot.key, slot.label, f); e.target.value = ""; }}
                      />
                    </label>
                    {asset && (
                      <button
                        onClick={() => handleDelete(slot.key)}
                        disabled={isDeleting}
                        className="flex items-center justify-center text-xs text-gray-400 hover:text-red-500 py-1.5 px-2 rounded transition-colors"
                        title="Remove from R2"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-gray-400 border-t border-gray-100 pt-4">
        Images are stored in Cloudflare R2 and automatically converted to WebP.
        After upload, the site serves them at <code className="bg-gray-100 px-1 rounded">/assets/&lt;filename&gt;</code> via a 302 redirect to the R2 CDN URL.
        The redirect cache refreshes every 60 seconds — no server restart needed.
      </p>
    </div>
  );
}

// ─── Tab: Service Images (pre-defined slot grid) ───────────────────────────────
function ServiceImagesTab() {
  const qc = useQueryClient();
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  // uploading state: key = "name" of the slot being uploaded
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Fetch ALL service images (no filter — we do client-side filtering for slot display)
  const { data, isLoading, isError } = useQuery<{ images: ServiceImage[] }>({
    queryKey: ["service-images-all"],
    queryFn: () => apiFetch("/api/service-images?limit=9999"),
  });

  // Build lookup: lowercase name → ServiceImage record
  const nameToImage = useMemo(() => {
    const map: Record<string, ServiceImage> = {};
    for (const img of data?.images ?? []) {
      map[img.name.toLowerCase().trim()] = img;
    }
    return map;
  }, [data]);

  // Upload (create record if needed, then upload image)
  const handleSlotUpload = async (name: string, category: string, subcategory: string, file: File) => {
    setUploadingKey(name);
    try {
      const existing = nameToImage[name.toLowerCase().trim()];
      let imageId = existing?.id;

      if (!imageId) {
        // Create the DB record first
        const created: ServiceImage = await apiFetch("/api/service-images", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, category, subcategory: subcategory || null }),
        });
        imageId = created.id;
      }

      // Upload the file
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch(`/api/service-images/${imageId}/upload`, {
        method: "POST", credentials: "include", body: fd,
      });
      if (!res.ok) throw new Error("Upload failed");
      await qc.invalidateQueries({ queryKey: ["service-images-all"] });
    } catch (err: any) {
      void appAlert(`Upload failed: ${err?.message ?? "Unknown error"}`, "Error");
    } finally {
      setUploadingKey(null);
      const el = fileRefs.current[name];
      if (el) el.value = "";
    }
  };

  const handleDelete = async (name: string) => {
    const img = nameToImage[name.toLowerCase().trim()];
    if (!img) return;
    if (!(await confirm(`Remove the image for "${name}"? It will be deleted from R2.`, { destructive: true }))) return;
    setDeletingKey(name);
    try {
      await apiFetch(`/api/service-images/${img.id}`, { method: "DELETE" });
      qc.invalidateQueries({ queryKey: ["service-images-all"] });
    } catch (err: any) {
      void appAlert(`Delete failed: ${err?.message}`, "Error");
    } finally {
      setDeletingKey(null);
    }
  };

  // Filter groups based on category tab + search
  const filteredGroups = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return SERVICE_SLOT_GROUPS.map(group => {
      if (categoryFilter !== "All" && group.category !== categoryFilter) return null;
      const filteredSubs = group.subcategories.map(sub => {
        const filteredServices = sub.services.filter(svc =>
          !q || svc.toLowerCase().includes(q) || group.category.toLowerCase().includes(q) || sub.name.toLowerCase().includes(q)
        );
        return { ...sub, services: filteredServices };
      }).filter(sub => sub.services.length > 0);
      if (!filteredSubs.length) return null;
      return { ...group, subcategories: filteredSubs };
    }).filter((g): g is ServiceSlotGroup => g !== null);
  }, [categoryFilter, searchQuery]);

  // Total counts
  const totalSlots = SERVICE_SLOT_GROUPS.reduce((a, g) => a + g.subcategories.reduce((b, s) => b + s.services.length, 0), 0);
  const totalUploaded = Object.keys(nameToImage).filter(k => nameToImage[k].imageUrl).length;

  const categoryNames = SERVICE_SLOT_GROUPS.map(g => g.category);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-600" />
            Services Image Library
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Click any service card to upload its image. Images are stored in R2 and linked to that service name across the platform.
          </p>
        </div>
        {/* Summary badge */}
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-2xl font-bold text-emerald-600">{totalUploaded}</p>
            <p className="text-xs text-gray-400">of {totalSlots} uploaded</p>
          </div>
          <div className="w-16 h-16 rounded-full border-4 border-gray-100 flex items-center justify-center relative">
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15.9" fill="none" stroke="#10b981" strokeWidth="3"
                strokeDasharray={`${totalSlots > 0 ? (totalUploaded / totalSlots) * 100 : 0} 100`}
                strokeLinecap="round"
              />
            </svg>
            <span className="text-xs font-bold text-emerald-600 z-10">
              {totalSlots > 0 ? Math.round((totalUploaded / totalSlots) * 100) : 0}%
            </span>
          </div>
        </div>
      </div>

      {/* Search + category filter tabs */}
      <div className="flex flex-col gap-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            placeholder="Search services…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setCategoryFilter("All")}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
              categoryFilter === "All"
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
            }`}
          >
            All
          </button>
          {categoryNames.map(cat => {
            const group = SERVICE_SLOT_GROUPS.find(g => g.category === cat)!;
            const total = group.subcategories.reduce((a, s) => a + s.services.length, 0);
            const uploaded = group.subcategories.reduce((a, s) =>
              a + s.services.filter(svc => nameToImage[svc.toLowerCase().trim()]?.imageUrl).length, 0);
            return (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border flex items-center gap-1.5 ${
                  categoryFilter === cat
                    ? "text-white border-transparent"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                }`}
                style={categoryFilter === cat ? { background: group.color } : undefined}
              >
                {cat}
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  categoryFilter === cat ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
                }`}>
                  {uploaded}/{total}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
        </div>
      ) : isError ? (
        <div className="flex items-center justify-center py-20 gap-3 text-red-500">
          <AlertTriangle className="w-5 h-5" /> Failed to load service images
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No services match your search</p>
        </div>
      ) : (
        <div className="space-y-10">
          {filteredGroups.map(group => (
            <div key={group.category}>
              {/* Category header */}
              <div className="flex items-center gap-3 mb-4">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ background: group.color }}
                />
                <h3 className="text-base font-bold text-gray-900">{group.category}</h3>
                <div className="flex-1 h-px bg-gray-100" />
                {(() => {
                  const total = group.subcategories.reduce((a, s) => a + s.services.length, 0);
                  const uploaded = group.subcategories.reduce((a, s) =>
                    a + s.services.filter(svc => nameToImage[svc.toLowerCase().trim()]?.imageUrl).length, 0);
                  return (
                    <span className="text-xs text-gray-400 font-medium shrink-0">
                      {uploaded} / {total} uploaded
                    </span>
                  );
                })()}
              </div>

              {group.subcategories.map(sub => (
                <div key={sub.name || "__default"} className="mb-6 last:mb-0">
                  {/* Subcategory label */}
                  {sub.name && (
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 pl-1">
                      {sub.name}
                    </p>
                  )}
                  {/* Cards grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {sub.services.map(svcName => {
                      const img = nameToImage[svcName.toLowerCase().trim()];
                      const displayImg = img?.thumbnailUrl || img?.imageUrl;
                      const isUploading = uploadingKey === svcName;
                      const isDeleting = deletingKey === svcName;
                      const hasImage = !!displayImg;

                      return (
                        <div
                          key={svcName}
                          className={`bg-white border rounded-2xl overflow-hidden flex flex-col transition-all group ${
                            hasImage ? "border-gray-200 hover:shadow-md" : "border-dashed border-gray-200 hover:border-emerald-300 hover:shadow-sm"
                          }`}
                        >
                          {/* Image / upload area */}
                          <label
                            className="relative flex items-center justify-center cursor-pointer"
                            style={{ height: 130 }}
                            title={hasImage ? "Click to replace image" : "Click to upload image"}
                          >
                            {isUploading || isDeleting ? (
                              <div className="w-full h-full bg-gray-50 flex items-center justify-center">
                                <Loader2 className="w-7 h-7 animate-spin text-emerald-400" />
                              </div>
                            ) : hasImage ? (
                              <>
                                <img
                                  src={displayImg}
                                  alt={svcName}
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                />
                                {/* Replace overlay on hover */}
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-end justify-center pb-2 opacity-0 group-hover:opacity-100">
                                  <span className="flex items-center gap-1 bg-white text-gray-800 text-xs font-semibold px-2.5 py-1 rounded-full shadow">
                                    <Upload className="w-3 h-3" /> Replace
                                  </span>
                                </div>
                                {/* Uploaded checkmark badge */}
                                <span
                                  className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center shadow"
                                  style={{ background: group.color }}
                                >
                                  <Check className="w-3 h-3 text-white" />
                                </span>
                              </>
                            ) : (
                              <div className="w-full h-full bg-gray-50 group-hover:bg-emerald-50 transition-colors flex flex-col items-center justify-center gap-1.5">
                                <Upload className="w-7 h-7 text-gray-200 group-hover:text-emerald-400 transition-colors" />
                                <span className="text-[10px] text-gray-300 group-hover:text-emerald-400 transition-colors font-medium">Upload</span>
                              </div>
                            )}
                            <input
                              ref={el => { fileRefs.current[svcName] = el; }}
                              type="file" accept="image/*" className="hidden"
                              onChange={e => {
                                const f = e.target.files?.[0];
                                if (f) handleSlotUpload(svcName, group.category, sub.name, f);
                              }}
                            />
                          </label>

                          {/* Card footer */}
                          <div className="px-3 py-2 flex items-center justify-between gap-1 min-h-[44px]">
                            <p className="text-xs font-semibold text-gray-800 leading-tight line-clamp-2 flex-1">
                              {svcName}
                            </p>
                            {hasImage && (
                              <button
                                onClick={() => handleDelete(svcName)}
                                className="shrink-0 text-gray-300 hover:text-red-400 transition-colors p-0.5 rounded"
                                title="Remove image"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
type Tab = "categories" | "site-images" | "service-images";

export default function IllustrationLibrary() {
  const [activeTab, setActiveTab] = useState<Tab>("categories");

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Image className="w-6 h-6 text-purple-600" />
          Illustration Library
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage kiosk illustration categories, site images, and the default service image catalog.
        </p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { id: "categories",     label: "Illustrations",     icon: Grid3X3 },
          { id: "service-images", label: "Services Images",   icon: Layers  },
          { id: "site-images",    label: "Site Images (R2)",  icon: Globe   },
        ] as { id: Tab; label: string; icon: any }[]).map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-px ${
                activeTab === tab.id
                  ? "border-purple-600 text-purple-700"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "categories"     && <IllustrationCategoriesTab />}
      {activeTab === "service-images" && <ServiceImagesTab />}
      {activeTab === "site-images"    && <SiteImagesTab />}
    </div>
  );
}
