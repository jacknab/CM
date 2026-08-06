import { AlertTriangle, Users, Scissors, CheckCircle, ShieldAlert, Clock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export interface ConflictNextAppointment {
  id: number;
  date: string;
  customerName: string;
  startTime: string;
}

export interface ConflictShortenAlt {
  originalId: number;
  originalName: string;
  originalDuration: number;
  miniId: number | null;
  miniName: string | null;
  miniDuration: number | null;
  expressId: number | null;
  expressName: string | null;
  expressDuration: number | null;
}

export type ConflictOption =
  | {
      type: "shorten";
      label: string;
      totalDuration: number;
      alternatives: ConflictShortenAlt[];
    }
  | {
      type: "reassign";
      label: string;
      availableTechs: Array<{ id: number; name: string }>;
    }
  | {
      type: "partial";
      label: string;
      description: string;
      fittingAddons: Array<{ id: number; name: string; duration: number }>;
    }
  | {
      type: "override";
      label: string;
      warning: string;
    };

export interface ConflictData {
  status: "conflict";
  message: string;
  severity: "high" | "medium" | "low";
  availableMinutes: number;
  requestedAddonDuration: number;
  nextAppointment: ConflictNextAppointment;
  options: ConflictOption[];
}

interface Props {
  open: boolean;
  conflict: ConflictData | null;
  onClose: () => void;
  onShorten: (addonIds: number[]) => void;
  onReassign: (staffId: number) => void;
  onPartial: (addonIds: number[]) => void;
  onOverride: () => void;
}

export function ConflictResolutionDialog({
  open,
  conflict,
  onClose,
  onShorten,
  onReassign,
  onPartial,
  onOverride,
}: Props) {
  if (!conflict) return null;

  const shortenOpt = conflict.options.find(o => o.type === "shorten") as Extract<ConflictOption, { type: "shorten" }> | undefined;
  const reassignOpt = conflict.options.find(o => o.type === "reassign") as Extract<ConflictOption, { type: "reassign" }> | undefined;
  const partialOpt = conflict.options.find(o => o.type === "partial") as Extract<ConflictOption, { type: "partial" }> | undefined;
  const overrideOpt = conflict.options.find(o => o.type === "override") as Extract<ConflictOption, { type: "override" }> | undefined;

  const nextTime = new Date(conflict.nextAppointment.startTime).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg" aria-describedby="conflict-resolution-desc">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <DialogTitle>Schedule Conflict Detected</DialogTitle>
          </div>
        </DialogHeader>

        {/* Red warning banner */}
        <div className="bg-red-50 border border-red-200 rounded-lg p-3" id="conflict-resolution-desc">
          <p className="text-sm font-medium text-red-800">{conflict.message}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-red-600">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Next: <strong className="ml-0.5">{conflict.nextAppointment.customerName}</strong>&nbsp;at&nbsp;<strong>{nextTime}</strong>
            </span>
            <span>Available: <strong>{conflict.availableMinutes} min</strong></span>
            <span>Needed: <strong>{conflict.requestedAddonDuration} min</strong></span>
          </div>
        </div>

        <div className="space-y-3 mt-1">

          {/* 🟡 Option A — Shorten */}
          {shortenOpt && (
            <div className="border border-yellow-200 bg-yellow-50 rounded-lg p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0">
                  <Scissors className="w-4 h-4 text-yellow-600 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-yellow-800 flex flex-wrap items-center gap-1.5">
                      Use Mini / Express Versions
                      <Badge variant="outline" className="text-yellow-700 border-yellow-400 text-[10px] font-semibold">
                        Recommended
                      </Badge>
                    </p>
                    <div className="mt-1.5 space-y-0.5">
                      {shortenOpt.alternatives.map(alt => (
                        <div key={alt.originalId} className="text-xs text-yellow-700">
                          <span className="line-through text-yellow-400">{alt.originalName} ({alt.originalDuration}m)</span>
                          {" → "}
                          {alt.miniName ? (
                            <span className="font-medium">{alt.miniName} ({alt.miniDuration}m)</span>
                          ) : alt.expressName ? (
                            <span className="font-medium">{alt.expressName} ({alt.expressDuration}m)</span>
                          ) : (
                            <span className="italic text-yellow-400">no shorter version available</span>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-yellow-600 mt-1.5 font-medium">
                      Total: {shortenOpt.totalDuration} min — fits in {conflict.availableMinutes} min window
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="shrink-0 bg-yellow-600 hover:bg-yellow-700 text-white"
                  onClick={() => {
                    const ids = shortenOpt.alternatives.map(a => a.miniId ?? a.expressId ?? a.originalId);
                    onShorten(ids);
                  }}
                >
                  Apply
                </Button>
              </div>
            </div>
          )}

          {/* 🔵 Option B — Reassign */}
          {reassignOpt && (
            <div className="border border-blue-200 bg-blue-50 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <Users className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-blue-800">Reassign to Another Tech</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {reassignOpt.availableTechs.map(tech => (
                      <Button
                        key={tech.id}
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-blue-300 text-blue-700 hover:bg-blue-100"
                        onClick={() => onReassign(tech.id)}
                      >
                        {tech.name}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 🟢 Option C — Partial */}
          {partialOpt && (
            <div className="border border-green-200 bg-green-50 rounded-lg p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-green-800">Apply Partial Add-Ons</p>
                    <p className="text-xs text-green-700 mt-0.5">{partialOpt.description}</p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {partialOpt.fittingAddons.map(a => (
                        <Badge key={a.id} variant="outline" className="text-green-700 border-green-400 text-[10px]">
                          {a.name} ({a.duration}m)
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
                <Button
                  size="sm"
                  className="shrink-0 bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => onPartial(partialOpt.fittingAddons.map(a => a.id))}
                >
                  Apply
                </Button>
              </div>
            </div>
          )}

          {/* 🔴 Option D — Override */}
          {overrideOpt && (
            <div className="border border-red-200 bg-red-50/60 rounded-lg p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0">
                  <ShieldAlert className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-red-800">Manager Override</p>
                    <p className="text-xs text-red-600 mt-0.5">{overrideOpt.warning}</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 border-red-300 text-red-600 hover:bg-red-100"
                  onClick={onOverride}
                >
                  Override
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end pt-2 border-t">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-muted-foreground">
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
