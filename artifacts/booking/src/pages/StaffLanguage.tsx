import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check } from "lucide-react";
import { useCalendarSettings, useUpdateCalendarSettings } from "@/hooks/use-calendar-settings";
import { StaffPortalNav } from "@/components/StaffPortalNav";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "vi", label: "Tiếng Việt" },
] as const;

export default function StaffLanguage() {
  const navigate = useNavigate();
  const { data: calSettings } = useCalendarSettings();
  const updateSettings = useUpdateCalendarSettings();

  const currentLang = (calSettings as any)?.language ?? "en";
  const [selected, setSelected] = useState<string>(currentLang);

  const handleApply = async () => {
    await updateSettings.mutateAsync({ language: selected } as any);
    navigate(-1);
  };

  return (
    <div className="flex flex-col bg-white overflow-hidden" style={{ height: "100dvh" }}>
      {/* ── Header ── */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 border-b border-gray-100">
        <button
          className="w-9 h-9 flex items-center justify-center rounded-full active:bg-gray-100 transition-colors"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto flex flex-col px-6 pt-10">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Choose your language</h1>
        <p className="text-sm text-gray-500 mb-10 leading-relaxed">
          Your language preference can be changed at any time in settings.
        </p>

        {/* Language options */}
        <div className="space-y-0 divide-y divide-gray-100">
          {LANGUAGES.map(({ code, label }) => (
            <button
              key={code}
              onClick={() => setSelected(code)}
              className="w-full flex items-center justify-between py-4 active:bg-gray-50 transition-colors"
            >
              <span className={`text-[17px] ${selected === code ? "font-semibold text-gray-900" : "text-gray-500"}`}>
                {label}
              </span>
              {selected === code && (
                <Check className="w-5 h-5 text-indigo-500 shrink-0" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Apply button ── */}
      <div
        className="flex-shrink-0 px-5 pb-4 pt-3 bg-white"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }}
      >
        <button
          onClick={handleApply}
          disabled={updateSettings.isPending}
          className="w-full py-4 rounded-2xl bg-indigo-600 text-white text-[16px] font-bold flex items-center justify-center gap-2 active:bg-indigo-700 transition-colors disabled:opacity-60"
        >
          {updateSettings.isPending ? "Applying…" : "Apply"}
        </button>
      </div>

      <StaffPortalNav />
    </div>
  );
}
