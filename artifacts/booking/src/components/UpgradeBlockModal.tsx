/**
 * UpgradeBlockModal — Shown when an API call returns a plan limit error.
 *
 * Usage:
 *   const [upgradeModal, setUpgradeModal] = useState<UpgradeBlockPayload | null>(null);
 *   // When a fetch returns { code: "STAFF_LIMIT_REACHED", message: "...", upgradeRequired: true }
 *   setUpgradeModal({ code, message });
 *   <UpgradeBlockModal payload={upgradeModal} onClose={() => setUpgradeModal(null)} />
 */

import { useNavigate } from "react-router-dom";
import { Zap, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface UpgradeBlockPayload {
  message: string;
  code?: string;
}

interface Props {
  payload: UpgradeBlockPayload | null;
  onClose: () => void;
}

export function UpgradeBlockModal({ payload, onClose }: Props) {
  const navigate = useNavigate();
  if (!payload) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-600"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center">
            <Zap className="w-7 h-7 text-amber-500" />
          </div>

          <div>
            <h2 className="text-lg font-bold text-zinc-900">Plan Limit Reached</h2>
            <p className="text-sm text-zinc-500 mt-1 leading-relaxed">{payload.message}</p>
          </div>

          <div className="flex gap-3 w-full mt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
              onClick={() => { onClose(); navigate("/subscription"); }}
            >
              Upgrade Plan
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
