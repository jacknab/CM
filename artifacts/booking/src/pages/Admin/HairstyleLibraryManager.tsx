import React, { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../services/api';

/**
 * Hairstyle Library (Last Cut Formula Phase 4): reference images for Certxa's 200 global hairstyles.
 * Upload an image to a style and pick its view (front, left, right, back, detail), preview it, then approve or reject.
 * "Replace" uploads a new image for the same view; approving it retires the old one. Only approved images ever reach
 * barbers (the Last Cut Formula panels and the hairstyle picker). Server: routes/hairstyleAdmin.ts (platform admins).
 */
const VIEWS = ['front', 'left', 'right', 'back', 'detail'] as const;
type View = (typeof VIEWS)[number];
type Row = { id: number; slug: string; name: string; status: string; category: { slug: string; name: string }; approved: Record<string, number>; pending: number; missingViews: string[] };
type Img = { id: number; view: View; url: string; status: 'pending' | 'approved' | 'rejected'; source: string; altText: string | null; createdAt: string; metadata: Record<string, unknown> };
type Detail = { hairstyle: { id: number; slug: string; name: string; description: string | null; aliases: string[]; category: { name: string } }; images: Img[] };

async function uploadImage(path: string, file: File, fields: Record<string, string>) {
  const form = new FormData();
  form.append('image', file);
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const r = await fetch(path, { method: 'POST', body: form, credentials: 'include' });
  const data = await r.json().catch(() => null);
  if (!r.ok) throw new Error(data?.message || `Upload failed (${r.status})`);
  return data;
}

export const HairstyleLibraryManager: React.FC = () => {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'' | 'missing' | 'pending'>('');
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Img | null>(null);

  const loadList = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ ...(q ? { q } : {}), ...(filter ? { images: filter } : {}) });
      const res = await apiRequest(`/api/admin/hairstyles?${qs}`);
      setRows(res.hairstyles ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load the library'); }
  }, [q, filter]);
  const loadDetail = useCallback(async (id: number) => {
    try { setDetail(await apiRequest(`/api/admin/hairstyles/${id}`)); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load the style'); }
  }, []);
  useEffect(() => { const t = setTimeout(() => void loadList(), 200); return () => clearTimeout(t); }, [loadList]);
  useEffect(() => { if (selected) void loadDetail(selected); }, [selected, loadDetail]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); if (selected) await loadDetail(selected); await loadList(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong'); }
    finally { setBusy(false); }
  };
  const post = (path: string, body?: unknown) => apiRequest(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) });

  const upload = (view: View, file: File | undefined) => file && selected && act(() => uploadImage(`/api/admin/hairstyles/${selected}/images`, file, { view, source: 'certxa_artwork' }));
  const replace = (img: Img, file: File | undefined) => file && act(() => uploadImage(`/api/admin/hairstyles/images/${img.id}/replace`, file, {}));
  const approve = (img: Img) => act(() => post(`/api/admin/hairstyles/images/${img.id}/approve`));
  const reject = (img: Img) => { const reason = window.prompt('Why is this image rejected? (shown to admins only)') ?? ''; return act(() => post(`/api/admin/hairstyles/images/${img.id}/reject`, { reason })); };
  const moveView = (img: Img, view: View) => act(() => apiRequest(`/api/admin/hairstyles/images/${img.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ view }) }));

  return (
    <div className="flex flex-col h-full bg-[#E0E0E0] text-gray-800 font-sans text-xs overflow-hidden" data-testid="admin-hairstyle-library">
      <div className="bg-[#2D3E50] text-white p-1 flex justify-between items-center shadow-md">
        <span className="text-sm font-bold uppercase tracking-wider ml-2">Hairstyle Library · Reference Images</span>
        <span className="mr-2 text-[10px] text-gray-300">Only approved images are shown to barbers</span>
      </div>
      {error && <div className="bg-red-100 border-b border-red-300 text-red-800 px-4 py-2 font-bold" role="alert">{error}</div>}

      <div className="flex flex-1 min-h-0 m-2 gap-2">
        <div className="w-80 flex flex-col bg-white border border-gray-400 shadow-sm min-h-0">
          <div className="p-2 border-b border-gray-300 flex flex-col gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search styles" className="border border-gray-300 px-2 py-1.5" />
            <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className="border border-gray-300 px-2 py-1.5">
              <option value="">All styles ({rows.length})</option>
              <option value="missing">Missing a required view</option>
              <option value="pending">Waiting for approval</option>
            </select>
          </div>
          <ul className="flex-1 overflow-auto divide-y divide-gray-200">
            {rows.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setSelected(r.id)} className={`w-full text-left px-2 py-2 hover:bg-blue-50 ${selected === r.id ? 'bg-blue-100' : ''}`}>
                  <div className="font-bold text-gray-800">{r.name}</div>
                  <div className="text-[10px] text-gray-500">{r.category.name}{r.missingViews.length ? ` · missing ${r.missingViews.join(', ')}` : ' · all views approved'}{r.pending ? ` · ${r.pending} pending` : ''}</div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex-1 bg-white border border-gray-400 shadow-sm overflow-auto p-3 min-w-0">
          {!detail ? <p className="text-gray-500">Choose a style on the left.</p> : (
            <>
              <h2 className="text-base font-bold">{detail.hairstyle.name}</h2>
              <p className="text-gray-600 mb-1">{detail.hairstyle.category.name} · {detail.hairstyle.description}</p>
              <p className="text-gray-500 mb-3">Aliases: {detail.hairstyle.aliases.join(', ') || 'none'}</p>
              <div className="grid grid-cols-5 gap-2">
                {VIEWS.map((view) => {
                  const imgs = detail.images.filter((i) => i.view === view);
                  return (
                    <div key={view} className="border border-gray-300 p-2 flex flex-col gap-2" data-testid={`admin-view-${view}`}>
                      <div className="font-black uppercase text-[10px] text-gray-600">{view}{view === 'detail' ? ' (optional)' : ''}</div>
                      {imgs.length === 0 && <div className="text-gray-400">No image yet</div>}
                      {imgs.map((img) => (
                        <div key={img.id} className={`border p-1 ${img.status === 'rejected' ? 'opacity-50' : ''} ${img.status === 'approved' ? 'border-gray-800' : 'border-gray-300'}`}>
                          <button type="button" onClick={() => setPreview(img)} className="block w-full"><img src={img.url} alt={img.altText ?? `${detail.hairstyle.name} ${view}`} className="w-full aspect-square object-cover bg-gray-100" /></button>
                          <div className="text-[10px] font-bold uppercase mt-1">{img.status}{img.metadata?.replaces ? ` · replaces #${img.metadata.replaces}` : ''}</div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {img.status !== 'approved' && <button type="button" disabled={busy} onClick={() => void approve(img)} className="bg-[#2D3E50] text-white px-2 py-0.5 rounded">Approve</button>}
                            {img.status !== 'rejected' && <button type="button" disabled={busy} onClick={() => void reject(img)} className="border border-gray-400 px-2 py-0.5 rounded">Reject</button>}
                            <label className="border border-gray-400 px-2 py-0.5 rounded cursor-pointer">Replace<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void replace(img, e.target.files?.[0])} /></label>
                            <select value={img.view} disabled={busy} onChange={(e) => void moveView(img, e.target.value as View)} className="border border-gray-300 text-[10px]" aria-label="View">
                              {VIEWS.map((v) => <option key={v} value={v}>{v}</option>)}
                            </select>
                          </div>
                        </div>
                      ))}
                      <label className="border border-dashed border-gray-400 px-2 py-2 text-center cursor-pointer hover:bg-gray-50">
                        {busy ? 'Working…' : 'Upload image'}
                        <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={busy} onChange={(e) => void upload(view, e.target.files?.[0])} data-testid={`admin-upload-${view}`} />
                      </label>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {preview && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setPreview(null)} role="dialog" aria-label="Image preview">
          <figure className="bg-white p-3 max-w-[80vw]" onClick={(e) => e.stopPropagation()}>
            <img src={preview.url} alt={preview.altText ?? ''} className="max-h-[70vh] object-contain" />
            <figcaption className="text-xs mt-2">{preview.view} · {preview.status} · {preview.source.replace(/_/g, ' ')} · uploaded {new Date(preview.createdAt).toLocaleString()}</figcaption>
          </figure>
        </div>
      )}
    </div>
  );
};

export default HairstyleLibraryManager;
