import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useSelectedStore } from "@/hooks/use-store";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Save, AlarmClock } from "lucide-react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Store } from "@shared/schema";

const businessProfileSchema = z.object({
  name: z.string().min(1, "Business name is required"),
  email: z.string().email("Please enter a valid email").or(z.literal("")),
  category: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  city: z.string().optional().default(""),
  state: z.string().optional().default(""),
  address: z.string().optional().default(""),
  postcode: z.string().optional().default(""),
});

type BusinessProfileForm = z.infer<typeof businessProfileSchema>;

export type SectionHandle = {
  save: () => void;
};

const CATEGORIES = [
  "Hair Salon",
  "Nail Salon",
  "Spa",
  "Barbershop",
  "Esthetician",
  "Pet Groomer",
  "Tattoo Studio",
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
  turnSystem: true,
  timeclock: true,
  waitlist: true,
  pos: true,
  rewardPoints: true,
  autoClockOutFloor: "01:00",
};

const BusinessProfile = forwardRef<SectionHandle, { store: Store }>(function BusinessProfile({ store }, ref) {
  const { toast } = useToast();

  const form = useForm<BusinessProfileForm>({
    resolver: zodResolver(businessProfileSchema) as Resolver<BusinessProfileForm>,
    defaultValues: {
      name: store.name || "",
      category: store.category || "",
      email: store.email || "",
      phone: store.phone || "",
      city: store.city || "",
      state: store.state || "",
      address: store.address || "",
      postcode: store.postcode || "",
    },
  });

  useEffect(() => {
    form.reset({
      name: store.name || "",
      category: store.category || "",
      email: store.email || "",
      phone: store.phone || "",
      city: store.city || "",
      state: store.state || "",
      address: store.address || "",
      postcode: store.postcode || "",
    });
  }, [store, form]);

  const updateStore = useMutation({
    mutationFn: async (data: BusinessProfileForm) => {
      const res = await apiRequest("PATCH", `/api/stores/${store.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stores"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stores", store.id] });
      toast({ title: "Profile saved", description: "Business profile has been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save profile.", variant: "destructive" });
    },
  });

  const onSubmit = (data: BusinessProfileForm) => {
    updateStore.mutate(data);
  };

  useImperativeHandle(ref, () => ({
    save: () => {
      form.handleSubmit(onSubmit)();
    },
  }));

  const isDirty = form.formState.isDirty;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        {isDirty && (
          <p className="text-xs text-amber-600 mb-4 flex items-center gap-1">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
            Unsaved changes
          </p>
        )}

        <Card>
          <CardContent className="p-6 space-y-6">

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-store-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger data-testid="select-category">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Business email</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} data-testid="input-email" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telephone</FormLabel>
                  <FormControl>
                    <Input type="tel" {...field} data-testid="input-phone" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="border-t pt-4">
              <h3 className="text-base font-semibold mb-4">Address</h3>

              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City or Town</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-city" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>State</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-state" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-address" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="postcode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Postcode</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-postcode" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
});

/*
 * ── StripePaymentsSettings ────────────────────────────────────────────────────
 * Commented out — Stripe keys are configured at the platform/server level via
 * environment variables (STRIPE_SECRET_KEY / STRIPE_PUBLISHABLE_KEY).
 * Per-store key entry is not needed and should not be exposed to salon owners.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/*
 * ── CancellationSettings removed ─────────────────────────────────────────────
 * Cancellation window, late grace period, and no-show handling all live in
 * Booking Policies (/booking-policies) to keep policy settings in one place.
 * ─────────────────────────────────────────────────────────────────────────────
 */


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
        serverFlags ?? { ...(old ?? DEFAULT_FLAGS), ...updates }
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
    <div>
      <h2 className="text-lg font-semibold mb-4">Timeclock Settings</h2>
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <AlarmClock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Auto Clock-Out Floor</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed mb-3">
                The earliest time (in your salon's local timezone) that staff can be automatically clocked out. Staff will never be auto-clocked out before this time, regardless of your configured business hours.
              </p>
              <Select
                value={current.autoClockOutFloor}
                onValueChange={(val) => {
                  if (!selectedStore?.id) return;
                  mutation.mutate({ updates: { autoClockOutFloor: val }, storeId: selectedStore.id });
                }}
                disabled={mutation.isPending}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FLOOR_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function BusinessSettings() {
  const { selectedStore } = useSelectedStore();

  const profileRef = useRef<SectionHandle>(null);

  const { data: store, isLoading } = useQuery<Store>({
    queryKey: ["/api/stores", selectedStore?.id],
    enabled: !!selectedStore?.id,
  });

  const handleSaveAll = () => {
    profileRef.current?.save();
  };

  if (isLoading || !store) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">Loading...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="sticky top-0 z-20 bg-background border-b px-6 py-4 -mx-6 -mt-6 mb-6 flex items-center justify-between">
        <h1 className="text-xl font-display font-bold" data-testid="text-page-title">Business Settings</h1>
        <Button
          onClick={handleSaveAll}
          className="bg-[#1a1f36] hover:bg-[#2d3452] text-white font-semibold px-6"
          data-testid="button-save-all"
        >
          <Save className="w-4 h-4 mr-2" />
          Save
        </Button>
      </div>
      <div className="space-y-8">
        <BusinessProfile ref={profileRef} store={store} />
        <TimeclockSettings />
      </div>
    </AppLayout>
  );
}
