import { useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCalendarSettings, useUpdateCalendarSettings } from "@/hooks/use-calendar-settings";
import { useToast } from "@/hooks/use-toast";
import { useForm, Controller } from "react-hook-form";
import { Save, Languages } from "lucide-react";

type LanguageForm = {
  language: string;
};

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "vi", label: "Tiếng Việt (Vietnamese)" },
  { value: "es", label: "Español (Spanish)" },
  { value: "fr", label: "Français (French)" },
];

export default function LanguageSettings() {
  const { data: settings, isLoading } = useCalendarSettings();
  const updateSettings = useUpdateCalendarSettings();
  const { toast } = useToast();

  const { control, handleSubmit, reset } = useForm<LanguageForm>({
    defaultValues: { language: "en" },
  });

  useEffect(() => {
    if (settings) {
      reset({ language: (settings as any).language ?? "en" });
    }
  }, [settings, reset]);

  const onSubmit = (data: LanguageForm) => {
    updateSettings.mutate(data, {
      onSuccess: () => {
        toast({ title: "Language saved", description: "Your language preference has been updated." });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to save language.", variant: "destructive" });
      },
    });
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20 text-muted-foreground">Loading…</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
              <Languages className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold">Language</h1>
              <p className="text-sm text-muted-foreground">Display language for staff-facing screens</p>
            </div>
          </div>
          <Button type="submit" disabled={updateSettings.isPending}>
            <Save className="w-4 h-4 mr-2" />
            {updateSettings.isPending ? "Saving…" : "Save"}
          </Button>
        </div>

        <Card>
          <CardContent className="p-6 space-y-6">
            <div className="space-y-2">
              <Label>Display language</Label>
              <Controller
                name="language"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-72">
                      {/* Pass children so Radix knows what label to display for the
                          controlled value without requiring the portal to be opened first.
                          Fallback to undefined (not "") so Radix renders the placeholder
                          if the stored value isn't in the known language list. */}
                      <SelectValue placeholder="Select language">
                        {LANGUAGES.find((l) => l.value === field.value)?.label}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((l) => (
                        <SelectItem key={l.value} value={l.value}>
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-xs text-muted-foreground">
                Currently applies to the TURN queue overlay — queue order explanations and rotation rules shown to staff.
              </p>
            </div>
          </CardContent>
        </Card>
      </form>
    </AppLayout>
  );
}
