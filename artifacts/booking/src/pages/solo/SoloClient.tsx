/**
 * Solo dashboard › Clients › a client (owner, 2026-11-06; plans/solo-web-dashboard.md): the Certxa Pro app's client
 * profile (app/client/[id].tsx) on the website — numbers, upcoming and past visits (each opens the booking), photos,
 * notes, details, VIP, tags, which texts the client gets, edit and delete. The same API as the app.
 */
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatInTimeZone } from "date-fns-tz";
import { ChevronLeft, Loader2 } from "lucide-react";
import { soloApi } from "@/lib/soloApi";
import { SOLO_COLORS, useSolo } from "./SoloLayout";
import { money, refreshSolo, toBooking, type ApiAppointment, type Booking } from "./soloBookings";
import { initialsOf, statusOf, STATUS_LABEL, useSoloCustomers } from "./SoloClients";
import SoloBookingPanel from "./SoloBookingPanel";
import { ErrorText, errorText, Field, inputClass, inputStyle, PrimaryButton, readPhoto, SecondaryButton, SoloModal, Toggle } from "./soloUi";

type Note = { id: number; noteContent: string; createdAt: string; pinned?: boolean | null };
type Tag = { id: number; tagName: string };
type Prefs = { smsMarketingOptIn?: boolean | null; emailMarketingOptIn?: boolean | null; promotionalNotifications?: boolean | null; appointmentReminders?: boolean | null; reviewRequests?: boolean | null };
type Client = {
  id: number; avatarUrl?: string | null; cardBrand?: string | null; cardLast4?: string | null; firstName?: string | null; lastName?: string | null; fullName?: string | null; preferredName?: string | null;
  dateOfBirth?: string | null; allergies?: string | null; clientStatus?: string | null; loyaltyPoints?: number | null;
  totalVisits: number; totalSpentCents: number; spent12mCents: number; lastVisitAt?: string | null;
  primaryPhone?: string | null; primaryEmail?: string | null; notes: Note[]; tags: { tagId: number; tag: Tag }[];
  phones?: { phoneType?: string | null; isPrimary?: boolean | null }[];
  marketingPreferences?: Prefs | null;
};
type Visit = { id: number; date: string; status: string; totalPaid?: string | number | null; tipAmount?: string | number | null; serviceName?: string | null; refundedCents?: number | null };
type Photo = { id: number; url: string; kind: "before" | "after" | null; onWebsite: boolean; createdAt: string };

const OPEN = new Set(["pending", "confirmed", "started", "paid"]);
const STATUS_TEXT: Record<string, string> = { completed: "Paid", cancelled: "Cancelled", no_show: "No-show", pending: "Booked", confirmed: "Booked", started: "In progress", paid: "Paid" };

/** "2026-03-09" ↔ "03/09/2026", as the app shows and saves a birthday. */
const shownBirthday = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
function savedBirthday(text: string): string | null {
  const m = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [mo, d, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  const real = date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
  return real && y >= 1900 && date <= new Date() ? `${m[3]}-${m[1]}-${m[2]}` : null;
}
const typedBirthday = (text: string) => { const d = text.replace(/\D/g, "").slice(0, 8); return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join("/"); };

export default function SoloClient() {
  const { id } = useParams();
  const clientId = Number(id);
  const { store } = useSolo();
  const tz = store.timezone || "America/Los_Angeles";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const valid = Number.isInteger(clientId) && clientId > 0;
  // Set once the client is deleted: their data is never asked for again on the way out.
  const [gone, setGone] = useState(false);
  const live = valid && !gone;

  const client = useQuery<Client>({ queryKey: ["solo", "client", clientId], enabled: live, queryFn: () => soloApi<Client>(`/api/clients/${clientId}`) });
  const visits = useQuery<Visit[]>({ queryKey: ["solo", "client-visits", clientId], enabled: live, queryFn: () => soloApi<Visit[]>(`/api/clients/${clientId}/appointments`) });
  const allTags = useQuery<Tag[]>({ queryKey: ["solo", "tags", store.id], queryFn: () => soloApi<Tag[]>("/api/clients/tags/list").catch(() => []) });
  const intel = useQuery<{ intel?: { avgVisitCadenceDays?: number | string | null; nextExpectedVisitDate?: string | null } | null }>({
    queryKey: ["solo", "client-intel", clientId], enabled: live, queryFn: () => soloApi(`/api/intelligence/client/${clientId}`).catch(() => ({ intel: null })) as any,
  });
  const packages = useQuery<{ id: number; name: string; visitsTotal: number; visitsLeft: number }[]>({
    queryKey: ["solo", "client-packages", clientId], enabled: live, queryFn: () => soloApi<any[]>(`/api/pro/clients/${clientId}/packages`).catch(() => []),
  });
  const customers = useSoloCustomers();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: "", phone: "", email: "", preferredName: "", birthday: "", allergies: "" });
  const [deleting, setDeleting] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [tagText, setTagText] = useState("");
  const [addingTag, setAddingTag] = useState(false);
  const [showAllPast, setShowAllPast] = useState(false);
  const [opened, setOpened] = useState<Booking | null>(null);

  const c = client.data;
  const name = c ? (c.fullName || [c.firstName, c.lastName].filter(Boolean).join(" ") || "Client") : "";
  const list = Array.isArray(visits.data) ? visits.data : [];
  // Visits counted as the Clients list counts them (the client record's own counters are stale).
  const listed = (customers.data ?? []).find((x) => x.id === clientId);
  const paid = list.filter((v) => (v.status === "completed" || v.status === "paid") && new Date(v.date).getTime() <= Date.now());
  const status = c ? statusOf({
    id: clientId, name, phone: null, email: null, isVip: c.clientStatus === "vip",
    visits: listed ? listed.visits : paid.length,
    lastVisitAt: listed?.lastVisitAt ?? paid.reduce<string | null>((l, v) => (!l || v.date > l ? v.date : l), null),
  }) : "new";
  const now = Date.now();
  const upcoming = useMemo(() => list.filter((v) => OPEN.has(v.status) && new Date(v.date).getTime() >= now - 3600_000).sort((a, b) => +new Date(a.date) - +new Date(b.date)), [list, now]);
  const past = useMemo(() => list.filter((v) => !upcoming.includes(v)), [list, upcoming]);
  const noShows = list.filter((v) => v.status === "no_show").length;
  const avgCents = c && c.totalVisits > 0 ? Math.round(c.totalSpentCents / c.totalVisits) : 0;
  const phoneDigits = (c?.primaryPhone ?? "").replace(/\D/g, "");
  const primaryPhone = c?.phones?.find((p) => p.isPrimary) ?? c?.phones?.[0];
  const canText = !!phoneDigits && primaryPhone?.phoneType !== "landline";
  const email = c?.primaryEmail ?? "";
  const notes = useMemo(() => [...(c?.notes ?? [])].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || +new Date(b.createdAt) - +new Date(a.createdAt)), [c]);
  const myTagIds = new Set((c?.tags ?? []).map((t) => t.tagId));
  const date = (iso?: string | null) => (iso ? formatInTimeZone(new Date(iso), tz, "MMM d, yyyy") : "—");

  const run = async (work: () => Promise<unknown>, fallback: string) => {
    if (busy) return false;
    setBusy(true); setError("");
    try { await work(); await refreshSolo(qc); return true; }
    catch (e) { setError(errorText(e, fallback)); return false; }
    finally { setBusy(false); }
  };

  const startEdit = () => {
    if (!c) return;
    setDraft({ name, phone: c.primaryPhone ?? "", email: c.primaryEmail ?? "", preferredName: c.preferredName ?? "",
      birthday: c.dateOfBirth ? shownBirthday(String(c.dateOfBirth).slice(0, 10)) : "", allergies: c.allergies ?? "" });
    setError(""); setEditing(true);
  };
  const saveEdit = () => run(async () => {
    const phone = draft.phone.replace(/\D/g, "");
    const mail = draft.email.trim();
    if (!draft.name.trim()) throw new Error("Enter the client's name.");
    if (phone && phone.length !== 10) throw new Error("Enter a 10-digit phone number.");
    if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) throw new Error("Enter a valid e-mail address.");
    const birthday = draft.birthday.trim() ? savedBirthday(draft.birthday.trim()) : null;
    if (draft.birthday.trim() && !birthday) throw new Error("Enter the birthday as MM/DD/YYYY.");
    await soloApi(`/api/customers/${clientId}`, { method: "PATCH", body: { name: draft.name.trim(), ...(phone ? { phone } : {}), ...(mail ? { email: mail } : {}) } });
    await soloApi(`/api/clients/${clientId}`, { method: "PATCH", body: { preferredName: draft.preferredName.trim() || null, dateOfBirth: birthday, allergies: draft.allergies.trim() || null } });
  }, "Could not save the client.").then((ok) => { if (ok) setEditing(false); });
  // Back to the list first, then refresh: refreshing here would ask for the deleted client again.
  const deleteClient = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await soloApi(`/api/pro/clients/${clientId}`, { method: "DELETE" });
      const own = (k: readonly unknown[]) => k[0] === "solo" && String(k[1]).startsWith("client") && k[2] === clientId;
      setGone(true);
      navigate("/solo/clients", { replace: true });
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === "solo" && !own(q.queryKey) });
      setTimeout(() => qc.removeQueries({ predicate: (q) => own(q.queryKey) }), 0);
    } catch (e) { setError(errorText(e, "Could not delete the client.")); setBusy(false); }
  };
  const toggleVip = () => run(() => soloApi(`/api/clients/${clientId}`, { method: "PATCH", body: { clientStatus: c?.clientStatus === "vip" ? "active" : "vip" } }), "Could not change VIP.");
  const togglePin = (n: Note) => run(() => soloApi(`/api/clients/${clientId}/notes/${n.id}`, { method: "PATCH", body: { pinned: !n.pinned } }), "Could not pin the note.");
  const addTag = (wanted: string) => run(async () => {
    const t = wanted.trim();
    if (!t) return;
    let tag = (allTags.data ?? []).find((x) => x.tagName.toLowerCase() === t.toLowerCase());
    if (!tag) tag = await soloApi<Tag>("/api/clients/tags", { method: "POST", body: { tagName: t } });
    if (tag && !myTagIds.has(tag.id)) await soloApi(`/api/clients/${clientId}/tags`, { method: "POST", body: { tagId: tag.id } });
  }, "Could not add the tag.").then((ok) => { if (ok) { setTagText(""); setAddingTag(false); } });
  const removeTag = (tagId: number) => run(() => soloApi(`/api/clients/${clientId}/tags/${tagId}`, { method: "DELETE" }), "Could not remove the tag.");
  // Only these two are read when Certxa sends texts (no row = allowed).
  const setPref = (key: "smsMarketingOptIn" | "reviewRequests", value: boolean) => run(() => {
    const p = c?.marketingPreferences ?? {};
    return soloApi(`/api/clients/${clientId}/marketing-preferences`, { method: "PUT", body: {
      smsMarketingOptIn: p.smsMarketingOptIn ?? true, emailMarketingOptIn: p.emailMarketingOptIn ?? true,
      promotionalNotifications: p.promotionalNotifications ?? true, appointmentReminders: p.appointmentReminders ?? true,
      reviewRequests: p.reviewRequests ?? true, [key]: value,
    } });
  }, "Could not save the setting.");
  const openVisit = async (v: Visit) => {
    setError("");
    try { setOpened(toBooking(await soloApi<ApiAppointment>(`/api/appointments/${v.id}`), tz)); }
    catch (e) { setError(errorText(e, "This booking could not be opened.")); }
  };

  const card = "rounded-2xl border bg-white";
  const border = { borderColor: SOLO_COLORS.border };
  const muted = { color: SOLO_COLORS.muted };
  const link = "text-sm font-semibold";
  const linkStyle = { color: SOLO_COLORS.primary };

  if (!valid) return <p className="p-8 text-sm text-red-600">This client could not be found.</p>;
  if (client.isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>;
  if (!c) return (
    <div className="p-8">
      <Link to="/solo/clients" className="text-sm font-medium" style={muted}>‹ Clients</Link>
      <p className="mt-4 text-sm text-red-600">{errorText(client.error, "This client could not be found.")}</p>
    </div>
  );

  const visitRow = (v: Visit) => {
    // Refunded (owner, 2026-11-07): Refunded / Part refunded, and what's left after the refund.
    const refunded = Number(v.refundedCents ?? 0) || 0;
    const totalCents = Math.round(Number(v.totalPaid ?? 0) * 100);
    const paidCents = totalCents - Math.round(Number(v.tipAmount ?? 0) * 100) - refunded;
    const statusText = refunded > 0 && v.status === "completed" ? (refunded >= totalCents ? "Refunded" : `Part refunded · ${money(refunded)}`) : STATUS_TEXT[v.status] ?? v.status;
    return (
      <li key={v.id} style={border}>
        <button type="button" onClick={() => void openVisit(v)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#FBFAFE]" data-testid={`solo-client-visit-${v.id}`}>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{v.serviceName || "Visit"}</span>
            <span className="block text-xs" style={muted}>{date(v.date)} · {statusText}</span>
          </span>
          {v.status === "completed" && paidCents > 0 && <span className="text-sm font-semibold">{money(paidCents)}</span>}
        </button>
      </li>
    );
  };
  const stats: [string, string][] = [
    ["Visits", String(c.totalVisits)], ["Lifetime spend", money(c.totalSpentCents)], ["Average visit", c.totalVisits ? money(avgCents) : "—"],
    ["Last 12 months", money(c.spent12mCents)], ["Last visit", date(c.lastVisitAt)], ["Next visit", upcoming[0] ? date(upcoming[0].date) : "Not booked"],
    ["No-shows", String(noShows)], ...(c.loyaltyPoints ? [["Loyalty points", String(c.loyaltyPoints)] as [string, string]] : []),
  ];
  const cadence = Number(intel.data?.intel?.avgVisitCadenceDays);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 md:px-8 md:pt-8">
      <Link to="/solo/clients" className="text-sm font-medium" style={muted}><ChevronLeft className="-mt-0.5 inline h-4 w-4" />Clients</Link>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        {c.avatarUrl ? <img src={c.avatarUrl} alt="" className="h-16 w-16 rounded-full object-cover" data-testid="solo-client-avatar" />
          : <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#F1ECFD] text-xl font-bold" style={linkStyle}>{initialsOf(name)}</span>}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[24px] font-semibold tracking-tight" data-testid="solo-client-name">{name}</h1>
          {c.preferredName && <p className="text-sm" style={muted}>Goes by {c.preferredName}</p>}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <span className="rounded-full bg-[#F1ECFD] px-2.5 py-0.5 text-[11px] font-semibold text-[#5B21B6]" data-testid="solo-client-status">{STATUS_LABEL[status]}</span>
            {c.tags.map((t) => <span key={t.tagId} className="rounded-full bg-[#F2F1F7] px-2.5 py-0.5 text-[11px] font-semibold text-[#3D4160]">{t.tag.tagName}</span>)}
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={startEdit} className="rounded-xl border bg-white px-3.5 py-2 text-sm font-semibold hover:bg-gray-50" style={border} data-testid="solo-client-edit">Edit</button>
          <button type="button" onClick={() => navigate("/solo/calendar", { state: { newBookingFor: clientId } })} className="rounded-xl px-3.5 py-2 text-sm font-semibold text-white" style={{ background: SOLO_COLORS.primary }} data-testid="solo-client-book">Book appointment</button>
        </div>
      </div>

      <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {canText ? <a href={`sms:${phoneDigits}`} className={link} style={linkStyle}>Text</a> : <span className={link} style={muted}>Text</span>}
        {phoneDigits ? <a href={`tel:${phoneDigits}`} className={link} style={linkStyle}>Call</a> : <span className={link} style={muted}>Call</span>}
        {email ? <a href={`mailto:${email}`} className={link} style={linkStyle}>Email</a> : <span className={link} style={muted}>Email</span>}
      </p>
      {phoneDigits && !canText && <p className="mt-1 text-xs" style={muted}>This number is a landline, so it can't receive texts.</p>}
      {c.allergies && <p className="mt-3 rounded-xl bg-[#FDF3E7] px-3.5 py-2.5 text-sm font-medium text-[#8A4B0F]" data-testid="solo-client-allergies">Allergies: {c.allergies}</p>}
      {(packages.data ?? []).map((p) => <p key={p.id} className="mt-2 text-sm">{p.name}: {p.visitsLeft} of {p.visitsTotal} visits left</p>)}

      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4" data-testid="solo-client-stats">
        {stats.map(([label, value]) => (
          <div key={label} className={`${card} p-3.5`} style={border}>
            <p className="text-lg font-semibold">{value}</p>
            <p className="text-xs" style={muted}>{label}</p>
          </div>
        ))}
      </div>
      {cadence > 0 && (
        <p className="mt-3 text-sm" style={muted}>
          Usually comes every {Math.round(cadence)} days{intel.data?.intel?.nextExpectedVisitDate && !upcoming.length ? ` · expected around ${date(intel.data.intel.nextExpectedVisitDate)}` : ""}.
        </p>
      )}
      <div className="mt-3"><ErrorText>{error}</ErrorText></div>

      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 text-base font-semibold">Upcoming</h2>
            <ul className={`${card} divide-y overflow-hidden`} style={border}>
              {upcoming.length ? upcoming.map(visitRow) : <li className="px-4 py-3 text-sm" style={muted}>Nothing booked.</li>}
            </ul>
          </section>
          <section>
            <h2 className="mb-2 text-base font-semibold">Past visits</h2>
            <ul className={`${card} divide-y overflow-hidden`} style={border} data-testid="solo-client-past">
              {past.length ? (showAllPast ? past : past.slice(0, 5)).map(visitRow) : <li className="px-4 py-3 text-sm" style={muted}>No visits yet.</li>}
              {past.length > 5 && <li><button type="button" onClick={() => setShowAllPast(!showAllPast)} className={`${link} w-full px-4 py-2.5 text-left`} style={linkStyle}>{showAllPast ? "Show fewer" : `Show all ${past.length}`}</button></li>}
            </ul>
          </section>
          <ClientPhotos clientId={clientId} avatarUrl={c.avatarUrl ?? null}
            onProfilePhoto={(url) => run(() => soloApi(`/api/clients/${clientId}`, { method: "PATCH", body: { avatarUrl: url } }), "Could not change the profile photo.")} />
        </div>

        <div className="space-y-6">
          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-base font-semibold">Notes</h2>
              <button type="button" onClick={() => setNotesOpen(true)} className={link} style={linkStyle} data-testid="solo-client-notes-all">Add or see all</button>
            </div>
            <ul className={`${card} divide-y overflow-hidden`} style={border}>
              {notes.length ? notes.slice(0, 3).map((n) => (
                <li key={n.id} className="flex items-start gap-3 px-4 py-3" style={border}>
                  <span className="min-w-0 flex-1">
                    <span className="block whitespace-pre-wrap text-sm">{n.noteContent}</span>
                    <span className="block text-xs" style={muted}>{n.pinned ? "Pinned · " : ""}{date(n.createdAt)}</span>
                  </span>
                  <button type="button" onClick={() => void togglePin(n)} className="text-xs font-semibold" style={n.pinned ? linkStyle : muted} data-testid={`solo-note-pin-${n.id}`}>{n.pinned ? "Unpin" : "Pin"}</button>
                </li>
              )) : <li className="px-4 py-3 text-sm" style={muted}>No notes yet.</li>}
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">Details</h2>
            <dl className={`${card} divide-y`} style={border}>
              {[
                ["Phone", c.primaryPhone || "—"], ["E-mail", c.primaryEmail || "—"], ["Goes by", c.preferredName || "—"],
                ["Birthday", c.dateOfBirth ? new Date(`${String(c.dateOfBirth).slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric" }) : "—"],
                ["Allergies", c.allergies || "None noted"],
                ...(c.cardLast4 ? [["Card on file", `${c.cardBrand ? `${c.cardBrand[0].toUpperCase()}${c.cardBrand.slice(1)} ` : ""}ending ${c.cardLast4}`]] : []),
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 px-4 py-2.5 text-sm" style={border}><dt style={muted}>{label}</dt><dd className="text-right font-medium">{value}</dd></div>
              ))}
              <div className="px-4 py-1.5" style={border}><Toggle title="VIP client" value={c.clientStatus === "vip"} onChange={() => void toggleVip()} testId="solo-client-vip" /></div>
            </dl>
          </section>

          <section>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-base font-semibold">Tags</h2>
              {!addingTag && <button type="button" onClick={() => setAddingTag(true)} className={link} style={linkStyle} data-testid="solo-client-tag-add">Add tag</button>}
            </div>
            <div className={`${card} space-y-3 p-3.5`} style={border}>
              <div className="flex flex-wrap gap-1.5">
                {c.tags.length ? c.tags.map((t) => (
                  <button key={t.tagId} type="button" onClick={() => void removeTag(t.tagId)} title={`Remove ${t.tag.tagName}`} className="rounded-full border px-2.5 py-1 text-xs font-semibold hover:bg-gray-50" style={border} data-testid={`solo-client-tag-${t.tagId}`}>
                    {t.tag.tagName} ×
                  </button>
                )) : <span className="text-sm" style={muted}>No tags.</span>}
              </div>
              {addingTag && (
                <div className="space-y-2">
                  <input autoFocus value={tagText} onChange={(e) => setTagText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void addTag(tagText); }} placeholder="New tag" className={inputClass} style={inputStyle} data-testid="solo-client-tag-input" />
                  {(allTags.data ?? []).some((t) => !myTagIds.has(t.id)) && (
                    <select value="" onChange={(e) => { const t = (allTags.data ?? []).find((x) => x.id === Number(e.target.value)); if (t) void addTag(t.tagName); }} className={inputClass} style={inputStyle} data-testid="solo-client-tag-pick">
                      <option value="">Or choose one of your tags</option>
                      {(allTags.data ?? []).filter((t) => !myTagIds.has(t.id)).map((t) => <option key={t.id} value={t.id}>{t.tagName}</option>)}
                    </select>
                  )}
                  <div className="flex justify-end gap-4">
                    <button type="button" onClick={() => { setAddingTag(false); setTagText(""); }} className={link} style={muted}>Cancel</button>
                    <button type="button" disabled={!tagText.trim() || busy} onClick={() => void addTag(tagText)} className={link} style={tagText.trim() ? linkStyle : muted} data-testid="solo-client-tag-save">Add</button>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold">Texts this client gets</h2>
            <div className={`${card} divide-y px-4 py-1`} style={border}>
              <Toggle title="Marketing texts" hint="Offers, win-back and rebooking reminders" value={c.marketingPreferences?.smsMarketingOptIn !== false} onChange={(v) => void setPref("smsMarketingOptIn", v)} testId="solo-client-pref-marketing" />
              <Toggle title="Review requests" hint="Asking for a review after a visit" value={c.marketingPreferences?.reviewRequests !== false} onChange={(v) => void setPref("reviewRequests", v)} testId="solo-client-pref-reviews" />
            </div>
          </section>
        </div>
      </div>

      {editing && (
        <SoloModal title={`Edit ${name}`} onClose={() => !busy && setEditing(false)}>
          <div className="space-y-3">
            {([
              ["name", "First and last name"], ["phone", "Phone number"], ["email", "E-mail"],
              ["preferredName", "Goes by (optional)"], ["birthday", "Birthday (MM/DD/YYYY)"], ["allergies", "Allergies (optional)"],
            ] as const).map(([key, label]) => (
              <Field key={key} label={label}>
                <input value={draft[key]} onChange={(e) => { const v = e.target.value; setDraft((d) => ({ ...d, [key]: key === "birthday" ? typedBirthday(v) : v })); }}
                  inputMode={key === "phone" || key === "birthday" ? "numeric" : undefined} className={inputClass} style={inputStyle} data-testid={`solo-client-edit-${key}`} />
              </Field>
            ))}
            <ErrorText>{error}</ErrorText>
            <PrimaryButton onClick={() => void saveEdit()} busy={busy} testId="solo-client-edit-save">Save changes</PrimaryButton>
            <SecondaryButton onClick={() => setDeleting(true)} disabled={busy} danger testId="solo-client-delete">Delete client</SecondaryButton>
          </div>
        </SoloModal>
      )}
      {deleting && (
        <SoloModal title="Delete this client?" onClose={() => !busy && setDeleting(false)}>
          <p className="mb-4 text-sm" style={muted}>{name}'s record, notes, tags and photos are deleted for good. This can't be undone.</p>
          <div className="space-y-2.5">
            <ErrorText>{error}</ErrorText>
            <SecondaryButton onClick={() => void deleteClient()} busy={busy} danger testId="solo-client-delete-confirm">Delete client</SecondaryButton>
            <button type="button" onClick={() => setDeleting(false)} className="w-full py-1 text-sm font-medium text-gray-500">Keep client</button>
          </div>
        </SoloModal>
      )}
      {notesOpen && <NotesDialog clientId={clientId} clientName={name} tz={tz} onClose={() => setNotesOpen(false)} />}
      {opened && <SoloBookingPanel booking={opened} tz={tz} onClose={() => { setOpened(null); void refreshSolo(qc); }}
        onBookAgain={() => navigate("/solo/calendar", { state: { newBookingFor: clientId, serviceId: opened.serviceId } })} />}
    </div>
  );
}

function NotesDialog({ clientId, clientName, tz, onClose }: { clientId: number; clientName: string; tz: string; onClose: () => void }) {
  const qc = useQueryClient();
  const notes = useQuery<Note[]>({ queryKey: ["solo", "client-notes", clientId], queryFn: () => soloApi<Note[]>(`/api/clients/${clientId}/notes`) });
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    if (!text.trim() || saving) return;
    setSaving(true); setError("");
    try { await soloApi(`/api/clients/${clientId}/notes`, { method: "POST", body: { noteContent: text.trim() } }); setText(""); await refreshSolo(qc); }
    catch (e) { setError(errorText(e, "Could not save the note.")); }
    finally { setSaving(false); }
  };
  return (
    <SoloModal title={`Notes · ${clientName}`} onClose={onClose} wide>
      <div className="space-y-3">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Add a note" className={inputClass} style={inputStyle} data-testid="solo-note-text" />
        <ErrorText>{error}</ErrorText>
        <PrimaryButton onClick={save} busy={saving} disabled={!text.trim()} testId="solo-note-save">Save note</PrimaryButton>
        {notes.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" /> : (
          <ul className="divide-y" data-testid="solo-notes-list">
            {(notes.data ?? []).map((n) => (
              <li key={n.id} className="py-2.5" style={{ borderColor: SOLO_COLORS.border }}>
                <p className="whitespace-pre-wrap text-sm">{n.noteContent}</p>
                <p className="text-xs" style={{ color: SOLO_COLORS.muted }}>{formatInTimeZone(new Date(n.createdAt), tz, "MMM d, yyyy · h:mm a")}</p>
              </li>
            ))}
            {(notes.data ?? []).length === 0 && <li className="py-2 text-sm" style={{ color: SOLO_COLORS.muted }}>No notes yet.</li>}
          </ul>
        )}
      </div>
    </SoloModal>
  );
}

/** Before and after photos, private to the business (the app's components/ClientPhotos.tsx). */
function ClientPhotos({ clientId, avatarUrl, onProfilePhoto }: { clientId: number; avatarUrl: string | null; onProfilePhoto: (url: string | null) => Promise<unknown> }) {
  const qc = useQueryClient();
  const photos = useQuery<Photo[]>({ queryKey: ["solo", "client-photos", clientId], queryFn: () => soloApi<Photo[]>(`/api/client-photos?clientId=${clientId}`) });
  const [kind, setKind] = useState<"before" | "after" | "">("");
  const [open, setOpen] = useState<Photo | null>(null);
  const [confirmWebsite, setConfirmWebsite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const muted = { color: SOLO_COLORS.muted };

  const act = async (work: () => Promise<unknown>, fallback: string) => {
    setBusy(true); setError("");
    try { await work(); await refreshSolo(qc); setOpen(null); setConfirmWebsite(false); }
    catch (e) { setError(errorText(e, fallback)); }
    finally { setBusy(false); }
  };
  const upload = (file: File) => act(async () => {
    const dataUrl = await readPhoto(file);
    const [head, data] = dataUrl.split(",");
    await soloApi("/api/client-photos", { method: "POST", body: { clientId, data, mimeType: head.includes("image/png") ? "image/png" : "image/jpeg", ...(kind ? { kind } : {}) } });
  }, "The photo could not be saved. Try again.");

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Photos</h2>
        <div className="flex items-center gap-2">
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="rounded-lg border bg-white px-2 py-1 text-xs" style={{ borderColor: SOLO_COLORS.border }} data-testid="solo-photo-kind">
            <option value="">Photo</option><option value="before">Before</option><option value="after">After</option>
          </select>
          <label className="cursor-pointer text-sm font-semibold" style={{ color: SOLO_COLORS.primary }}>
            {busy && !open ? "Saving…" : "Add photo"}
            <input type="file" accept="image/jpeg,image/png" className="hidden" data-testid="solo-photo-add"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
          </label>
        </div>
      </div>
      {!open && <ErrorText>{error}</ErrorText>}
      {(photos.data ?? []).length === 0 ? (
        <p className="rounded-2xl border bg-white px-4 py-3 text-sm" style={{ ...muted, borderColor: SOLO_COLORS.border }}>No photos yet. Only you can see them.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" data-testid="solo-photos">
          {(photos.data ?? []).map((p) => (
            <button key={p.id} type="button" onClick={() => { setError(""); setConfirmWebsite(false); setOpen(p); }} className="relative aspect-square overflow-hidden rounded-xl bg-[#F2F1F7]" data-testid={`solo-photo-${p.id}`}>
              <img src={p.url} alt="" className="h-full w-full object-cover" />
              {p.kind && <span className="absolute left-1.5 top-1.5 rounded bg-white/90 px-1.5 text-[10px] font-semibold uppercase">{p.kind}</span>}
            </button>
          ))}
        </div>
      )}
      {open && (
        <SoloModal title={open.kind ? `${open.kind[0].toUpperCase()}${open.kind.slice(1)} photo` : "Photo"} onClose={() => !busy && setOpen(null)}>
          <img src={open.url} alt="" className="mb-4 max-h-[50vh] w-full rounded-xl object-contain" />
          <div className="space-y-2.5">
            <ErrorText>{error}</ErrorText>
            {avatarUrl === open.url
              ? <SecondaryButton onClick={() => void act(() => onProfilePhoto(null), "Could not change the profile photo.")} disabled={busy}>Stop using as profile photo</SecondaryButton>
              : <SecondaryButton onClick={() => void act(() => onProfilePhoto(open.url), "Could not change the profile photo.")} disabled={busy} testId="solo-photo-profile">Use as profile photo</SecondaryButton>}
            {open.onWebsite ? (
              <SecondaryButton onClick={() => void act(() => soloApi(`/api/client-photos/${open.id}/website`, { method: "POST", body: { show: false } }), "That didn't work. Try again.")} disabled={busy}>Remove from my website</SecondaryButton>
            ) : confirmWebsite ? (
              <div className="rounded-xl bg-[#F7F5FD] p-3">
                <p className="mb-2 text-sm">It goes in the Portfolio on your booking website. Only post a client's photo with their OK.</p>
                <PrimaryButton onClick={() => void act(() => soloApi(`/api/client-photos/${open.id}/website`, { method: "POST", body: { show: true } }), "That didn't work. Try again.")} busy={busy} testId="solo-photo-website-confirm">Show on my website</PrimaryButton>
              </div>
            ) : (
              <SecondaryButton onClick={() => setConfirmWebsite(true)} disabled={busy} testId="solo-photo-website">Show on my website</SecondaryButton>
            )}
            <SecondaryButton onClick={() => void act(() => soloApi(`/api/client-photos/${open.id}`, { method: "DELETE" }), "The photo could not be removed.")} disabled={busy} danger testId="solo-photo-remove">Remove photo</SecondaryButton>
          </div>
        </SoloModal>
      )}
    </section>
  );
}
