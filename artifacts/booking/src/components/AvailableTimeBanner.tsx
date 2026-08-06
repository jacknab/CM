import { Timer } from "lucide-react";

interface AvailableTimeBannerProps {
  availableMinutes: number;
  usedMinutes?: number;
}

export function AvailableTimeBanner({ availableMinutes, usedMinutes = 0 }: AvailableTimeBannerProps) {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex items-start gap-3">
      <Timer className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-sm font-semibold text-blue-800">Available Time</p>
        <p className="text-xs text-blue-600 mt-0.5">
          You have {availableMinutes} minutes available for this slot. Used: {usedMinutes} min.
        </p>
      </div>
    </div>
  );
}
