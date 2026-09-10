import { useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useSelectedStore } from "@/hooks/use-store";
import { useInSettingsShell } from "@/lib/settings-shell-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { AlarmClock } from "lucide-react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Store } from "@shared/schema";

const businessProfileSchema = z.object({
  name: z.string().min(1, "Business name is required"),
  legalEntityType: z.string().optional().default(""),
  ein: z.string().optional().default(""),
  category: z.string().optional().default(""),
  email: z.string().email("Please enter a valid email").or(z.literal("")),
  phone: z.string().optional().default(""),
  city: z.string().optional().default(""),
  state: z.string().optional().default(""),
  address: z.string().optional().default(""),
  postcode: z.string().optional().default(""),
});

type BusinessProfileForm = z.infer<typeof businessProfileSchema>;

const CATEGORIES = [
  "Hair Salon", "Nail Salon", "Spa", "Barbershop",
  "Esthetician", "Pet Groomer", "Tattoo Studio", "Other",
];

const LEGAL_ENTITY_TYPES = [
  "Sole proprietorship",
  "Single-member LLC",
  "Multi-member LLC",
  "Partnership",
  "S corporation",
  "C corporation",
  "Nonprofit",
  "Other",
];

const FLOOR_OPTIONS = [
  { value: "00:00", label: "12:00 AM (midnight)" },
  { value: "01:00", label: "1:00 AM" },
  { value: "02:00", label: "2:00 AM" },
  { value: "03:00", label: "3:00 AM" },
  { value: "04:00", label: "4:00 AM" },
  { value: "05:00", label: "5:00 AM" },
];

type FeatureFlags = {
  turnSystem: boolean;
  timeclock: boolean;
  waitlist: boolean;
  pos: boolean;
  rewardPoints: boolean;
  autoClockOutFloor: string;
};

const DEFAULT_FLAGS: FeatureFlags = {
  turnSystem: true, timeclock: true, waitlist: true, pos: true,
  rewardPoints: true, autoClockOutFloor: "01:00",
};

/** "123456789" → "12-3456789"; leaves anything else untouched. */
function formatEin(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 9);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}

// ── Field wrapper: label, control, helper text (GlossGenius layout) ─────────
function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <FormItem className="space-y-1.5">
      <FormLabel className="text-[15px] font-medium">{label}</FormLabel>
      <FormControl>{children}</FormControl>
      {hint && <p className="text-[13px] text-muted-foreground">{hint}</p>}
      <FormMessage />
    </FormItem>
  );
}

function BusinessProfile({ store }: { store: Store }) {
  const { toast } = useToast();

  const defaults = (): BusinessProfileForm => ({
    name: store.name || "",
    legalEntityType: (store as any).legalEntityType || "",
    ein: (store as any).ein || "",
    category: store.category || "",
    email: store.email || "",
    phone: store.phone || "",
    city: store.city || "",
    state: store.state || "",
    address: store.address || "",
    postcode: store.postcode || "",
  });

  const form = useForm<BusinessProfileForm>({
    resolver: zodResolver(businessProfileSchema) as Resolver<BusinessProfileForm>,
    defaultValues: defaults(),
  });

  useEffect(() => { form.reset(defaults()); }, [store]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateStore = useMutation({
    mutationFn: (data: BusinessProfileForm) => apiRequest("PATCH", `/api/stores/${store.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stores"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stores", store.id] });
      toast({ title: "Business details saved" });
    },
    onError: () => toast({ title: "Couldn't save", variant: "destructive" }),
  });

  const isDirty = form.formState.isDirty;
  const inputCls = "text-[15px]";

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((d) => updateStore.mutate(d))} className="space-y-8">
        <div className="rounded-xl border border-border bg-card p-5 md:p-6 space-y-6">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <Field label="Business name" hint="Shows up on your booking site. Shorter is easier for clients to remember.">
                <Input {...field} className={inputCls} data-testid="input-store-name" />
              </Field>
            )}
          />

          <FormField
            control={form.control}
            name="legalEntityType"
            render={({ field }) => (
              <Field label="Legal entity type" hint="The legal structure of your business.">
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger data-testid="select-legal-entity" className={inputCls}>
                    <SelectValue placeholder="Select a structure" />
                  </SelectTrigger>
                  <SelectContent>
                    {LEGAL_ENTITY_TYPES.map((v) => (
                      <SelectItem key={v} value={v}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          />

          <FormField
            control={form.control}
            name="ein"
            render={({ field }) => (
              <Field label="Employer Identification Number (EIN)" hint="Your 9-digit federal tax ID number.">
                <Input
                  {...field}
                  inputMode="numeric"
                  placeholder="12-3456789"
                  className={inputCls}
                  data-testid="input-ein"
                  onChange={(e) => field.onChange(formatEin(e.target.value))}
                />
              </Field>
            )}
          />

        </div>

        <div className="rounded-xl border border-border bg-card p-5 md:p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Contact &amp; location</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Appears on your booking site and confirmations, and sets your time zone automatically.
              When multi-location support ships, this moves to a dedicated Locations page.
            </p>
          </div>

          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <Field label="Category" hint="Helps clients and search engines understand what you offer.">
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger data-testid="select-category" className={inputCls}>
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <Field label="Business email" hint="Where client replies and booking notifications are sent.">
                <Input type="email" {...field} className={inputCls} data-testid="input-email" />
              </Field>
            )}
          />

          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <Field label="Phone" hint="Shown on your booking site and confirmations.">
                <Input type="tel" {...field} className={inputCls} data-testid="input-phone" />
              </Field>
            )}
          />

          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
              <Field label="Street address">
                <Input {...field} className={inputCls} data-testid="input-address" />
              </Field>
            )}
          />

          <div className="grid gap-6 sm:grid-cols-3">
            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <Field label="City">
                  <Input {...field} className={inputCls} data-testid="input-city" />
                </Field>
              )}
            />
            <FormField
              control={form.control}
              name="state"
              render={({ field }) => (
                <Field label="State">
                  <Input {...field} className={inputCls} data-testid="input-state" />
                </Field>
              )}
            />
            <FormField
              control={form.control}
              name="postcode"
              render={({ field }) => (
                <Field label="ZIP code">
                  <Input {...field} className={inputCls} data-testid="input-postcode" />
                </Field>
              )}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3">
          {isDirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
          <Button
            type="submit"
            disabled={!isDirty || updateStore.isPending}
            data-testid="button-save-all"
          >
            {updateStore.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function TimeclockSettings() {
  const { selectedStore } = useSelectedStore();
  const { toast } = useToast();

  const { data: features } = useQuery<FeatureFlags>({
    queryKey: ["/api/settings/features", selectedStore?.id],
    queryFn: async () => {
      if (!selectedStore?.id) throw new Error("No store");
      const res = await fetch(`/api/settings/features?storeId=${selectedStore.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  const mutation = useMutation({
    mutationFn: async ({ updates, storeId }: { updates: Partial<FeatureFlags>; storeId: number }) => {
      const res = await apiRequest("PATCH", `/api/settings/features?storeId=${storeId}`, updates);
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onMutate: async ({ updates, storeId }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/settings/features", storeId] });
      const previous = queryClient.getQueryData<FeatureFlags>(["/api/settings/features", storeId]);
      queryClient.setQueryData<FeatureFlags>(["/api/settings/features", storeId], (old) => ({
        ...(old ?? DEFAULT_FLAGS),
        ...updates,
      }));
      return { previous };
    },
    onSuccess: (data, { updates, storeId }) => {
      const serverFlags = data && typeof data === "object" && "turnSystem" in data ? data as FeatureFlags : null;
      queryClient.setQueryData<FeatureFlags>(["/api/settings/features", storeId], (old) =>
        serverFlags ?? { ...(old ?? DEFAULT_FLAGS), ...updates },
      );
      queryClient.invalidateQueries({ queryKey: ["/api/settings/features", storeId] });
      toast({ title: "Setting saved" });
    },
    onError: (_err, { storeId }, context) => {
      queryClient.setQueryData(["/api/settings/features", storeId], context?.previous ?? DEFAULT_FLAGS);
      toast({ title: "Error", description: "Failed to save setting.", variant: "destructive" });
    },
  });

  const current = features ?? DEFAULT_FLAGS;

  return (
    <div className="rounded-xl border border-border bg-card p-5 md:p-6">
      <div className="flex items-start gap-3">
        <AlarmClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="flex-1">
          <p className="text-[15px] font-medium">Auto clock-out floor</p>
          <p className="mb-3 mt-1 text-[13px] leading-relaxed text-muted-foreground">
            The earliest time (salon local) that staff can be automatically clocked out — they're
            never auto-clocked out before this, regardless of business hours.
          </p>
          <Select
            value={current.autoClockOutFloor}
            onValueChange={(val) => {
              if (!selectedStore?.id) return;
              mutation.mutate({ updates: { autoClockOutFloor: val }, storeId: selectedStore.id });
            }}
            disabled={mutation.isPending}
          >
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FLOOR_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

export default function BusinessSettings() {
  const { selectedStore } = useSelectedStore();
  const inShell = useInSettingsShell();

  const { data: store, isLoading } = useQuery<Store>({
    queryKey: ["/api/stores", selectedStore?.id],
    enabled: !!selectedStore?.id,
  });

  if (isLoading || !store) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-24 text-muted-foreground">Loading…</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl px-4 py-6 md:px-8">
        {!inShell && (
          <header className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight">Business Details</h1>
            <p className="mt-1 text-sm text-muted-foreground">Store name, legal structure and contact details.</p>
          </header>
        )}
        <div className="space-y-8">
          <BusinessProfile store={store} />
          <TimeclockSettings />
        </div>
      </div>
    </AppLayout>
  );
}
