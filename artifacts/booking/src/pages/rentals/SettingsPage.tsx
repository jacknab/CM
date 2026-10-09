import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import RentalsTopBar from "@/components/rentals/RentalsTopBar";
import { useToast } from "@/hooks/use-toast";
import { fetchFacilitySettings, updateFacilitySettings, type FacilitySettingsFormValues } from "@/lib/rentals-api";

const SETTINGS_QUERY_KEY = ["/api/rentals/settings"] as const;

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: fetchFacilitySettings,
  });

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postcode, setPostcode] = useState("");

  useEffect(() => {
    if (!data) return;
    setName(data.name ?? "");
    setAddress(data.address ?? "");
    setCity(data.city ?? "");
    setState(data.state ?? "");
    setPostcode(data.postcode ?? "");
  }, [data]);

  const mutation = useMutation({
    mutationFn: (values: FacilitySettingsFormValues) => updateFacilitySettings(values),
    onSuccess: (updated) => {
      queryClient.setQueryData(SETTINGS_QUERY_KEY, updated);
      toast({ title: "Settings saved" });
    },
    onError: () => {
      toast({ title: "Couldn't save settings", description: "Please try again.", variant: "destructive" });
    },
  });

  const canSubmit = name.trim().length > 0 && !mutation.isPending && !isLoading;

  return (
    <div className="flex h-full flex-col">
      <RentalsTopBar title="Settings" />
      <div className="flex-1 overflow-y-auto px-5 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-lg">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!canSubmit) return;
              mutation.mutate({
                name: name.trim(),
                address: address.trim() || null,
                city: city.trim() || null,
                state: state.trim() || null,
                postcode: postcode.trim() || null,
              });
            }}
          >
            <FormSection title="Facility">
              <Field label="Name">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Downtown Suites"
                  className={inputClass}
                />
              </Field>
            </FormSection>

            <FormSection title="Location" className="mt-6">
              <Field label="Address">
                <input
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="City">
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="State">
                  <input
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className={inputClass}
                  />
                </Field>
              </div>
              <Field label="Postcode">
                <input
                  value={postcode}
                  onChange={(e) => setPostcode(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Timezone" hint="Automatically set from your address above">
                <div className={`${inputClass} bg-neutral-50 text-neutral-500`}>
                  {data?.timezone ?? "—"}
                </div>
              </Field>
            </FormSection>

            <div className="mt-8 flex items-center gap-2">
              <button
                type="submit"
                disabled={!canSubmit}
                className="rounded-md bg-neutral-900 px-4 py-2.5 text-[13px] font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {mutation.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-[13px] text-neutral-800 outline-none focus:border-neutral-400";

function FormSection({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="font-[Outfit] text-[12px] font-semibold uppercase tracking-wide text-neutral-400">{title}</p>
      <div className="mt-2.5 space-y-3.5">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] font-medium text-neutral-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] text-neutral-400">{hint}</span>}
    </label>
  );
}
