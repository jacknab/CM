import { Mail, Phone, MapPin, Globe, Clock, User, Hash } from "lucide-react";
import type { AccountOverview } from "@/lib/api";
import { format } from "date-fns";

type Props = {
  store: AccountOverview["store"];
  owner: AccountOverview["owner"];
};

export default function AccountSummaryCard({ store, owner }: Props) {
  const formatPhone = (p: string) => p?.replace(/(\d{1})(\d{3})(\d{3})(\d{4})/, "+$1 ($2) $3-$4") ?? p;
  const signupDate = owner.signupDate ? format(new Date(owner.signupDate), "MMM d, yyyy") : "—";
  const location = [store.city, store.state].filter(Boolean).join(", ");

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Account Summary</h3>
        <span className="text-xs text-slate-400">#{store.id}</span>
      </div>

      <div className="p-4 space-y-3">
        {/* Business Info */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Business</p>
          {store.email && (
            <Row icon={<Mail size={13} />} label="Email">
              <a href={`mailto:${store.email}`} className="text-indigo-600 hover:underline text-xs">{store.email}</a>
            </Row>
          )}
          {store.phone && (
            <Row icon={<Phone size={13} />} label="Phone">
              <span className="text-xs text-slate-700">{formatPhone(store.phone)}</span>
            </Row>
          )}
          {location && (
            <Row icon={<MapPin size={13} />} label="Location">
              <span className="text-xs text-slate-700">{location}</span>
            </Row>
          )}
          {store.timezone && (
            <Row icon={<Clock size={13} />} label="Timezone">
              <span className="text-xs text-slate-700">{store.timezone}</span>
            </Row>
          )}
          {store.bookingSlug && (
            <Row icon={<Globe size={13} />} label="Booking URL">
              <a href={`/book/${store.bookingSlug}`} target="_blank" rel="noreferrer"
                className="text-indigo-600 hover:underline text-xs">
                /{store.bookingSlug}
              </a>
            </Row>
          )}
        </div>

        <div className="border-t border-slate-100 pt-3 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Account Owner</p>
          <Row icon={<User size={13} />} label="Name">
            <span className="text-xs text-slate-700">{owner.name || "—"}</span>
          </Row>
          <Row icon={<Mail size={13} />} label="Email">
            <a href={`mailto:${owner.email}`} className="text-indigo-600 hover:underline text-xs">{owner.email}</a>
          </Row>
          <Row icon={<Hash size={13} />} label="User ID">
            <span className="text-xs text-slate-500 font-mono">{owner.id?.slice(0, 12)}…</span>
          </Row>
        </div>

        <div className="border-t border-slate-100 pt-3 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Dates</p>
          <Row icon={<Clock size={13} />} label="Signed Up">
            <span className="text-xs text-slate-700">{signupDate}</span>
          </Row>
          {owner.trialEndsAt && (
            <Row icon={<Clock size={13} />} label="Trial Ends">
              <span className="text-xs text-slate-700">{format(new Date(owner.trialEndsAt), "MMM d, yyyy")}</span>
            </Row>
          )}
        </div>

        {/* Credits */}
        <div className="border-t border-slate-100 pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Credits & Usage</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-50 rounded-lg p-2.5 text-center">
              <div className="text-lg font-bold text-slate-800">{store.smsTokens ?? 0}</div>
              <div className="text-[10px] text-slate-500">SMS Remaining</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-2.5 text-center">
              <div className="text-lg font-bold text-slate-800">{store.smsAllowance ?? 0}</div>
              <div className="text-[10px] text-slate-500">SMS Allowance</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-slate-400 mt-0.5 flex-shrink-0">{icon}</span>
      <span className="text-xs text-slate-500 w-20 flex-shrink-0">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
