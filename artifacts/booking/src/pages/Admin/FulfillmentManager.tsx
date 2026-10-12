import React, { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../services/api';

import { X, Check } from 'lucide-react';

interface ShopOrderItem {
  sku: string;
  name: string;
  qty: number;
  unitCents: number;
}

interface ShopOrder {
  id: number;
  order_number: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  zip: string;
  items: ShopOrderItem[];
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
  shipping_service: string;
  paid_at: string;
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/**
 * FulfillmentManager component - hardware shop orders that are paid and waiting to ship.
 * Styled to match the enterprise "Stock Items" / "Add Ons" aesthetic.
 */
export const FulfillmentManager: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<ShopOrder[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [serial, setSerial] = useState('');
  const [tracking, setTracking] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest('/api/admin/fulfillment/pending', { method: 'GET' });
      setPending(Array.isArray(res?.data) ? res.data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const active = pending.find(p => p.id === activeId) ?? null;

  const startFulfill = (row: ShopOrder) => {
    setActiveId(row.id);
    setSerial('');
    setTracking('');
    setError(null);
  };

  const submit = async () => {
    if (!active) return;
    setError(null);
    setLoading(true);
    try {
      await apiRequest('/api/admin/fulfillment/record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: active.id, tracking_number: tracking, serial_numbers: serial }),
      });
      setActiveId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to record the shipment');
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#E0E0E0] text-gray-800 font-sans text-xs select-none overflow-hidden">
      {/* Header Bar */}
      <div className="bg-[#2D3E50] text-white p-1 flex justify-between items-center shadow-md">
        <div className="flex items-center space-x-4 ml-2">
          <span className="text-sm font-bold uppercase tracking-wider">Fulfillment Management</span>
          <span className="text-[10px] bg-blue-500/30 px-2 py-0.5 rounded border border-blue-400/30 text-blue-100 font-bold uppercase">
            {pending.length} Pending
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border-b border-red-300 text-red-800 px-4 py-2 font-bold">{error}</div>
      )}

      {/* Editor Panel - Active Fulfillment */}
      {active && (
        <div className="bg-white border-b border-gray-400 p-4 shadow-inner">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-4 border-b border-gray-200 pb-2">
              <h3 className="text-[#2D3E50] text-sm font-black uppercase tracking-tight">
                Shipping Order: {active.order_number}
              </h3>
              <button onClick={() => setActiveId(null)} className="text-gray-400 hover:text-red-600 transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-12 gap-4 mb-4">
              <div className="col-span-4 flex flex-col">
                <label className="text-[9px] font-black text-gray-500 uppercase mb-1">UPS Tracking Number</label>
                <input
                  type="text"
                  value={tracking}
                  onChange={e => setTracking(e.target.value)}
                  className="bg-white border border-blue-300 px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 font-bold uppercase text-blue-900"
                  placeholder="e.g. 1Z999AA10123456784"
                />
              </div>
              <div className="col-span-4 flex flex-col">
                <label className="text-[9px] font-black text-gray-500 uppercase mb-1">Serial Numbers (optional)</label>
                <input
                  type="text"
                  value={serial}
                  onChange={e => setSerial(e.target.value)}
                  className="bg-white border border-blue-300 px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 font-bold uppercase text-blue-900"
                  placeholder="Separate with commas"
                />
              </div>
              <div className="col-span-4 flex flex-col">
                <label className="text-[9px] font-black text-gray-500 uppercase mb-1">Service</label>
                <div className="bg-gray-100 border border-gray-300 px-2 py-1.5 font-bold text-gray-600">
                  {active.shipping_service} — {money(active.shipping_cents)} charged
                </div>
              </div>

              <div className="col-span-6 flex flex-col mt-2">
                <label className="text-[9px] font-black text-gray-500 uppercase mb-1">Ship To</label>
                <div className="bg-gray-50 border border-gray-200 p-2 rounded text-[10px] text-gray-700 font-mono leading-tight select-text">
                  <div className="font-bold">{active.customer_name.toUpperCase()}</div>
                  <div>{active.address_line1.toUpperCase()}</div>
                  {active.address_line2 && <div>{active.address_line2.toUpperCase()}</div>}
                  <div>{active.city.toUpperCase()}, {active.state} {active.zip}</div>
                  <div className="mt-1">{active.customer_email}{active.customer_phone ? ` · ${active.customer_phone}` : ''}</div>
                </div>
              </div>
              <div className="col-span-6 flex flex-col mt-2">
                <label className="text-[9px] font-black text-gray-500 uppercase mb-1">Items To Pack</label>
                <div className="bg-gray-50 border border-gray-200 p-2 rounded text-[10px] text-gray-700 font-mono leading-tight">
                  {active.items.map(item => (
                    <div key={item.sku} className="flex justify-between">
                      <span className="font-bold">{item.qty} × {item.name.toUpperCase()}</span>
                      <span>{money(item.unitCents * item.qty)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={submit}
                disabled={loading || !tracking.trim()}
                className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white px-4 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider shadow-sm flex items-center gap-1"
              >
                <Check size={12} />
                Mark Shipped
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Orders Table */}
      <div className="flex-1 overflow-auto bg-white m-2 border border-gray-400 shadow-sm">
        <table className="w-full table-fixed border-collapse">
          <thead className="bg-gray-100 border-b border-gray-300 text-[9px] font-black uppercase text-gray-500">
            <tr>
              <th className="w-40 border-r border-gray-200 px-2 py-1.5">Order</th>
              <th className="w-28 border-r border-gray-200 px-2 py-1.5">Paid</th>
              <th className="border-r border-gray-200 px-2 py-1.5 text-left">Customer</th>
              <th className="border-r border-gray-200 px-2 py-1.5 text-left">Items</th>
              <th className="w-24 border-r border-gray-200 px-2 py-1.5">Total</th>
              <th className="w-24 px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {pending.map(row => (
              <tr key={row.id} className="hover:bg-blue-50 transition-colors group">
                <td className="border-r border-gray-200 px-2 py-1.5 text-center text-gray-600 font-mono font-bold">
                  {row.order_number}
                </td>
                <td className="border-r border-gray-200 px-2 py-1.5 text-center text-gray-600 font-bold">
                  {new Date(row.paid_at).toLocaleDateString()}
                </td>
                <td className="border-r border-gray-200 px-2 py-1.5 font-black uppercase text-[#2D3E50] truncate">
                  {row.customer_name} — {row.city}, {row.state}
                </td>
                <td className="border-r border-gray-200 px-2 py-1.5 text-gray-600 font-bold truncate">
                  {row.items.map(i => `${i.qty} × ${i.name}`).join(', ')}
                </td>
                <td className="border-r border-gray-200 px-2 py-1.5 text-center text-blue-800 font-bold">
                  {money(row.total_cents)}
                </td>
                <td className="px-2 py-1.5 text-center">
                  <button
                    onClick={() => startFulfill(row)}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shadow-sm"
                  >
                    Fulfill
                  </button>
                </td>
              </tr>
            ))}
            {!loading && pending.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400 italic">
                  No orders waiting to ship
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
