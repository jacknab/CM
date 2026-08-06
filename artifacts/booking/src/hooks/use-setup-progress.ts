import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export type FlowStatus = "not_started" | "in_progress" | "complete" | "skipped";
export type FlowCategory = "required" | "recommended" | "optional";

export interface FlowProgress {
  key: string;
  title: string;
  description: string;
  category: FlowCategory;
  estimatedMinutes: number;
  sortOrder: number;
  status: FlowStatus;
  completedAt: string | null;
}

export interface SetupProgressData {
  flows: FlowProgress[];
  dismissed: boolean;
}

async function fetchSetupProgress(): Promise<SetupProgressData> {
  const res = await fetch("/api/setup/progress", { credentials: "include" });
  if (!res.ok) throw new Error("Failed to load setup progress");
  return res.json();
}

export function useSetupProgress() {
  return useQuery<SetupProgressData>({
    queryKey: ["setup-progress"],
    queryFn: fetchSetupProgress,
    staleTime: 30_000,
    retry: false,
  });
}

export function useUpdateFlowStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ flowKey, status }: { flowKey: string; status: FlowStatus }) => {
      const res = await fetch(`/api/setup/progress/${flowKey}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update flow status");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["setup-progress"] });
    },
  });
}

export function useDismissChecklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/setup/dismiss", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to dismiss checklist");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["setup-progress"] });
    },
  });
}

// Helpers
export function countCompleted(flows: FlowProgress[]): number {
  return flows.filter((f) => f.status === "complete" || f.status === "skipped").length;
}

export function getNextFlow(flows: FlowProgress[]): FlowProgress | null {
  return (
    flows.find(
      (f) => f.status !== "complete" && f.status !== "skipped" && f.category !== "optional"
    ) ??
    flows.find((f) => f.status !== "complete" && f.status !== "skipped") ??
    null
  );
}

export function flowToPath(key: string): string {
  const MAP: Record<string, string> = {
    business_setup: "/onboarding",
    services_menu: "/setup/service-import",
    team_members: "/setup/team",
    booking_calendar: "/setup/booking",
    pos_payments: "/setup/payments",
    commission_payroll: "/setup/payroll",
    website_setup:    "/setup/website",
    marketing_growth: "/setup/marketing",
    ai_receptionist: "/manage/ai-receptionist/setup",
  };
  return MAP[key] ?? "/setup";
}
