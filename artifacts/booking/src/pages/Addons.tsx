import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAddons, useCreateAddon, useUpdateAddon, useDeleteAddon, useServiceAddonMappings, useSetAddonServices } from "@/hooks/use-addons";
import { useServices } from "@/hooks/use-services";
import { Plus, Pencil, Search, Save, X, Trash2, Link2, ImageIcon, Camera, Loader2 } from "lucide-react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertAddonSchema } from "@shared/schema";
import type { Addon, Service } from "@shared/schema";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";

/* ─── Reusable image upload widget for addon rows ─── */
function AddonImageUpload({ imageUrl, onUpload }: { imageUrl: string; onUpload: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const { toast } = useToast();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/uploads/image", { method: "POST", credentials: "include", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();
      onUpload(url);
    } catch {
      URL.revokeObjectURL(localPreview);
      setPreviewUrl(null);
      toast({ title: "Failed to upload image", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const displayUrl = previewUrl || imageUrl;

  return (
    <div className="relative w-9 h-9 group shrink-0">
      {displayUrl
        ? <img src={displayUrl} className="w-9 h-9 rounded-lg object-cover border border-slate-200" alt="" />
        : <div className="w-9 h-9 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center">
            <ImageIcon className="w-4 h-4 text-slate-300" />
          </div>
      }
      <div className={`absolute inset-0 rounded-lg flex items-center justify-center transition-opacity ${uploading ? "opacity-100 bg-black/40" : "opacity-0 group-hover:opacity-100 bg-black/30"}`}>
        {uploading
          ? <Loader2 className="w-3 h-3 text-white animate-spin" />
          : <Camera className="w-3 h-3 text-white" />}
      </div>
      {!uploading && (
        <label className="absolute inset-0 cursor-pointer rounded-lg">
          <input type="file" accept="image/*" className="sr-only" onChange={handleFileChange} />
        </label>
      )}
    </div>
  );
}

export default function AddonsPage() {
  const { data: addons, isLoading } = useAddons();
  const { data: services } = useServices();
  const { data: mappings } = useServiceAddonMappings();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editedRows, setEditedRows] = useState<Record<number, Partial<Addon>>>({});
  const [mappingAddonId, setMappingAddonId] = useState<number | null>(null);
  const [deleteAddonTarget, setDeleteAddonTarget] = useState<number | null>(null);
  const { mutate: updateAddon } = useUpdateAddon();
  const { mutate: deleteAddon } = useDeleteAddon();
  const { toast } = useToast();

  const addonServiceMap = useMemo(() => {
    const map: Record<number, number[]> = {};
    (mappings || []).forEach(m => {
      if (!map[m.addonId]) map[m.addonId] = [];
      map[m.addonId].push(m.serviceId);
    });
    return map;
  }, [mappings]);

  const serviceNameMap = useMemo(() => {
    const map: Record<number, string> = {};
    (services || []).forEach((s: Service) => {
      map[s.id] = s.name;
    });
    return map;
  }, [services]);

  const filtered = (addons || []).filter((a: Addon) =>
    a.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleFieldChange = (id: number, field: string, value: string | number) => {
    setEditedRows(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: value },
    }));
  };

  const saveAllChanges = () => {
    const entries = Object.entries(editedRows);
    if (entries.length === 0) {
      setEditMode(false);
      return;
    }

    let completed = 0;
    entries.forEach(([idStr, changes]) => {
      const id = Number(idStr);
      updateAddon({ id, ...changes } as any, {
        onSuccess: () => {
          completed++;
          if (completed === entries.length) {
            toast({ title: "All changes saved" });
            setEditedRows({});
            setEditMode(false);
          }
        },
        onError: () => {
          toast({ title: "Failed to save some changes", variant: "destructive" });
        },
      });
    });
  };

  const cancelEdit = () => {
    setEditedRows({});
    setEditMode(false);
  };

  const getFieldValue = (addon: Addon, field: keyof Addon) => {
    if (editedRows[addon.id] && field in editedRows[addon.id]!) {
      return (editedRows[addon.id] as any)[field];
    }
    return addon[field];
  };

  return (
    <>
    <AppLayout>
      <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold">Add-Ons</h1>
          <p className="text-muted-foreground">Manage add-on services that can be attached to appointments.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search add-ons..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-[220px]"
              data-testid="input-search-addons"
            />
          </div>
          <Button
            variant={editMode ? "default" : "outline"}
            onClick={() => editMode ? saveAllChanges() : setEditMode(true)}
            data-testid="button-addon-edit-mode"
          >
            {editMode ? (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save All
              </>
            ) : (
              <>
                <Pencil className="w-4 h-4 mr-2" />
                Edit Mode
              </>
            )}
          </Button>
          {editMode && (
            <Button variant="ghost" onClick={cancelEdit} data-testid="button-addon-cancel-edit">
              <X className="w-4 h-4" />
            </Button>
          )}
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-addon">
                <Plus className="w-4 h-4 mr-2" />
                Add Add-On
              </Button>
            </DialogTrigger>
            <DialogContent aria-describedby="add-addon-desc">
              <DialogHeader>
                <DialogTitle>Add New Add-On</DialogTitle>
              </DialogHeader>
              <div id="add-addon-desc" className="sr-only">Fill out the form to add a new add-on service.</div>
              <CreateAddonForm services={services || []} onSuccess={() => setIsCreateOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-muted-foreground">Loading add-ons...</p>
        </div>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="addons-table">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground w-[50px]">ID</th>
                  <th className="py-3 px-4 font-medium text-muted-foreground w-[64px] text-center">Photo</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground min-w-[180px]">Name</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground min-w-[180px]">Description</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground w-[90px]">Duration</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground w-[90px]">Price</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground min-w-[200px]">Mapped Services</th>
                  {editMode && <th className="py-3 px-4 w-[60px]"></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={editMode ? 8 : 7} className="py-12 text-center text-muted-foreground">
                      {searchQuery ? "No add-ons match your search." : "No add-ons added yet."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((addon: Addon) => {
                    const mappedIds = addonServiceMap[addon.id] || [];
                    return (
                      <tr
                        key={addon.id}
                        className="border-b last:border-b-0 hover-elevate"
                        data-testid={`row-addon-${addon.id}`}
                      >
                        <td className="py-2 px-4 text-muted-foreground font-mono text-xs">{addon.id}</td>
                        <td className="py-2 px-4 text-center">
                          {editMode
                            ? <div className="flex justify-center">
                                <AddonImageUpload
                                  imageUrl={String(getFieldValue(addon, "imageUrl") || "")}
                                  onUpload={(url) => handleFieldChange(addon.id, "imageUrl", url)}
                                />
                              </div>
                            : addon.imageUrl
                              ? <img src={addon.imageUrl} className="w-9 h-9 rounded-lg object-cover border border-slate-200 mx-auto" alt={addon.name} />
                              : <div className="w-9 h-9 rounded-lg border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center mx-auto">
                                  <ImageIcon className="w-4 h-4 text-slate-300" />
                                </div>
                          }
                        </td>
                        <td className="py-2 px-4">
                          {editMode ? (
                            <Input
                              value={String(getFieldValue(addon, "name"))}
                              onChange={(e) => handleFieldChange(addon.id, "name", e.target.value)}
                              className="h-8"
                              data-testid={`input-addon-name-${addon.id}`}
                            />
                          ) : (
                            <span className="font-medium" data-testid={`text-addon-name-${addon.id}`}>{addon.name}</span>
                          )}
                        </td>
                        <td className="py-2 px-4">
                          {editMode ? (
                            <Input
                              value={String(getFieldValue(addon, "description") || "")}
                              onChange={(e) => handleFieldChange(addon.id, "description", e.target.value)}
                              className="h-8"
                              data-testid={`input-addon-desc-${addon.id}`}
                            />
                          ) : (
                            <span className="text-muted-foreground text-xs">{addon.description || "-"}</span>
                          )}
                        </td>
                        <td className="py-2 px-4">
                          {editMode ? (
                            <Input
                              type="number"
                              value={String(getFieldValue(addon, "duration"))}
                              onChange={(e) => handleFieldChange(addon.id, "duration", Number(e.target.value))}
                              className="h-8 w-20"
                              data-testid={`input-addon-duration-${addon.id}`}
                            />
                          ) : (
                            <span className="text-muted-foreground">{addon.duration} min</span>
                          )}
                        </td>
                        <td className="py-2 px-4 text-right">
                          {editMode ? (
                            <Input
                              type="number"
                              step="0.01"
                              value={String(getFieldValue(addon, "price"))}
                              onChange={(e) => handleFieldChange(addon.id, "price", e.target.value)}
                              className="h-8 w-24 ml-auto"
                              data-testid={`input-addon-price-${addon.id}`}
                            />
                          ) : (
                            <span className="font-semibold text-primary">${Number(addon.price).toFixed(2)}</span>
                          )}
                        </td>
                        <td className="py-2 px-4">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {mappedIds.length === 0 ? (
                              <span className="text-muted-foreground text-xs italic">All services</span>
                            ) : (
                              mappedIds.slice(0, 3).map(sid => (
                                <Badge key={sid} variant="secondary" className="text-xs no-default-active-elevate" data-testid={`badge-mapped-service-${addon.id}-${sid}`}>
                                  {serviceNameMap[sid] || `#${sid}`}
                                </Badge>
                              ))
                            )}
                            {mappedIds.length > 3 && (
                              <Badge variant="outline" className="text-xs no-default-active-elevate">
                                +{mappedIds.length - 3} more
                              </Badge>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setMappingAddonId(addon.id)}
                              data-testid={`button-map-services-${addon.id}`}
                            >
                              <Link2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                        {editMode && (
                          <td className="py-2 px-4 text-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeleteAddonTarget(addon.id)}
                              data-testid={`button-delete-addon-${addon.id}`}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <div className="bg-muted/30 border-t px-4 py-2 flex items-center justify-between gap-4">
            <span className="text-xs text-muted-foreground">{filtered.length} records</span>
            {editMode && Object.keys(editedRows).length > 0 && (
              <span className="text-xs text-primary font-medium">{Object.keys(editedRows).length} modified</span>
            )}
          </div>
        </div>
      )}

      {mappingAddonId && (
        <ServiceMappingDialog
          addonId={mappingAddonId}
          addonName={addons?.find((a: Addon) => a.id === mappingAddonId)?.name || ""}
          services={services || []}
          currentServiceIds={addonServiceMap[mappingAddonId] || []}
          onClose={() => setMappingAddonId(null)}
        />
      )}
    </AppLayout>

    <AlertDialog open={deleteAddonTarget !== null} onOpenChange={(open) => { if (!open) setDeleteAddonTarget(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete add-on?</AlertDialogTitle>
          <AlertDialogDescription>
            This add-on will be permanently removed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={() => { if (deleteAddonTarget !== null) { deleteAddon(deleteAddonTarget); setDeleteAddonTarget(null); } }}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

function ServiceMappingDialog({
  addonId,
  addonName,
  services,
  currentServiceIds,
  onClose,
}: {
  addonId: number;
  addonName: string;
  services: Service[];
  currentServiceIds: number[];
  onClose: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<number[]>(currentServiceIds);
  const { mutate: setAddonServices, isPending } = useSetAddonServices();
  const { toast } = useToast();

  const toggleService = (serviceId: number) => {
    setSelectedIds(prev =>
      prev.includes(serviceId)
        ? prev.filter(id => id !== serviceId)
        : [...prev, serviceId]
    );
  };

  const selectAll = () => setSelectedIds(services.map((s: Service) => s.id));
  const clearAll = () => setSelectedIds([]);

  const handleSave = () => {
    setAddonServices({ addonId, serviceIds: selectedIds }, {
      onSuccess: () => {
        toast({ title: "Service mappings updated" });
        onClose();
      },
      onError: () => {
        toast({ title: "Failed to update mappings", variant: "destructive" });
      },
    });
  };

  const grouped = useMemo(() => {
    const groups: Record<string, Service[]> = {};
    services.forEach((s: Service) => {
      const cat = s.category || "Uncategorized";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(s);
    });
    return groups;
  }, [services]);

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col" aria-describedby="map-services-desc">
        <DialogHeader>
          <DialogTitle>Map Services to "{addonName}"</DialogTitle>
        </DialogHeader>
        <p id="map-services-desc" className="text-sm text-muted-foreground mb-2">
          Select which services this add-on can be attached to. Leave empty to make it available for all services.
        </p>
        <div className="flex items-center gap-2 mb-3">
          <Button variant="outline" size="sm" onClick={selectAll} data-testid="button-select-all-services">
            Select All
          </Button>
          <Button variant="outline" size="sm" onClick={clearAll} data-testid="button-clear-all-services">
            Clear All
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">{selectedIds.length} selected</span>
        </div>
        <div className="flex-1 overflow-y-auto space-y-4 border rounded-md p-3">
          {Object.entries(grouped).map(([category, categoryServices]) => (
            <div key={category}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{category}</p>
              <div className="space-y-1.5">
                {categoryServices.map((service: Service) => (
                  <label
                    key={service.id}
                    className="flex items-center gap-2.5 py-1.5 px-2 rounded-md hover-elevate cursor-pointer"
                    data-testid={`checkbox-service-${service.id}`}
                  >
                    <Checkbox
                      checked={selectedIds.includes(service.id)}
                      onCheckedChange={() => toggleService(service.id)}
                    />
                    <span className="text-sm flex-1">{service.name}</span>
                    <span className="text-xs text-muted-foreground">${Number(service.price).toFixed(2)}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          {services.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No services available.</p>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-3">
          <Button variant="outline" onClick={onClose} data-testid="button-cancel-mapping">Cancel</Button>
          <Button onClick={handleSave} disabled={isPending} data-testid="button-save-mapping">
            {isPending ? "Saving..." : "Save Mapping"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateAddonForm({ services, onSuccess }: { services: Service[]; onSuccess: () => void }) {
  const { mutate: createAddon, isPending } = useCreateAddon();
  const { mutate: setAddonServices } = useSetAddonServices();
  const { data: allAddons } = useAddons();
  const { toast } = useToast();
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);
  const [addonImageUrl, setAddonImageUrl] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [addonImagePreview, setAddonImagePreview] = useState<string | null>(null);
  const [addonType, setAddonType] = useState<"full" | "mini" | "express">("full");
  const [parentAddonId, setParentAddonId] = useState<number | null>(null);

  const formSchema = insertAddonSchema.extend({
    duration: z.coerce.number().min(1, "Duration must be at least 1 minute"),
    price: z.coerce.number().min(0, "Price must be positive"),
  });

  const { register, handleSubmit, formState: { errors } } = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema) as Resolver<z.infer<typeof formSchema>>,
  });

  const fullAddons = (allAddons || []).filter((a: Addon) => (a as any).type === "full" || !(a as any).type);

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const localPreview = URL.createObjectURL(file);
    setAddonImagePreview(localPreview);
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/uploads/image", { method: "POST", credentials: "include", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();
      setAddonImageUrl(url);
    } catch {
      URL.revokeObjectURL(localPreview);
      setAddonImagePreview(null);
      toast({ title: "Failed to upload image", variant: "destructive" });
    } finally {
      setUploadingImage(false);
    }
  };

  const toggleService = (serviceId: number) => {
    setSelectedServiceIds(prev =>
      prev.includes(serviceId) ? prev.filter(id => id !== serviceId) : [...prev, serviceId]
    );
  };

  const grouped = useMemo(() => {
    const groups: Record<string, Service[]> = {};
    services.forEach((s: Service) => {
      const cat = s.category || "Uncategorized";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(s);
    });
    return groups;
  }, [services]);

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    createAddon({
      ...data,
      imageUrl: addonImageUrl || undefined,
      type: addonType,
      parentAddonId: parentAddonId ?? undefined,
    } as any, {
      onSuccess: (newAddon: any) => {
        if (selectedServiceIds.length > 0) {
          setAddonServices({ addonId: newAddon.id, serviceIds: selectedServiceIds });
        }
        onSuccess();
      },
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Photo upload */}
      <div className="space-y-2">
        <Label>Photo <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <div className="flex gap-3 items-center">
          <div className="relative w-14 h-14 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center shrink-0 overflow-hidden group">
            {uploadingImage
              ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              : (addonImagePreview || addonImageUrl)
                ? <img src={addonImagePreview || addonImageUrl} alt="Preview" className="w-full h-full object-cover" />
                : <ImageIcon className="w-6 h-6 text-slate-300" />}
            {!uploadingImage && (
              <>
                <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                  <Camera className="w-5 h-5 text-white" />
                </div>
                <label className="absolute inset-0 cursor-pointer">
                  <input type="file" accept="image/*" className="sr-only" onChange={handleImageChange} />
                </label>
              </>
            )}
          </div>
          <div className="text-xs text-muted-foreground leading-relaxed">
            {uploadingImage ? "Uploading…" : addonImageUrl ? (
              <button type="button" className="text-red-500 hover:text-red-600 underline underline-offset-2"
                onClick={() => setAddonImageUrl("")}>Remove photo</button>
            ) : "Click to upload a photo for this add-on"}
            <br />
            <span className="text-slate-400">JPG, PNG, WebP · max 5 MB</span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="name">Add-On Name</Label>
        <Input id="name" {...register("name")} placeholder="e.g. Deep Conditioning" data-testid="input-new-addon-name" />
        {errors.name && <span className="text-xs text-destructive">{errors.name.message}</span>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="duration">Duration (min)</Label>
          <Input id="duration" type="number" {...register("duration")} placeholder="15" data-testid="input-new-addon-duration" />
          {errors.duration && <span className="text-xs text-destructive">{errors.duration.message}</span>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="price">Price ($)</Label>
          <Input id="price" type="number" step="0.01" {...register("price")} placeholder="15.00" data-testid="input-new-addon-price" />
          {errors.price && <span className="text-xs text-destructive">{errors.price.message}</span>}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Input id="description" {...register("description")} placeholder="Brief description..." data-testid="input-new-addon-desc" />
      </div>

      {/* Tiered add-on type */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Version Type</Label>
          <Select value={addonType} onValueChange={(v) => { setAddonType(v as any); if (v === "full") setParentAddonId(null); }}>
            <SelectTrigger data-testid="select-addon-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="full">Full (standard)</SelectItem>
              <SelectItem value="mini">Mini (shorter version)</SelectItem>
              <SelectItem value="express">Express (ultra-short)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Full → Mini → Express for conflict resolution</p>
        </div>
        {addonType !== "full" && (
          <div className="space-y-2">
            <Label>Parent Add-On</Label>
            <Select
              value={parentAddonId?.toString() ?? ""}
              onValueChange={(v) => setParentAddonId(v ? Number(v) : null)}
            >
              <SelectTrigger data-testid="select-parent-addon">
                <SelectValue placeholder="Select full version…" />
              </SelectTrigger>
              <SelectContent>
                {fullAddons.map((a: Addon) => (
                  <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Links this to its full version</p>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label>Map to Services (optional)</Label>
        <p className="text-xs text-muted-foreground">Leave empty to make available for all services.</p>
        <div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
          {Object.entries(grouped).map(([category, categoryServices]) => (
            <div key={category}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">{category}</p>
              {categoryServices.map((service: Service) => (
                <label key={service.id} className="flex items-center gap-2 py-1 px-1 cursor-pointer text-sm">
                  <Checkbox
                    checked={selectedServiceIds.includes(service.id)}
                    onCheckedChange={() => toggleService(service.id)}
                  />
                  {service.name}
                </label>
              ))}
            </div>
          ))}
        </div>
        {selectedServiceIds.length > 0 && (
          <p className="text-xs text-primary">{selectedServiceIds.length} service(s) selected</p>
        )}
      </div>

      <div className="flex justify-end pt-4">
        <Button type="submit" disabled={isPending} data-testid="button-submit-new-addon">
          {isPending ? "Creating..." : "Create Add-On"}
        </Button>
      </div>
    </form>
  );
}
