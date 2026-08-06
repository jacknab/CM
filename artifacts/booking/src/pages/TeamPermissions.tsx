import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { PERMISSIONS, type Permission } from "@shared/permissions";
import { useSelectedStore } from "@/hooks/use-store";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save } from "lucide-react";

// ─── Permission groups (rows) ─────────────────────────────────────────────────
const PERM_GROUPS: { label: string; perms: { key: Permission; label: string }[] }[] = [
  {
    label: "Calendar & Appointments",
    perms: [
      { key: PERMISSIONS.APPOINTMENTS_VIEW_OWN,       label: "View own appointments" },
      { key: PERMISSIONS.APPOINTMENTS_VIEW_ALL,       label: "View all appointments" },
      { key: PERMISSIONS.APPOINTMENTS_EDIT,           label: "Edit appointments" },
      { key: PERMISSIONS.APPOINTMENTS_MARK_COMPLETE,  label: "Mark appointment as complete" },
      { key: PERMISSIONS.APPOINTMENTS_RESCHEDULE,     label: "Reschedule appointments" },
      { key: PERMISSIONS.APPOINTMENTS_CANCEL,         label: "Cancel appointments" },
      { key: PERMISSIONS.APPOINTMENTS_DELETE,         label: "Delete appointments" },
      { key: PERMISSIONS.APPOINTMENTS_OVERRIDE_RULES, label: "Override booking rules" },
      { key: PERMISSIONS.WAITLIST_ACCESS,             label: "Access waitlist" },
    ],
  },
  {
    label: "Clients",
    perms: [
      { key: PERMISSIONS.CUSTOMERS_VIEW,         label: "View clients" },
      { key: PERMISSIONS.CUSTOMERS_VIEW_CONTACT, label: "View contact info (phone/email)" },
      { key: PERMISSIONS.CUSTOMERS_EDIT,         label: "Edit clients" },
      { key: PERMISSIONS.CUSTOMERS_DELETE,       label: "Delete clients" },
      { key: PERMISSIONS.CUSTOMERS_EXPORT,       label: "Export client list" },
      { key: PERMISSIONS.CUSTOMERS_IMPORT,       label: "Import clients" },
    ],
  },
  {
    label: "Payments & Checkout",
    perms: [
      { key: PERMISSIONS.POS_USE,           label: "Use POS" },
      { key: PERMISSIONS.CHECKOUT_CLIENTS,  label: "Check out clients" },
      { key: PERMISSIONS.PAYMENTS_VIEW,     label: "View payment history" },
      { key: PERMISSIONS.DISCOUNTS_APPLY,   label: "Apply discounts" },
      { key: PERMISSIONS.REFUNDS_ISSUE,     label: "Issue refunds" },
      { key: PERMISSIONS.VOID_TRANSACTIONS, label: "Void transactions" },
      { key: PERMISSIONS.CASH_DRAWER_VIEW,  label: "View cash drawer" },
      { key: PERMISSIONS.CASH_DRAWER_CLOSE, label: "Close cash drawer" },
    ],
  },
  {
    label: "Catalog & Inventory",
    perms: [
      { key: PERMISSIONS.SERVICES_MANAGE,  label: "Manage services" },
      { key: PERMISSIONS.PRODUCTS_MANAGE,  label: "Manage retail products" },
      { key: PERMISSIONS.PRICING_VIEW,     label: "View pricing" },
      { key: PERMISSIONS.PRICING_EDIT,     label: "Edit pricing" },
      { key: PERMISSIONS.INVENTORY_MANAGE, label: "Manage inventory & stock" },
    ],
  },
  {
    label: "Reports & Commissions",
    perms: [
      { key: PERMISSIONS.REPORTS_VIEW,        label: "View reports" },
      { key: PERMISSIONS.REPORTS_FINANCIAL,   label: "View financial reports" },
      { key: PERMISSIONS.REPORTS_EXPORT,      label: "Export reports" },
      { key: PERMISSIONS.COMMISSIONS_VIEW_ALL, label: "View all commissions" },
      { key: PERMISSIONS.COMMISSIONS_VIEW_OWN, label: "View own commissions" },
    ],
  },
  {
    label: "Marketing",
    perms: [
      { key: PERMISSIONS.MARKETING_SMS,   label: "Send SMS campaigns" },
      { key: PERMISSIONS.MARKETING_EMAIL, label: "Send email campaigns" },
      { key: PERMISSIONS.REVIEW_REQUESTS, label: "Send review requests" },
    ],
  },
  {
    label: "Engagement",
    perms: [
      { key: PERMISSIONS.GIFT_CARDS_MANAGE,    label: "Manage gift cards" },
      { key: PERMISSIONS.LOYALTY_MANAGE,       label: "Manage loyalty program" },
      { key: PERMISSIONS.INTAKE_FORMS_MANAGE,  label: "Manage intake forms" },
    ],
  },
  {
    label: "Team & Settings",
    perms: [
      { key: PERMISSIONS.STAFF_MANAGE,             label: "Manage team members" },
      { key: PERMISSIONS.STAFF_INVITE,             label: "Invite team members" },
      { key: PERMISSIONS.STAFF_REMOVE,             label: "Remove team members" },
      { key: PERMISSIONS.STAFF_PERMISSIONS_MANAGE, label: "Edit team permissions" },
      { key: PERMISSIONS.STORE_SETTINGS,           label: "Edit store settings" },
      { key: PERMISSIONS.INTEGRATIONS_MANAGE,      label: "Manage integrations" },
      { key: PERMISSIONS.BILLING_MANAGE,           label: "Manage billing & subscription" },
      { key: PERMISSIONS.STORE_DELETE,             label: "Delete stores" },
    ],
  },
];

// ─── Default level sets ───────────────────────────────────────────────────────
const DEFAULT_LEVEL1 = new Set<Permission>([
  PERMISSIONS.APPOINTMENTS_VIEW_OWN, PERMISSIONS.APPOINTMENTS_EDIT,
  PERMISSIONS.APPOINTMENTS_MARK_COMPLETE,
  PERMISSIONS.CUSTOMERS_VIEW,
  PERMISSIONS.CUSTOMERS_VIEW_CONTACT, PERMISSIONS.PRICING_VIEW,
  PERMISSIONS.POS_USE, PERMISSIONS.CHECKOUT_CLIENTS,
  PERMISSIONS.DISCOUNTS_APPLY, PERMISSIONS.COMMISSIONS_VIEW_OWN,
  PERMISSIONS.WAITLIST_ACCESS,
]);

const DEFAULT_LEVEL2 = new Set<Permission>([
  ...DEFAULT_LEVEL1,
  PERMISSIONS.APPOINTMENTS_VIEW_ALL, PERMISSIONS.APPOINTMENTS_RESCHEDULE,
  PERMISSIONS.APPOINTMENTS_CANCEL, PERMISSIONS.APPOINTMENTS_DELETE,
  PERMISSIONS.CUSTOMERS_EDIT, PERMISSIONS.PAYMENTS_VIEW,
  PERMISSIONS.REPORTS_VIEW, PERMISSIONS.SERVICES_MANAGE,
  PERMISSIONS.REVIEW_REQUESTS, PERMISSIONS.COMMISSIONS_VIEW_ALL,
  PERMISSIONS.CASH_DRAWER_VIEW,
]);

const DEFAULT_LEVEL3 = new Set<Permission>([
  ...DEFAULT_LEVEL2,
  PERMISSIONS.APPOINTMENTS_OVERRIDE_RULES, PERMISSIONS.CUSTOMERS_DELETE,
  PERMISSIONS.CUSTOMERS_EXPORT, PERMISSIONS.CUSTOMERS_IMPORT,
  PERMISSIONS.PRODUCTS_MANAGE, PERMISSIONS.PRICING_EDIT,
  PERMISSIONS.INVENTORY_MANAGE, PERMISSIONS.REFUNDS_ISSUE,
  PERMISSIONS.CASH_DRAWER_CLOSE, PERMISSIONS.REPORTS_FINANCIAL,
  PERMISSIONS.REPORTS_EXPORT, PERMISSIONS.MARKETING_SMS,
  PERMISSIONS.MARKETING_EMAIL, PERMISSIONS.GIFT_CARDS_MANAGE,
  PERMISSIONS.LOYALTY_MANAGE, PERMISSIONS.INTAKE_FORMS_MANAGE,
  PERMISSIONS.STAFF_MANAGE, PERMISSIONS.STAFF_INVITE,
  PERMISSIONS.STORE_SETTINGS,
]);

type LevelMatrix = { level1: string[]; level2: string[]; level3: string[] };
type LevelKey = "level1" | "level2" | "level3";

const LEVELS: { key: LevelKey; label: string; sublabel: string }[] = [
  { key: "level1", label: "Level 1", sublabel: "Basic" },
  { key: "level2", label: "Level 2", sublabel: "Standard" },
  { key: "level3", label: "Level 3", sublabel: "Advanced" },
];

export default function TeamPermissions() {
  const { selectedStore } = useSelectedStore();
  const { toast } = useToast();

  const { data: saved, isLoading } = useQuery<LevelMatrix>({
    queryKey: ["/api/settings/permission-levels", selectedStore?.id],
    queryFn: async () => {
      if (!selectedStore?.id) throw new Error("No store");
      const res = await fetch(`/api/settings/permission-levels?storeId=${selectedStore.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    enabled: !!selectedStore?.id,
  });

  const [matrix, setMatrix] = useState<Record<LevelKey, Set<string>>>({
    level1: new Set(DEFAULT_LEVEL1),
    level2: new Set(DEFAULT_LEVEL2),
    level3: new Set(DEFAULT_LEVEL3),
  });
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (saved) {
      setMatrix({
        level1: new Set(saved.level1),
        level2: new Set(saved.level2),
        level3: new Set(saved.level3),
      });
      setDirty(false);
    }
  }, [saved]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/settings/permission-levels?storeId=${selectedStore?.id}`, {
        level1: [...matrix.level1],
        level2: [...matrix.level2],
        level3: [...matrix.level3],
      });
      if (!res.ok) throw new Error("Failed to save");
      return res.json();
    },
    onSuccess: () => {
      setDirty(false);
      toast({ title: "Permission levels saved" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save permission levels.", variant: "destructive" });
    },
  });

  function toggle(level: LevelKey, perm: string) {
    setMatrix((prev) => {
      const next = { ...prev, [level]: new Set(prev[level]) };
      if (next[level].has(perm)) next[level].delete(perm);
      else next[level].add(perm);
      return next;
    });
    setDirty(true);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-xl font-bold">Permission Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Define what each permission level can see and do. Assign levels to staff members in their profile.
          </p>
        </div>
        <Button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !dirty}
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save
        </Button>
      </div>

      {/* ── Matrix table ── */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {PERM_GROUPS.map((group, gi) => (
          <div key={group.label}>
            {/* Section header row */}
            <div className={`grid border-b ${gi > 0 ? "border-t border-border/60" : ""}`}
              style={{ gridTemplateColumns: "1fr 88px 88px 88px 88px" }}>
              <div className="px-5 py-3 font-semibold text-sm bg-muted/40">
                {group.label}
              </div>
              {LEVELS.map((lv) => (
                <div key={lv.key} className="px-2 py-3 text-center bg-muted/40 border-l border-border/40">
                  <div className="text-xs font-semibold text-foreground">{lv.label}</div>
                  <div className="text-[10px] text-muted-foreground">{lv.sublabel}</div>
                </div>
              ))}
              <div className="px-2 py-3 text-center bg-muted/60 border-l border-border/40">
                <div className="text-xs font-semibold text-foreground">Owner</div>
                <div className="text-[10px] text-muted-foreground">Full access</div>
              </div>
            </div>

            {/* Permission rows */}
            {group.perms.map((p, pi) => (
              <div
                key={p.key}
                className={`grid items-center border-b border-border/30 hover:bg-muted/20 transition-colors ${
                  pi === group.perms.length - 1 ? "border-b-0" : ""
                }`}
                style={{ gridTemplateColumns: "1fr 88px 88px 88px 88px" }}
              >
                <div className="px-5 py-3 text-sm text-foreground/80">{p.label}</div>

                {LEVELS.map((lv) => (
                  <div key={lv.key} className="flex items-center justify-center py-3 border-l border-border/20">
                    <Checkbox
                      checked={matrix[lv.key].has(p.key)}
                      onCheckedChange={() => toggle(lv.key, p.key)}
                      className="h-4 w-4"
                    />
                  </div>
                ))}

                {/* Owner — always checked, disabled */}
                <div className="flex items-center justify-center py-3 border-l border-border/20 bg-muted/10">
                  <Checkbox
                    checked={true}
                    disabled={true}
                    className="h-4 w-4 opacity-40"
                  />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground mt-4">
        Owners always have every permission. Assign a permission level to each staff member from their profile page.
      </p>
    </div>
  );
}
