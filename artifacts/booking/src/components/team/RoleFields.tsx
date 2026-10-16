import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { defaultTakesTurns, FRONT_DESK, rolesForBusinessType } from "@shared/staffRoles";

/**
 * A staff member's role (from the business type's list, shared/staffRoles.ts) and whether they take
 * turns. Picking a role sets "Takes turns" to that role's default; the owner can change it after.
 */
export function RoleFields({ category, role, takesTurns, onRole, onTakesTurns }: {
  /** The store's business type (locations.category). */
  category: string | null | undefined;
  role: string;
  takesTurns: boolean;
  onRole: (role: string) => void;
  onTakesTurns: (takesTurns: boolean) => void;
}) {
  const roles = rolesForBusinessType(category);
  // A role typed in by an older screen stays selectable rather than silently changing.
  const options = roles.includes(role) || !role ? roles : [...roles, role];
  const posIdStore = /barber|nail/i.test(category ?? "");
  return (
    <>
      <div className="space-y-1.5">
        <label className="text-[15px] font-medium">Role</label>
        <Select value={role} onValueChange={(next) => { onRole(next); onTakesTurns(defaultTakesTurns(next)); }}>
          <SelectTrigger className="text-[15px]" data-testid="select-staff-role"><SelectValue /></SelectTrigger>
          <SelectContent>
            {options.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        {posIdStore && role === FRONT_DESK && (
          <p className="text-sm text-muted-foreground">Front desk staff sign in on the POS with an ID from 90 to 99, and the screen locks on them only after 2 idle minutes.</p>
        )}
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
        <div>
          <p className="text-[15px] font-medium">Takes turns</p>
          <p className="text-sm text-muted-foreground">Joins the turn line when clocked in. Off for front desk.</p>
        </div>
        <Switch checked={takesTurns} onCheckedChange={onTakesTurns} data-testid="switch-staff-takes-turns" />
      </div>
    </>
  );
}
