import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { useStaffList } from "@/hooks/use-staff";
import { STAFF_COLORS } from "@/lib/staffColors";
import { useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import type { Staff } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Palette, Loader2, Check } from "lucide-react";
import { Card } from "@/components/ui/card";

export default function StaffCalendarColors() {
  const navigate = useNavigate();
  const { data: staffList = [], isLoading } = useStaffList();
  const staff = (staffList as Staff[]).filter(s => (s as any).status !== "removed");
  const qc = useQueryClient();
  const { toast } = useToast();

  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  // Track recently saved to show check icon briefly
  const [justSavedId, setJustSaved] = useState<number | null>(null);

  // Map color (lowercase) → staff who owns it
  const colorToStaff = new Map<string, Staff>();
  staff.forEach(s => {
    if (s.color) colorToStaff.set(s.color.toLowerCase(), s);
  });

  const assignColor = async (staffId: number, color: string) => {
    setSavingId(staffId);
    try {
      const url = buildUrl(api.staff.update.path, { id: staffId });
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ color }),
      });
      if (!res.ok) throw new Error("Failed");
      await qc.invalidateQueries({ queryKey: [api.staff.list.path] });
      setJustSaved(staffId);
      setTimeout(() => setJustSaved(null), 1400);
      toast({ title: "Color updated" });
    } catch {
      toast({ title: "Failed to update color", variant: "destructive" });
    } finally {
      setSavingId(null);
      setSelectedColor(null);
      setSelectedStaffId(null);
    }
  };

  const handleColorClick = (color: string) => {
    const colorLower = color.toLowerCase();
    const owner = colorToStaff.get(colorLower);

    // Rule: a taken color can only be "re-selected" if the owner is the currently selected staff
    // (i.e. you're changing their color away). Otherwise block it entirely.
    if (owner && owner.id !== selectedStaffId) return;

    if (selectedStaffId !== null) {
      // Staff already selected → assign immediately
      assignColor(selectedStaffId, color);
    } else {
      // Toggle color selection
      setSelectedColor(prev =>
        prev?.toLowerCase() === colorLower ? null : color
      );
    }
  };

  const handleStaffClick = (staffMember: Staff) => {
    if (savingId !== null) return;
    if (selectedColor !== null) {
      // Color already selected — only assign if it's actually available
      // (or it's the staff member's own current color)
      const colorLower = selectedColor.toLowerCase();
      const owner = colorToStaff.get(colorLower);
      if (owner && owner.id !== staffMember.id) {
        // That color belongs to someone else — clear selection and bail
        setSelectedColor(null);
        return;
      }
      assignColor(staffMember.id, selectedColor);
    } else {
      // Toggle staff selection
      setSelectedStaffId(prev =>
        prev === staffMember.id ? null : staffMember.id
      );
    }
  };

  const hasSelection = selectedColor !== null || selectedStaffId !== null;
  const selectedStaff = staff.find(s => s.id === selectedStaffId);

  return (
    <AppLayout>
    <div className="p-5 max-w-[720px] mx-auto space-y-6">
      {/* Back */}
      <button
        onClick={() => navigate("/team")}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Team Members
      </button>

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gray-100 flex items-center justify-center flex-shrink-0">
          <Palette className="w-5 h-5 text-gray-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Calendar Colors
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Tap a color, then a team member — or a team member, then a color.
          </p>
        </div>
      </div>

      {/* Selection hint bar */}
      {hasSelection && (
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3">
          {selectedColor && (
            <>
              <span
                className="w-5 h-5 rounded-full ring-2 ring-gray-700 ring-offset-1 flex-shrink-0"
                style={{ backgroundColor: selectedColor }}
              />
              <span className="text-sm font-medium text-gray-800">Color selected</span>
              <span className="text-sm text-gray-500">→ now tap a team member to assign it</span>
            </>
          )}
          {selectedStaffId && !selectedColor && (
            <>
              <span
                className="w-5 h-5 rounded-full ring-2 ring-gray-700 ring-offset-1 flex-shrink-0"
                style={{ backgroundColor: selectedStaff?.color ?? "#e5e7eb" }}
              />
              <span className="text-sm font-medium text-gray-800">{selectedStaff?.name} selected</span>
              <span className="text-sm text-gray-500">→ now tap a color to assign</span>
            </>
          )}
          <button
            onClick={() => { setSelectedColor(null); setSelectedStaffId(null); }}
            className="ml-auto text-xs text-gray-500 hover:text-gray-800 transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {/* Color palette */}
      <Card className="rounded-2xl border-gray-100 shadow-sm p-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Colors
        </p>
        <div className="flex flex-wrap gap-3">
          {/* Available colors first, then taken (dimmed) */}
          {[...STAFF_COLORS]
            .sort((a, b) => {
              const aOwned = colorToStaff.has(a.toLowerCase()) ? 1 : 0;
              const bOwned = colorToStaff.has(b.toLowerCase()) ? 1 : 0;
              return aOwned - bOwned;
            })
            .map(color => {
            const colorLower = color.toLowerCase();
            const owner = colorToStaff.get(colorLower);
            const isSelected = selectedColor?.toLowerCase() === colorLower;
            const isOwnerSelected = owner && owner.id === selectedStaffId;
            // Taken by someone other than the currently selected staff → blocked
            const isBlocked = !!owner && owner.id !== selectedStaffId;

            return (
              <button
                key={color}
                type="button"
                onClick={() => handleColorClick(color)}
                disabled={isBlocked}
                title={
                  isBlocked
                    ? `Assigned to ${owner!.name} — not available`
                    : owner
                      ? `Assigned to ${owner.name} (your color)`
                      : "Available"
                }
                className={[
                  "relative w-10 h-10 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
                  isSelected
                    ? "ring-[3px] ring-offset-2 ring-gray-700 scale-125 shadow-lg z-10"
                    : isOwnerSelected
                      ? "ring-[3px] ring-offset-2 ring-gray-800 scale-110 shadow-md"
                      : isBlocked
                        ? "opacity-30 cursor-not-allowed"
                        : "hover:scale-110 hover:shadow-md cursor-pointer",
                ].join(" ")}
                style={{ backgroundColor: color }}
              >
                {/* Owner initials bubble — only on blocked (taken by someone else) colors */}
                {isBlocked && owner && (
                  <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-white border border-gray-200 flex items-center justify-center text-[8px] font-bold text-gray-700 leading-none">
                    {(owner.name ?? "?").split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase()}
                  </span>
                )}
                {isSelected && (
                  <span className="absolute inset-0 rounded-full flex items-center justify-center">
                    <Check className="w-4 h-4 text-white drop-shadow-md" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-50">
          <span className="flex items-center gap-1.5 text-xs text-gray-400">
            <span className="w-3 h-3 rounded-full bg-gray-300 opacity-50" />
            Dimmed = already assigned
          </span>
          <span className="flex items-center gap-1.5 text-xs text-gray-400">
            <span className="w-3 h-3 rounded-full bg-gray-400" />
            Full = available
          </span>
        </div>
      </Card>

      {/* Staff grid */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Team Members
        </p>
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading team…</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {staff.map(member => {
              const isSelected = selectedStaffId === member.id;
              const isSaving = savingId === member.id;
              const isJustSaved = justSavedId === member.id;
              const initials = (member.name ?? "?")
                .split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase();

              // Determine if this staff's current color is the globally selected color
              const hasSelectedColor =
                selectedColor &&
                (member.color?.toLowerCase() === selectedColor.toLowerCase());

              return (
                <button
                  key={member.id}
                  type="button"
                  onClick={() => handleStaffClick(member)}
                  disabled={isSaving}
                  className={[
                    "flex items-center gap-3 p-4 rounded-2xl border text-left transition-all",
                    isSelected
                      ? "border-gray-900 bg-gray-50 ring-1 ring-gray-300 shadow-sm"
                      : hasSelectedColor
                        ? "border-gray-400 bg-gray-50"
                        : "border-gray-100 bg-white hover:border-gray-300 hover:bg-gray-50/70 shadow-sm",
                  ].join(" ")}
                >
                  {/* Avatar / color circle */}
                  <div className="relative flex-shrink-0">
                    {(member as any).avatarThumbUrl || member.avatarUrl ? (
                      <img
                        src={(member as any).avatarThumbUrl ?? member.avatarUrl!}
                        alt={member.name}
                        className="w-11 h-11 rounded-xl object-cover"
                      />
                    ) : (
                      <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center text-white text-sm font-bold"
                        style={{ backgroundColor: member.color ?? "#6366f1" }}
                      >
                        {initials}
                      </div>
                    )}
                    {/* Color dot overlay */}
                    {member.color && (
                      <span
                        className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white"
                        style={{ backgroundColor: member.color }}
                      />
                    )}
                  </div>

                  {/* Name + role */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{member.name}</p>
                    <p className="text-xs text-gray-400 capitalize truncate mt-0.5">
                      {(member as any).employmentType ?? member.role ?? "Team Member"}
                    </p>
                  </div>

                  {/* Right side: current color swatch + state icon */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isSaving ? (
                      <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                    ) : isJustSaved ? (
                      <span className="w-7 h-7 rounded-full bg-gray-900 flex items-center justify-center">
                        <Check className="w-3.5 h-3.5 text-white" />
                      </span>
                    ) : member.color ? (
                      <span
                        className={[
                          "w-7 h-7 rounded-full border-2",
                          isSelected ? "border-gray-900 scale-110" : "border-white shadow-sm",
                        ].join(" ")}
                        style={{ backgroundColor: member.color }}
                      />
                    ) : (
                      <span className="w-7 h-7 rounded-full border-2 border-dashed border-gray-300" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
    </AppLayout>
  );
}
