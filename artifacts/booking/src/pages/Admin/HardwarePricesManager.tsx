import React, { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../services/api';
import { Check } from 'lucide-react';

interface ShopPrice {
  sku: string;
  name: string;
  priceCents: number;
  defaultCents: number;
}

const dollars = (cents: number) => (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));

/**
 * Hardware Prices (owner, 2026-10-24): the price of each device on certxa.com/products, in the cart and at checkout.
 * Saved in shop_prices (api-server lib/shop.ts); the site shows a new price straight away (within 30 seconds).
 */
export const HardwarePricesManager: React.FC = () => {
  const [rows, setRows] = useState<ShopPrice[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const show = (list: ShopPrice[]) => {
    setRows(list);
    setDraft(Object.fromEntries(list.map((r) => [r.sku, dollars(r.priceCents)])));
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest('/api/admin/shop/prices', { method: 'GET' });
      show(Array.isArray(res?.data) ? res.data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load the prices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const changed = rows.filter((r) => {
    const v = Number(draft[r.sku]);
    return Number.isFinite(v) && Math.round(v * 100) !== r.priceCents;
  });
  const invalid = rows.some((r) => { const v = draft[r.sku]; return v === '' || !/^\d+(\.\d{1,2})?$/.test(String(v ?? '').trim()); });

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const prices = Object.fromEntries(changed.map((r) => [r.sku, Math.round(Number(draft[r.sku]) * 100)]));
      const res = await apiRequest('/api/admin/shop/prices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prices }),
      });
      show(Array.isArray(res?.data) ? res.data : rows);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save the prices');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#E0E0E0] text-gray-800 font-sans text-xs select-none overflow-hidden">
      <div className="bg-[#2D3E50] text-white p-1 flex justify-between items-center shadow-md">
        <div className="flex items-center space-x-4 ml-2">
          <span className="text-sm font-bold uppercase tracking-wider">Hardware Prices</span>
        </div>
        <button
          onClick={save}
          disabled={saving || loading || invalid || changed.length === 0}
          className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-4 py-1.5 mr-1 rounded text-[10px] font-bold uppercase tracking-wider shadow-sm flex items-center gap-1"
        >
          <Check size={12} />
          {saving ? 'Saving…' : `Save${changed.length ? ` (${changed.length})` : ''}`}
        </button>
      </div>

      {error && <div className="bg-red-100 border-b border-red-300 text-red-800 px-4 py-2 font-bold">{error}</div>}
      {saved && !error && <div className="bg-green-100 border-b border-green-300 text-green-800 px-4 py-2 font-bold">Saved. certxa.com/products and checkout use the new prices.</div>}

      <div className="flex-1 overflow-auto bg-white m-2 border border-gray-400 shadow-sm">
        <table className="w-full table-fixed border-collapse">
          <thead className="bg-gray-100 border-b border-gray-300 text-[9px] font-black uppercase text-gray-500">
            <tr>
              <th className="border-r border-gray-200 px-2 py-1.5 text-left">Device</th>
              <th className="w-40 border-r border-gray-200 px-2 py-1.5">Price ($)</th>
              <th className="w-40 px-2 py-1.5">Default</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {rows.map((r) => (
              <tr key={r.sku} className="hover:bg-blue-50 transition-colors">
                <td className="border-r border-gray-200 px-2 py-1.5 font-bold text-gray-700 select-text">{r.name}</td>
                <td className="border-r border-gray-200 px-2 py-1">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={draft[r.sku] ?? ''}
                    onChange={(e) => { setSaved(false); setDraft((d) => ({ ...d, [r.sku]: e.target.value.replace(/[^\d.]/g, '') })); }}
                    className="w-full bg-white border border-blue-300 px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500 font-bold text-blue-900 text-right"
                    data-testid={`price-${r.sku}`}
                  />
                </td>
                <td className="px-2 py-1.5 text-center text-gray-500 font-mono">${dollars(r.defaultCents)}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={3} className="px-2 py-6 text-center text-gray-500">No products.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
