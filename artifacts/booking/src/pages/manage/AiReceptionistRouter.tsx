import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import AiReceptionistCallLogs from "./AiReceptionistCallLogs";
import AiReceptionistEnrollment from "./AiReceptionistEnrollment";

interface Settings {
  phoneProvisioned: boolean;
}

async function fetchSettings(): Promise<Settings> {
  const res = await fetch("/api/ai-receptionist/settings", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load settings");
  return res.json();
}

export default function AiReceptionistRouter() {
  const { data: settings, isLoading, isError } = useQuery<Settings>({
    queryKey: ["/api/ai-receptionist/settings"],
    queryFn: fetchSettings,
    staleTime: 30_000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-rose-400" />
      </div>
    );
  }

  if (isError || !settings) {
    return <AiReceptionistEnrollment />;
  }

  if (settings.phoneProvisioned) {
    return <AiReceptionistCallLogs />;
  }

  return <AiReceptionistEnrollment />;
}
