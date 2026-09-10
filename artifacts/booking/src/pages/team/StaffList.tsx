import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Search, ChevronRight } from "lucide-react";
import { useSelectedStore } from "@/hooks/use-store";

interface StaffRow {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  employmentType: string | null;
  status: string | null;
  avatarThumbUrl: string | null;
  avatarUrl: string | null;
}

export default function StaffList() {
  const navigate = useNavigate();
  const { selectedStore } = useSelectedStore();
  const [q, setQ] = useState("");

  const { data: staff = [], isLoading } = useQuery<StaffRow[]>({
    queryKey: ["/api/staff", selectedStore?.id],
    queryFn: async () => {
      const res = await fetch("/api/staff", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load staff");
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  const people = useMemo(() => {
    const active = staff.filter((s) => (s.status ?? "active") !== "removed");
    const term = q.trim().toLowerCase();
    if (!term) return active;
    return active.filter(
      (s) =>
        s.name.toLowerCase().includes(term) ||
        (s.email ?? "").toLowerCase().includes(term) ||
        (s.phone ?? "").includes(term),
    );
  }, [staff, q]);

  return (
    <AppLayout>
      <div className="mx-auto max-w-3xl px-4 py-6 md:px-8">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Staff</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {people.length} {people.length === 1 ? "member" : "members"}
            </p>
          </div>
          <Button onClick={() => navigate("/team/add")} data-testid="add-staff">
            <Plus className="mr-1.5 h-4 w-4" /> Add Staff
          </Button>
        </header>

        <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, email or phone"
            className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : people.length === 0 ? (
          <div className="rounded-xl border border-dashed p-10 text-center">
            <p className="text-sm text-muted-foreground">No team members yet.</p>
            <Button className="mt-4" onClick={() => navigate("/team/add")}>
              <Plus className="mr-1.5 h-4 w-4" /> Add your first staff member
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="hidden grid-cols-[1.5fr_1.5fr_1fr_auto] gap-4 border-b border-border bg-muted/30 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
              <span>Name</span>
              <span>Email</span>
              <span>Phone</span>
              <span />
            </div>
            {people.map((s) => (
              <button
                key={s.id}
                onClick={() => navigate(`/team/${s.id}`)}
                data-testid={`staff-row-${s.id}`}
                className="grid w-full grid-cols-[1fr_auto] items-center gap-4 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/40 sm:grid-cols-[1.5fr_1.5fr_1fr_auto]"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                    {s.avatarThumbUrl || s.avatarUrl ? (
                      <img src={s.avatarThumbUrl ?? s.avatarUrl ?? ""} alt="" className="h-full w-full object-cover" />
                    ) : (
                      initials(s.name)
                    )}
                  </span>
                  <span className="truncate text-[15px] font-medium">{s.name}</span>
                </div>
                <span className="hidden truncate text-sm text-muted-foreground sm:block">{s.email || "—"}</span>
                <span className="hidden truncate text-sm text-muted-foreground sm:block">{s.phone || "—"}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
