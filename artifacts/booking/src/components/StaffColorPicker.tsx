import { STAFF_COLORS } from "@/lib/staffColors";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface StaffColorPickerProps {
  value: string | null | undefined;
  /** Colors already claimed by OTHER staff members — rendered as disabled */
  takenColors?: string[];
  onChange: (color: string) => void;
}

export function StaffColorPicker({ value, takenColors = [], onChange }: StaffColorPickerProps) {
  // Normalise to lowercase for comparison
  const taken = new Set(takenColors.map(c => c.toLowerCase()));
  const current = (value ?? "").toLowerCase();

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-wrap gap-2">
        {STAFF_COLORS.map(color => {
          const colorLower = color.toLowerCase();
          const isSelected = colorLower === current;
          const isTaken = taken.has(colorLower) && !isSelected;

          return (
            <Tooltip key={color}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled={isTaken}
                  onClick={() => !isTaken && onChange(color)}
                  aria-label={isTaken ? `${color} — already in use` : `Select ${color}`}
                  className={[
                    "w-7 h-7 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
                    isSelected
                      ? "ring-2 ring-offset-2 ring-gray-600 scale-110 shadow-md"
                      : isTaken
                        ? "opacity-25 cursor-not-allowed"
                        : "hover:scale-110 hover:shadow-sm cursor-pointer",
                  ].join(" ")}
                  style={{ backgroundColor: color }}
                />
              </TooltipTrigger>
              {isTaken && (
                <TooltipContent side="top" className="text-xs">
                  Already assigned to another team member
                </TooltipContent>
              )}
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
