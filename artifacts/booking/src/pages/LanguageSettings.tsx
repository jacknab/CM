import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { useInSettingsShell } from "@/lib/settings-shell-context";
import { useToast } from "@/hooks/use-toast";
import { useCalendarSettings, useUpdateCalendarSettings } from "@/hooks/use-calendar-settings";
import { Loader2, Languages, Check } from "lucide-react";

const LANGUAGES = [
  { value: "en", label: "English", native: "English" },
  { value: "vi", label: "Vietnamese", native: "Tiếng Việt" },
  { value: "es", label: "Spanish", native: "Español" },
  { value: "fr", label: "French", native: "Français" },
];

export default function LanguageSettings() {
  const { data: settings, isLoading } = useCalendarSettings();
  const updateSettings = useUpdateCalendarSettings();
  const { toast } = useToast();
  const inShell = useInSettingsShell();

  const current = (settings as any)?.language ?? "en";

  function selectLanguage(value: string) {
    if (value === current || updateSettings.isPending) return;
    updateSettings.mutate(
      { language: value },
      {
        onSuccess: () => {
          toast({ title: "Language saved", description: "Your language preference has been updated." });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to save language.", variant: "destructive" });
        },
      }
    );
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl px-4 py-6 md:px-8">
        {!inShell && (
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight">Language</h1>
            <p className="text-sm text-muted-foreground mt-1">Display language for staff-facing screens</p>
          </div>
        )}

      <div className="space-y-3">
        {LANGUAGES.map((lang) => {
          const isActive = current === lang.value;
          return (
            <Card
              key={lang.value}
              role="button"
              tabIndex={0}
              onClick={() => selectLanguage(lang.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  selectLanguage(lang.value);
                }
              }}
              className={`cursor-pointer transition-colors ${
                isActive ? "border-indigo-400 ring-1 ring-indigo-300 bg-indigo-50/40" : "hover:border-slate-300"
              } ${updateSettings.isPending ? "opacity-70 pointer-events-none" : ""}`}
            >
              <CardContent className="p-5 flex items-center justify-between gap-3">
                <div>
                  <span className="block text-sm font-medium">{lang.label}</span>
                  <span className="block text-xs text-muted-foreground mt-1">{lang.native}</span>
                </div>
                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center flex-shrink-0 ${
                    isActive ? "bg-indigo-600 border-indigo-600" : "border-slate-300"
                  }`}
                >
                  {isActive && <Check className="w-3.5 h-3.5 text-white" />}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground mt-4">
        Currently applies to the TURN queue overlay — queue order explanations and rotation rules shown to staff.
      </p>
      </div>
    </AppLayout>
  );
}
