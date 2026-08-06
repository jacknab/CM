import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertServiceSchema } from "@shared/schema";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useCreateService, useUpdateService, useCreateServiceOption, useUpdateServiceOption, useDeleteServiceOption } from "@/hooks/use-services";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Camera, Loader2, Wand2, Image, Plus, Trash2, Star, GripVertical, ImagePlus, Sparkles } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

type ServiceOptionDraft = {
  id?: number;
  name: string;
  description: string;
  durationMinutes: number;
  price: number;
  isDefault: boolean;
  displayOrder: number;
  imageUrl?: string | null;
};

type ServiceFormProps = {
  onSuccess: () => void;
  categories: any[];
  initialData?: any;
  initialCategoryId?: number;
  industry?: string;
};

export function ServiceForm({ onSuccess, categories, initialData, initialCategoryId, industry = "NAIL_SALON" }: ServiceFormProps) {
  const initialCategoryName = initialCategoryId
    ? (categories.find((c: any) => c.id === initialCategoryId)?.name ?? undefined)
    : undefined;
  const { mutate: createService, isPending: isCreating } = useCreateService();
  const { mutate: updateService, isPending: isUpdating } = useUpdateService();
  const { mutateAsync: createOption } = useCreateServiceOption();
  const { mutateAsync: updateOption } = useUpdateServiceOption();
  const { mutateAsync: deleteOption } = useDeleteServiceOption();
  const { toast } = useToast();

  const formSchema = insertServiceSchema.extend({
    duration: z.coerce.number().min(1, "Duration must be at least 1 minute"),
    price: z.coerce.number().min(0, "Price must be positive"),
    depositRequired: z.boolean().optional().default(false),
    depositAmount: z.coerce.number().min(0).optional().nullable(),
    hiddenFromPublic: z.boolean().optional().default(false),
  });

  const { register, handleSubmit, formState: { errors }, setValue, watch, reset } = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema) as Resolver<z.infer<typeof formSchema>>,
    defaultValues: initialData ? {
      name: initialData.name,
      category: initialData.category,
      duration: initialData.duration,
      price: initialData.price,
      description: initialData.description || "",
      imageUrl: initialData.imageUrl || null,
      depositRequired: initialData.depositRequired || false,
      depositAmount: initialData.depositAmount ? Number(initialData.depositAmount) : null,
      hiddenFromPublic: initialData.hiddenFromPublic || false,
    } : {
      depositRequired: false,
      depositAmount: null,
      category: initialCategoryName,
      hiddenFromPublic: false,
    }
  });

  const imageUrl = watch("imageUrl");
  const depositRequired = watch("depositRequired");
  const hiddenFromPublic = watch("hiddenFromPublic");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedIllustrationId, setSelectedIllustrationId] = useState<number | null>(
    initialData?.illustrationCategoryId ?? null
  );
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [generatingDesc, setGeneratingDesc] = useState(false);

  // Options state — seed from initialData.options if editing
  const [options, setOptions] = useState<ServiceOptionDraft[]>(() => {
    if (initialData?.options && initialData.options.length > 0) {
      return initialData.options.map((o: any) => ({
        id: o.id,
        name: o.name,
        description: o.description || "",
        durationMinutes: o.durationMinutes,
        price: Number(o.price),
        isDefault: o.isDefault,
        displayOrder: o.displayOrder,
        imageUrl: o.imageUrl || null,
      }));
    }
    return [];
  });
  const [deletedOptionIds, setDeletedOptionIds] = useState<number[]>([]);
  const [uploadingOptionIdx, setUploadingOptionIdx] = useState<number | null>(null);

  const { data: illustrationData } = useQuery<{ categories: any[] }>({
    queryKey: ["illustration-categories", industry],
    queryFn: async () => {
      const res = await fetch(`/api/illustration-categories?industry=${industry}&activeOnly=true`, { credentials: "include" });
      if (!res.ok) return { categories: [] };
      return res.json();
    },
  });
  const illustrationCategories = illustrationData?.categories ?? [];
  const currentIllustration = illustrationCategories.find((c: any) => c.id === selectedIllustrationId);

  useEffect(() => {
    if (initialData) {
      reset({
        name: initialData.name,
        category: initialData.category,
        duration: initialData.duration,
        price: initialData.price,
        description: initialData.description || "",
        imageUrl: initialData.imageUrl || null,
        depositRequired: initialData.depositRequired || false,
        depositAmount: initialData.depositAmount ? Number(initialData.depositAmount) : null,
        hiddenFromPublic: initialData.hiddenFromPublic || false,
      });
      if (initialData?.options && initialData.options.length > 0) {
        setOptions(initialData.options.map((o: any) => ({
          id: o.id,
          name: o.name,
          description: o.description || "",
          durationMinutes: o.durationMinutes,
          price: Number(o.price),
          isDefault: o.isDefault,
          displayOrder: o.displayOrder,
          imageUrl: o.imageUrl || null,
        })));
      }
    }
  }, [initialData, reset]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/uploads/image", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();
      setValue("imageUrl", url);
    } catch {
      toast({ title: "Failed to upload image", variant: "destructive" });
    } finally {
      setUploadingImage(false);
    }
  };

  const uniqueCategories = categories.length > 0
    ? categories.map((c: any) => c.name)
    : ["Hair", "Nails", "Face", "Massage"];

  const handleGenerateDescription = async () => {
    if (!initialData?.id) return;
    setGeneratingDesc(true);
    try {
      const res = await fetch(`/api/services/${initialData.id}/generate-description`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "AI generation failed" }));
        toast({ title: "Could not generate description", description: err.message, variant: "destructive" });
        return;
      }
      const { description } = await res.json();
      if (description) setValue("description", description);
    } catch {
      toast({ title: "AI generation failed", variant: "destructive" });
    } finally {
      setGeneratingDesc(false);
    }
  };

  const autoAssignIllustration = async (name: string) => {
    if (!name.trim()) return;
    setAutoAssigning(true);
    try {
      const res = await fetch(`/api/illustration-categories/auto-assign/${initialData?.id ?? 0}`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ industry }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d.assigned && d.categoryId) setSelectedIllustrationId(d.categoryId);
      }
    } finally {
      setAutoAssigning(false);
    }
  };

  const handleOptionImageChange = async (e: React.ChangeEvent<HTMLInputElement>, idx: number) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingOptionIdx(idx);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const res = await fetch("/api/uploads/image", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) throw new Error("Upload failed");
      const { url } = await res.json();
      updateOptionField(idx, "imageUrl", url);
    } catch {
      toast({ title: "Failed to upload image", variant: "destructive" });
    } finally {
      setUploadingOptionIdx(null);
      e.target.value = "";
    }
  };

  // Option management helpers
  function addOption() {
    setOptions(prev => [...prev, {
      name: "",
      description: "",
      durationMinutes: 60,
      price: 0,
      isDefault: prev.length === 0,
      displayOrder: prev.length,
    }]);
  }

  function updateOptionField(idx: number, field: keyof ServiceOptionDraft, value: any) {
    setOptions(prev => prev.map((o, i) => {
      if (i !== idx) return o;
      return { ...o, [field]: value };
    }));
  }

  function setDefaultOption(idx: number) {
    setOptions(prev => prev.map((o, i) => ({ ...o, isDefault: i === idx })));
  }

  function removeOption(idx: number) {
    const opt = options[idx];
    if (opt.id) setDeletedOptionIds(prev => [...prev, opt.id!]);
    setOptions(prev => prev.filter((_, i) => i !== idx));
  }

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    // Resolve categoryId from the selected category name so the list re-groups correctly
    const matchedCat = categories.find((c: any) => c.name === data.category);
    const categoryId = matchedCat?.id ?? null;

    const submissionData = {
      ...data,
      price: String(data.price),
      depositAmount: data.depositRequired && data.depositAmount != null ? String(data.depositAmount) : null,
      illustrationCategoryId: selectedIllustrationId ?? null,
      autoAssigned: false,
      categoryId,
    };

    if (initialData) {
      updateService({ id: initialData.id, ...submissionData } as any, {
        onSuccess: async () => {
          // Sync options: delete removed, create new, update existing
          try {
            for (const optId of deletedOptionIds) {
              await deleteOption(optId);
            }
            for (let i = 0; i < options.length; i++) {
              const o = options[i];
              if (o.id) {
                await updateOption({ id: o.id, name: o.name, description: o.description || null, durationMinutes: o.durationMinutes, price: o.price, isDefault: o.isDefault, displayOrder: i, imageUrl: o.imageUrl ?? null });
              } else {
                await createOption({ serviceId: initialData.id, name: o.name, description: o.description || null, durationMinutes: o.durationMinutes, price: o.price, isDefault: o.isDefault, displayOrder: i, imageUrl: o.imageUrl ?? null });
              }
            }
          } catch {
            toast({ title: "Service updated but some options failed to save", variant: "destructive" });
          }
          toast({ title: "Service updated" });
          onSuccess();
        },
        onError: () => toast({ title: "Failed to update service", variant: "destructive" }),
      });
    } else {
      createService({ ...submissionData, options: options.map((o, i) => ({ ...o, displayOrder: i, imageUrl: o.imageUrl ?? null })) } as any, {
        onSuccess: () => {
          toast({ title: "Service created" });
          onSuccess();
        },
        onError: () => toast({ title: "Failed to create service", variant: "destructive" }),
      });
    }
  };

  const isPending = isCreating || isUpdating;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Service Name</Label>
        <div className="flex gap-4">
          <div className="relative shrink-0">
            {uploadingImage ? (
              <div className="w-16 h-16 rounded border bg-muted flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : imageUrl ? (
              <img src={imageUrl} alt="Preview" className="w-16 h-16 rounded object-cover border" />
            ) : (
              <div className="w-16 h-16 rounded border bg-muted flex items-center justify-center">
                <Camera className="w-6 h-6 text-muted-foreground" />
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              id="service-image-upload"
              onChange={handleFileChange}
              disabled={uploadingImage}
            />
            <label
              htmlFor="service-image-upload"
              className={`absolute inset-0 ${uploadingImage ? "cursor-wait" : "cursor-pointer"}`}
              title="Upload Image"
            />
          </div>
          <div className="flex-1 space-y-2">
            <Input id="name" {...register("name")} placeholder="e.g. Women's Haircut" data-testid="input-service-name" />
            {errors.name && <span className="text-xs text-destructive">{errors.name.message}</span>}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="category">Category</Label>
        <Select onValueChange={(val) => setValue("category", val)} defaultValue={initialData?.category ?? initialCategoryName}>
          <SelectTrigger data-testid="select-service-category">
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            {uniqueCategories.map((cat: string) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.category && <span className="text-xs text-destructive">{errors.category.message}</span>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="duration">Base Duration (min)</Label>
          <Input id="duration" type="number" {...register("duration")} placeholder="60" data-testid="input-service-duration" />
          {errors.duration && <span className="text-xs text-destructive">{errors.duration.message}</span>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="price">Base Price ($)</Label>
          <Input id="price" type="number" step="0.01" {...register("price")} placeholder="80.00" data-testid="input-service-price" />
          {errors.price && <span className="text-xs text-destructive">{errors.price.message}</span>}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="description">Description</Label>
          {initialData?.id && (
            <button
              type="button"
              onClick={handleGenerateDescription}
              disabled={generatingDesc}
              className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 border border-primary/20 rounded-lg px-2.5 py-1 transition-colors disabled:opacity-50"
              title="Let AI draft a description based on the service name"
            >
              {generatingDesc ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              {generatingDesc ? "Writing…" : "Suggest with AI"}
            </button>
          )}
        </div>
        <Textarea
          id="description"
          {...register("description")}
          placeholder="Describe what's included and what clients can expect…"
          data-testid="input-service-desc"
          className="resize-none min-h-[72px] text-sm"
        />
      </div>

      {/* ── Service Options ──────────────────────────────────────────────── */}
      <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">Service Options</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Add variants like "Short", "Medium", "Long" with individual pricing & duration
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={addOption}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Option
          </Button>
        </div>

        {options.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-3">
            No options — service uses base price & duration above.
          </p>
        )}

        {options.map((opt, idx) => (
          <div key={idx} className="rounded-lg border bg-background p-3 space-y-2">
            <div className="flex items-center gap-2">
              <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                placeholder="Option name (e.g. Short)"
                value={opt.name}
                onChange={(e) => updateOptionField(idx, "name", e.target.value)}
                className="flex-1 h-8 text-sm"
              />
              {/* Image upload for this option */}
              <div className="relative shrink-0">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  id={`option-image-upload-${idx}`}
                  onChange={(e) => handleOptionImageChange(e, idx)}
                  disabled={uploadingOptionIdx === idx}
                />
                <label
                  htmlFor={`option-image-upload-${idx}`}
                  title={opt.imageUrl ? "Change option image" : "Upload option image"}
                  className={`flex items-center justify-center w-7 h-7 rounded border transition-colors ${
                    opt.imageUrl
                      ? "border-primary/40 bg-primary/5 hover:bg-primary/10"
                      : "border-dashed border-muted-foreground/40 hover:border-muted-foreground/70"
                  } ${uploadingOptionIdx === idx ? "cursor-wait opacity-60" : "cursor-pointer"}`}
                >
                  {uploadingOptionIdx === idx ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  ) : opt.imageUrl ? (
                    <img src={opt.imageUrl} alt="option" className="w-full h-full object-cover rounded" />
                  ) : (
                    <ImagePlus className="h-3.5 w-3.5 text-muted-foreground/60" />
                  )}
                </label>
              </div>
              <button
                type="button"
                title="Set as default"
                onClick={() => setDefaultOption(idx)}
                className={`shrink-0 rounded p-1 transition-colors ${opt.isDefault ? "text-yellow-500" : "text-muted-foreground hover:text-yellow-400"}`}
              >
                <Star className={`h-4 w-4 ${opt.isDefault ? "fill-yellow-400" : ""}`} />
              </button>
              {opt.isDefault && <Badge variant="secondary" className="text-xs shrink-0">Default</Badge>}
              <button
                type="button"
                onClick={() => removeOption(idx)}
                className="shrink-0 text-muted-foreground hover:text-destructive transition-colors rounded p-1"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <Input
              placeholder="Description (optional)"
              value={opt.description}
              onChange={(e) => updateOptionField(idx, "description", e.target.value)}
              className="h-8 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs mb-1 block">Duration (min)</Label>
                <Input
                  type="number"
                  value={opt.durationMinutes}
                  onChange={(e) => updateOptionField(idx, "durationMinutes", Number(e.target.value))}
                  className="h-8 text-sm"
                  min={1}
                />
              </div>
              <div>
                <Label className="text-xs mb-1 block">Price ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={opt.price}
                  onChange={(e) => updateOptionField(idx, "price", Number(e.target.value))}
                  className="h-8 text-sm"
                  min={0}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Deposit ──────────────────────────────────────────────────────── */}
      <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">Require Deposit</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Clients must pay a deposit when booking online</p>
          </div>
          <Switch
            checked={depositRequired || false}
            onCheckedChange={(checked) => setValue("depositRequired", checked)}
            data-testid="switch-deposit-required"
          />
        </div>
        {depositRequired && (
          <div className="space-y-2">
            <Label htmlFor="depositAmount">Deposit Amount ($)</Label>
            <Input
              id="depositAmount"
              type="number"
              step="0.01"
              {...register("depositAmount")}
              placeholder="e.g. 25.00"
              data-testid="input-deposit-amount"
            />
            {errors.depositAmount && <span className="text-xs text-destructive">{errors.depositAmount.message}</span>}
          </div>
        )}
      </div>

      {/* ── Illustration ──────────────────────────────────────────────────── */}
      {illustrationCategories.length > 0 && (
        <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium flex items-center gap-1.5">
                <Image className="w-3.5 h-3.5" /> Kiosk Illustration
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Shown on kiosk screens when no service photo is uploaded
              </p>
            </div>
            {initialData?.id && (
              <button
                type="button"
                onClick={() => autoAssignIllustration(initialData.name)}
                disabled={autoAssigning}
                className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 border border-primary/20 rounded-lg px-2.5 py-1 transition-colors"
              >
                {autoAssigning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                Auto-match
              </button>
            )}
          </div>

          <div className="flex gap-3 items-start">
            <div className="w-20 h-14 rounded-lg border bg-white overflow-hidden flex-shrink-0 flex items-center justify-center">
              {currentIllustration?.imageUrl ? (
                <img src={currentIllustration.imageUrl} alt={currentIllustration.name} className="w-full h-full object-cover" />
              ) : (
                <Image className="w-6 h-6 text-muted-foreground/40" />
              )}
            </div>

            <div className="flex-1 space-y-1.5">
              <Select
                onValueChange={val => setSelectedIllustrationId(val === "none" ? null : Number(val))}
                value={selectedIllustrationId ? String(selectedIllustrationId) : "none"}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Choose illustration…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No illustration</SelectItem>
                  {illustrationCategories.map((cat: any) => (
                    <SelectItem key={cat.id} value={String(cat.id)}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {currentIllustration && (
                <p className="text-xs text-muted-foreground">
                  Category: <span className="font-medium">{currentIllustration.slug}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Hidden from public toggle ─────────────────────────────────────── */}
      <div className="rounded-lg border border-dashed p-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium">Hidden from public</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            When on, this service won't appear on the public booking page or kiosk check-in.
          </p>
        </div>
        <Switch
          checked={!!hiddenFromPublic}
          onCheckedChange={(val) => setValue("hiddenFromPublic", val)}
          aria-label="Hidden from public"
        />
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={isPending} data-testid="button-submit-service">
          {isPending ? (initialData ? "Updating..." : "Creating...") : (initialData ? "Update Service" : "Create Service")}
        </Button>
      </div>
    </form>
  );
}
