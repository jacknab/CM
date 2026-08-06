import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { useStaffList, useCreateStaff } from "@/hooks/use-staff";
import { StaffColorPicker } from "@/components/StaffColorPicker";
import { STAFF_COLORS } from "@/lib/staffColors";
import { useSelectedStore } from "@/hooks/use-store";
import { useToast } from "@/hooks/use-toast";
import type { Staff } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  UserPlus,
  Search,
  Loader2,
  Users,
  MoreVertical,
  Scissors,
  CalendarDays,
  ShieldCheck,
  Link as LinkIcon,
  ChevronDown,
} from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  stylist:      "Stylist",
  booth_renter: "Booth Renter",
  receptionist: "Receptionist",
  assistant:    "Assistant",
  manager:      "Manager",
  marketer:     "Marketer",
  accountant:   "Accountant",
  owner:        "Owner",
  custom:       "Custom",
};

// ─── Add Member Dialog ─────────────────────────────────────────────────────────

function AddMemberDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { selectedStore } = useSelectedStore();
  const { mutate: createStaff, isPending } = useCreateStaff();
  const { data: staffList = [] } = useStaffList();
  const { toast } = useToast();
  const navigate = useNavigate();

  const takenColors = (staffList as Staff[]).filter(s => !!s.color).map(s => s.color as string);
  const takenSet = new Set(takenColors.map(c => c.toLowerCase()));
  const defaultColor = STAFF_COLORS.find(c => !takenSet.has(c.toLowerCase())) ?? STAFF_COLORS[0];

  const [form, setForm] = useState({
    name: "", email: "", phone: "", role: "stylist", color: defaultColor as string,
  });

  const handleOpen = () => {
    const freshTaken = new Set((staffList as Staff[]).filter(s => !!s.color).map(s => (s.color as string).toLowerCase()));
    const freshDefault = STAFF_COLORS.find(c => !freshTaken.has(c.toLowerCase())) ?? STAFF_COLORS[0];
    setForm({ name: "", email: "", phone: "", role: "stylist", color: freshDefault });
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    createStaff(
      { name: form.name.trim(), email: form.email.trim() || null, phone: form.phone.trim() || null, role: form.role, color: form.color || null, storeId: selectedStore?.id ?? null } as any,
      {
        onSuccess: (created: Staff) => {
          toast({ title: `${form.name} added to your team!` });
          onClose();
          setForm({ name: "", email: "", phone: "", role: "stylist", color: defaultColor });
          navigate(`/team/${created.id}`);
        },
        onError: (err: any) => {
          if (err.upgradeRequired) {
            toast({ title: "Plan upgrade required", description: "You've reached the team member limit for your current plan.", variant: "destructive" });
          } else {
            toast({ title: "Failed to add team member", variant: "destructive" });
          }
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (v) handleOpen(); else onClose(); }}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-gray-900">
            Add team member
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div>
            <Label className="text-xs font-medium text-gray-500 mb-1.5 block uppercase tracking-wide">Full Name *</Label>
            <Input placeholder="e.g. Jordan Smith" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="rounded-xl h-11" />
          </div>
          <div>
            <Label className="text-xs font-medium text-gray-500 mb-1.5 block uppercase tracking-wide">Email</Label>
            <Input type="email" placeholder="jordan@example.com" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="rounded-xl h-11" />
          </div>
          <div>
            <Label className="text-xs font-medium text-gray-500 mb-1.5 block uppercase tracking-wide">Phone</Label>
            <Input type="tel" placeholder="(555) 000-0000" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className="rounded-xl h-11" />
          </div>
          <div>
            <Label className="text-xs font-medium text-gray-500 mb-1.5 block uppercase tracking-wide">Role</Label>
            <Select value={form.role} onValueChange={v => setForm(p => ({ ...p, role: v }))}>
              <SelectTrigger className="rounded-xl h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ROLE_LABELS).filter(([k]) => k !== "owner").map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs font-medium text-gray-500 mb-2 block uppercase tracking-wide">Calendar Color</Label>
            <StaffColorPicker value={form.color} takenColors={takenColors} onChange={c => setForm(p => ({ ...p, color: c }))} />
          </div>
        </div>
        <DialogFooter className="pt-4 gap-2">
          <Button variant="outline" onClick={onClose} className="rounded-full px-5">Cancel</Button>
          <Button onClick={handleSubmit} disabled={isPending || !form.name.trim()} className="rounded-full bg-gray-900 hover:bg-gray-800 text-white px-6 gap-2">
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Add member
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Indeterminate Checkbox ────────────────────────────────────────────────────

function IndeterminateCheckbox({ checked, indeterminate, onChange }: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (v: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={e => onChange(e.target.checked)}
      className="w-[18px] h-[18px] rounded border-gray-300 accent-gray-900 cursor-pointer flex-shrink-0"
      onClick={e => e.stopPropagation()}
    />
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function TeamMembers() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: staffList = [], isLoading } = useStaffList();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [addOpen, setAddOpen] = useState(false);

  const filtered = (staffList as Staff[]).filter(s => {
    if ((s as any).status === "removed") return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.name?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q) ||
      s.phone?.toLowerCase().includes(q) ||
      s.role?.toLowerCase().includes(q)
    );
  });

  const allChecked = filtered.length > 0 && filtered.every(s => selected.has(s.id));
  const someChecked = filtered.some(s => selected.has(s.id)) && !allChecked;

  const toggleAll = (v: boolean) => {
    setSelected(v ? new Set(filtered.map(s => s.id)) : new Set());
  };

  const toggleOne = (id: number, v: boolean) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (v) next.add(id); else next.delete(id);
      return next;
    });
  };

  const selCount = selected.size;
  const firstSelected = selCount === 1 ? filtered.find(s => selected.has(s.id)) : null;

  const handleEditServices  = () => { if (firstSelected) navigate(`/team/${firstSelected.id}?tab=services`); };
  const handleEditSchedule  = () => { if (firstSelected) navigate(`/team/${firstSelected.id}?tab=availability`); };
  const handleEditRoles     = () => { if (firstSelected) navigate(`/team/${firstSelected.id}?tab=settings`); };

  const copyBookingLink = (member: Staff) => {
    const url = `${window.location.origin}/booking?staff=${member.id}`;
    navigator.clipboard.writeText(url).then(() => toast({ title: "Booking link copied!" }));
  };

  const totalVisible = (staffList as Staff[]).filter(s => (s as any).status !== "removed").length;

  return (
    <AppLayout>
      <div className="max-w-[860px] mx-auto px-6 py-8">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-baseline gap-3">
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Staff</h1>
            {totalVisible > 0 && (
              <span className="text-lg font-normal text-gray-400">{totalVisible}</span>
            )}
          </div>
          <Button
            onClick={() => setAddOpen(true)}
            className="rounded-full bg-gray-900 hover:bg-gray-800 text-white px-6 h-10 text-sm font-medium"
          >
            Add
          </Button>
        </div>

        <p className="text-sm text-gray-500 mb-7">
          Manage your team members, their schedules, and service assignments.
        </p>

        {/* ── Search ── */}
        <div className="relative mb-4">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <Input
            placeholder="Search by name, phone number, or email address"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-11 rounded-full border-gray-200 bg-white h-11 text-sm shadow-none"
          />
        </div>

        {/* ── Action buttons ── */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          {[
            { label: "Edit Services",             action: handleEditServices },
            { label: "Edit Schedule",             action: handleEditSchedule },
            { label: "Edit Roles & Permissions",  action: handleEditRoles },
          ].map(({ label, action }) => (
            <button
              key={label}
              type="button"
              onClick={action}
              disabled={selCount !== 1}
              className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                selCount === 1
                  ? "border-gray-300 text-gray-800 bg-white hover:border-gray-400 hover:bg-gray-50"
                  : "border-gray-200 text-gray-400 bg-white cursor-default"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Table ── */}
        {isLoading ? (
          <div className="flex items-center gap-2 py-20 justify-center text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-24 flex flex-col items-center gap-4 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
              <Users className="w-7 h-7 text-gray-300" />
            </div>
            <div>
              <p className="text-base font-semibold text-gray-700">
                {search ? "No staff match your search" : "No team members yet"}
              </p>
              {!search && (
                <p className="text-sm text-gray-400 mt-1">Add your first team member to get started.</p>
              )}
            </div>
            {!search && (
              <Button
                onClick={() => setAddOpen(true)}
                className="rounded-full bg-gray-900 hover:bg-gray-800 text-white px-6 mt-2"
              >
                Add team member
              </Button>
            )}
          </div>
        ) : (
          <div>
            {/* Table header */}
            <div className="flex items-center gap-4 px-2 py-3 border-b border-gray-200">
              <IndeterminateCheckbox
                checked={allChecked}
                indeterminate={someChecked}
                onChange={toggleAll}
              />
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest flex-1">Name</span>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest w-32 hidden sm:block">Role</span>
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest w-28 hidden md:block">Services</span>
              <span className="w-9" />
            </div>

            {/* Rows */}
            {filtered.map((member: Staff) => {
              const status = (member as any).status ?? "active";
              const isInvitePending = status === "invited";
              const initials = member.name
                ? member.name.split(" ").map((p: string) => p[0]).slice(0, 2).join("").toUpperCase()
                : "?";
              const isChecked = selected.has(member.id);

              return (
                <div
                  key={member.id}
                  className={`flex items-center gap-4 px-2 py-4 border-b border-gray-100 group transition-colors cursor-pointer ${
                    isChecked ? "bg-gray-50/70" : "hover:bg-gray-50/50"
                  }`}
                  onClick={() => navigate(`/team/${member.id}`)}
                >
                  {/* Checkbox */}
                  <div onClick={e => e.stopPropagation()}>
                    <IndeterminateCheckbox
                      checked={isChecked}
                      onChange={v => toggleOne(member.id, v)}
                    />
                  </div>

                  {/* Avatar + Name */}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0">
                      {(member as any).avatarThumbUrl || member.avatarUrl ? (
                        <img
                          src={(member as any).avatarThumbUrl || member.avatarUrl!}
                          alt={member.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div
                          className="w-full h-full flex items-center justify-center text-white text-xs font-bold"
                          style={{ backgroundColor: member.color ?? "#d8b4fe" }}
                        >
                          {initials}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate leading-tight">
                        {member.name}
                      </p>
                      {member.email && (
                        <p className="text-xs text-gray-400 truncate leading-snug">{member.email}</p>
                      )}
                    </div>
                    {isInvitePending && (
                      <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">
                        Invite pending
                      </span>
                    )}
                  </div>

                  {/* Role */}
                  <span className="text-sm text-gray-600 w-32 hidden sm:block flex-shrink-0">
                    {ROLE_LABELS[(member as any).employmentType ?? member.role ?? "stylist"] ?? member.role}
                  </span>

                  {/* Services count */}
                  <span className="text-sm text-gray-400 w-28 hidden md:block flex-shrink-0">
                    Assign service
                  </span>

                  {/* Three-dot menu */}
                  <div onClick={e => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                          aria-label="Actions"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48 rounded-xl shadow-lg">
                        <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => navigate(`/team/${member.id}?tab=services`)}>
                          <Scissors className="w-4 h-4 text-gray-400" />
                          Edit Services
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => navigate(`/team/${member.id}?tab=availability`)}>
                          <CalendarDays className="w-4 h-4 text-gray-400" />
                          Edit Schedule
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => copyBookingLink(member)}>
                          <LinkIcon className="w-4 h-4 text-gray-400" />
                          Copy booking link
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <AddMemberDialog open={addOpen} onClose={() => setAddOpen(false)} />
      </div>
    </AppLayout>
  );
}
