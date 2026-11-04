import React, { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../services/api';
import { Send } from 'lucide-react';

interface Announcement {
  id: number;
  title: string;
  body: string;
  sendAt: string;
  status: 'scheduled' | 'sending' | 'sent' | 'canceled' | 'failed';
  sentCount: number | null;
  sentAt: string | null;
}

const TITLE_MAX = 60;
const BODY_MAX = 180;
const STATUS: Record<Announcement['status'], string> = { scheduled: 'Scheduled', sending: 'Sending', sent: 'Sent', canceled: 'Cancelled', failed: 'Failed' };
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
/** Now, as the value of a datetime-local input (this computer's time). */
const localNow = () => { const d = new Date(Date.now() + 5 * 60_000); d.setSeconds(0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); };

/**
 * App Announcements (owner, 2026-11-04): a brief message sent at a chosen date and time as a push notification to
 * every phone signed in to the Certxa Pro app (api-server lib/appAnnouncements.ts). Times are this computer's time.
 */
export const AppAnnouncementsManager: React.FC = () => {
  const [rows, setRows] = useState<Announcement[]>([]);
  const [devices, setDevices] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sendAt, setSendAt] = useState(localNow);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/api/admin/app-announcements', { method: 'GET' });
      setRows(Array.isArray(res?.announcements) ? res.announcements : []);
      setDevices(Number(res?.devices ?? 0));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load the announcements');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const valid = title.trim().length > 0 && title.trim().length <= TITLE_MAX && body.trim().length > 0 && body.trim().length <= BODY_MAX && !!sendAt;

  const schedule = async () => {
    if (!valid) return;
    const at = new Date(sendAt);
    if (!window.confirm(`Send "${title.trim()}" to every phone with the Certxa Pro app on ${when(at.toISOString())}?`)) return;
    setSaving(true); setError(null); setNotice(null);
    try {
      await apiRequest('/api/admin/app-announcements', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), body: body.trim(), sendAt: at.toISOString() }),
      });
      setTitle(''); setBody(''); setSendAt(localNow());
      setNotice(`Scheduled for ${when(at.toISOString())}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to schedule the announcement');
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (a: Announcement) => {
    if (!window.confirm(`Cancel "${a.title}"? It won't be sent.`)) return;
    setError(null); setNotice(null);
    try {
      await apiRequest(`/api/admin/app-announcements/${a.id}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to cancel');
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#E0E0E0] text-gray-800 font-sans text-xs overflow-hidden">
      <div className="bg-[#2D3E50] text-white p-1 flex justify-between items-center shadow-md">
        <span className="ml-2 text-sm font-bold uppercase tracking-wider">App Announcements</span>
        <span className="mr-2 text-[10px] text-gray-300">{devices} {devices === 1 ? 'phone' : 'phones'} with the Certxa Pro app signed in</span>
      </div>

      {error && <div className="bg-red-100 border-b border-red-300 text-red-800 px-4 py-2 font-bold">{error}</div>}
      {notice && !error && <div className="bg-green-100 border-b border-green-300 text-green-800 px-4 py-2 font-bold">{notice}</div>}

      <div className="bg-white m-2 border border-gray-400 shadow-sm p-3 space-y-2 max-w-2xl">
        <div className="text-[10px] font-black uppercase text-gray-500">New announcement · push notification to every Certxa Pro app user</div>
        <label className="block">
          <span className="text-[10px] font-bold uppercase text-gray-500">Title ({title.trim().length}/{TITLE_MAX})</span>
          <input value={title} maxLength={TITLE_MAX} onChange={(e) => setTitle(e.target.value)} data-testid="announcement-title"
            className="w-full bg-white border border-blue-300 px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 text-sm" placeholder="New in Certxa Pro" />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase text-gray-500">Message ({body.trim().length}/{BODY_MAX})</span>
          <textarea value={body} maxLength={BODY_MAX} rows={3} onChange={(e) => setBody(e.target.value)} data-testid="announcement-body"
            className="w-full bg-white border border-blue-300 px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 text-sm resize-none" placeholder="A short message for every Certxa Pro user" />
        </label>
        <div className="flex items-end gap-2">
          <label className="block">
            <span className="text-[10px] font-bold uppercase text-gray-500">Send on (this computer's time)</span>
            <input type="datetime-local" value={sendAt} onChange={(e) => setSendAt(e.target.value)} data-testid="announcement-send-at"
              className="block bg-white border border-blue-300 px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 text-sm" />
          </label>
          <button onClick={schedule} disabled={saving || !valid} data-testid="announcement-schedule"
            className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-4 py-2 rounded text-[10px] font-bold uppercase tracking-wider shadow-sm flex items-center gap-1">
            <Send size={12} /> {saving ? 'Saving…' : 'Schedule'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-white m-2 mt-0 border border-gray-400 shadow-sm">
        <table className="w-full border-collapse">
          <thead className="bg-gray-100 border-b border-gray-300 text-[9px] font-black uppercase text-gray-500">
            <tr>
              <th className="border-r border-gray-200 px-2 py-1.5 text-left w-44">Send on</th>
              <th className="border-r border-gray-200 px-2 py-1.5 text-left">Announcement</th>
              <th className="border-r border-gray-200 px-2 py-1.5 text-left w-40">Status</th>
              <th className="px-2 py-1.5 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {rows.map((a) => (
              <tr key={a.id} className="align-top">
                <td className="border-r border-gray-200 px-2 py-1.5 font-mono text-gray-700">{when(a.sendAt)}</td>
                <td className="border-r border-gray-200 px-2 py-1.5 select-text">
                  <div className="font-bold text-gray-800">{a.title}</div>
                  <div className="text-gray-600">{a.body}</div>
                </td>
                <td className="border-r border-gray-200 px-2 py-1.5 text-gray-700">
                  {STATUS[a.status] ?? a.status}{a.status === 'sent' && a.sentCount != null ? ` to ${a.sentCount} ${a.sentCount === 1 ? 'phone' : 'phones'}` : ''}
                </td>
                <td className="px-2 py-1.5 text-center">
                  {a.status === 'scheduled' ? <button onClick={() => cancel(a)} className="text-red-700 font-bold hover:underline" data-testid={`announcement-cancel-${a.id}`}>Cancel</button> : null}
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={4} className="px-2 py-6 text-center text-gray-500">No announcements yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
