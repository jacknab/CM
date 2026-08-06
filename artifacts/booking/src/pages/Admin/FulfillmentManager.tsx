import React, { useEffect, useState } from 'react';
import { apiRequest } from '../../services/api';

import { Truck, Package, X, FileText, Check, Printer } from 'lucide-react';
/**
 * FulfillmentManager component - Manages device fulfillment and shipping.
 * Styled to match the enterprise "Stock Items" / "Add Ons" aesthetic.
 */
export const FulfillmentManager: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<any[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [serial, setSerial] = useState('');
  const [tracking, setTracking] = useState('');
  const [activeDetails, setActiveDetails] = useState<{ address?: string; city?: string; state?: string; zip?: string; client_name?: string; client_phone?: string; email?: string } | null>(null);
  const [latestInvoiceUrl, setLatestInvoiceUrl] = useState<string | null>(null);
  const [latestInvoice, setLatestInvoice] = useState<any | null>(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceNumbers, setInvoiceNumbers] = useState<Record<string, string | null>>({});

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiRequest('/admin/fulfillment/pending', { method: 'GET' });
        setPending(Array.isArray(res?.data) ? res.data : []);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load pending fulfillments');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  /**
   * Load latest invoice numbers for each pending subscription
   */
  useEffect(() => {
    setInvoiceNumbers({});
  }, [pending]);

  const startFulfill = (row: any) => {
    setActiveId(String(row.id));
    setSerial('');
    setTracking('');
    setActiveDetails(null);
    setLatestInvoiceUrl(null);
  };

  const submit = async () => {
    if (!activeId) return;
    const row = pending.find(p => String(p.id) === activeId);
    if (!row) return;
    setError(null);
    setLoading(true);
    try {
      await apiRequest('/admin/fulfillment/record', {
        method: 'POST',
        body: JSON.stringify({
          store_number: row.store_number,
          serial_number: serial,
          carrier: 'USPS',
          tracking_number: tracking
        })
      });
      setPending(prev => prev.filter(p => String(p.id) !== activeId));
      setActiveId(null);
      setSerial('');
      setTracking('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to record fulfillment');
    } finally {
      setLoading(false);
    }
  };

  const buyAndPrint = async () => {
    if (!activeId) return;
    const row = pending.find(p => String(p.id) === activeId);
    if (!row) return;
    setError(null);
    setLoading(true);
    try {
      let printWin: Window | null = null;
      try { printWin = window.open('', '_blank'); } catch (_) { printWin = null; }
      const res = await apiRequest('/admin/fulfillment/buy-label', {
        method: 'POST',
        body: JSON.stringify({
          store_number: row.store_number,
          serial_number: serial
        })
      });
      const code = String(res?.tracking_code || '');
      const url = String(res?.label_url || '');
      if (code) setTracking(code);
      if (url) {
        try {
          let opened = false;
          const openUrl = (u: string) => {
            if (printWin) { try { printWin.location.href = u; opened = true; return; } catch (_) {} }
            const w = window.open(u, '_blank');
            if (w) { opened = true; return; }
            const a = document.createElement('a');
            a.href = u;
            a.target = '_blank';
            a.rel = 'noopener';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            opened = true;
          };
          if (url.startsWith('data:application/pdf;base64,')) {
            const b64 = url.split(',')[1] || '';
            const bin = atob(b64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const blob = new Blob([bytes], { type: 'application/pdf' });
            const objectUrl = URL.createObjectURL(blob);
            openUrl(objectUrl);
            setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);
          } else {
            openUrl(url);
          }
          if (!opened) {
            setError('Label generated but popups were blocked. Please allow popups for this site.');
            try { window.location.href = url; } catch (_) {}
          }
        } catch (_) {
          setError('Failed to open label preview');
        }
      } else {
        setError('Label URL not returned');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to buy label');
    } finally {
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

      {/* Editor Panel - Active Fulfillment */}
      {activeId && (
        <div className="bg-white border-b border-gray-400 p-4 shadow-inner">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-4 border-b border-gray-200 pb-2">
              <h3 className="text-[#2D3E50] text-sm font-black uppercase tracking-tight">
                Fulfilling Subscription: {activeId}
              </h3>
              <button 
                onClick={() => setActiveId(null)}
                className="text-gray-400 hover:text-red-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="grid grid-cols-12 gap-4 mb-4">
              {/* Tablet Details */}
              <div className="col-span-4 flex flex-col">
                <label className="text-[9px] font-black text-gray-500 uppercase mb-1">Tablet Serial Number</label>
                <input
                  type="text"
                  value={serial}
                  onChange={e => setSerial(e.target.value)}
                  className="bg-white border border-blue-300 px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 font-bold uppercase text-blue-900"
                  placeholder="e.g. R52XXXXXXXX"
                />
              </div>
              <div className="col-span-4 flex flex-col">
                <label className="text-[9px] font-black text-gray-500 uppercase mb-1">Tracking Number</label>
                <input
                  type="text"
                  value={tracking}
                  onChange={e => setTracking(e.target.value)}
                  className="bg-white border border-blue-300 px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 font-bold uppercase text-blue-900"
                  placeholder="e.g. 9400XXXXXXXX"
                />
              </div>
              <div className="col-span-4 flex flex-col">
                 <label className="text-[9px] font-black text-gray-500 uppercase mb-1">Package Type</label>
                 <div className="bg-gray-100 border border-gray-300 px-2 py-1.5 font-bold text-gray-600">
                    USPS Priority Mail — Medium Flat Rate Box
                 </div>
              </div>

              {/* Customer Details */}
              <div className="col-span-6 flex flex-col mt-2">
                <label className="text-[9px] font-black text-gray-500 uppercase mb-1">Shipping Address</label>
                <div className="bg-gray-50 border border-gray-200 p-2 rounded text-[10px] text-gray-700 font-mono leading-tight">
                  {(activeDetails?.client_name || activeDetails?.address) ? (
                    <>
                      <div className="font-bold">{activeDetails?.client_name?.toUpperCase()}</div>
                      <div>{activeDetails?.address?.toUpperCase()}</div>
                      <div>{activeDetails?.city?.toUpperCase()}{activeDetails?.city ? ', ' : ''}{activeDetails?.state?.toUpperCase()} {activeDetails?.zip}</div>
                    </>
                  ) : (
                    <div className="text-gray-400 italic">No address on file</div>
                  )}
                </div>
              </div>

              <div className="col-span-6 flex flex-col mt-2">
                 <label className="text-[9px] font-black text-gray-500 uppercase mb-1">Contact Info</label>
                 <div className="bg-gray-50 border border-gray-200 p-2 rounded text-[10px] text-gray-700 font-mono leading-tight">
                  {(activeDetails?.client_name || activeDetails?.client_phone || activeDetails?.email) ? (
                    <>
                      <div>PHONE: {activeDetails?.client_phone || '—'}</div>
                      <div>EMAIL: {activeDetails?.email?.toUpperCase() || '—'}</div>
                    </>
                  ) : (
                    <div className="text-gray-400 italic">No contact info</div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-between border-t border-gray-100 pt-3">
              <button
                onClick={() => setShowInvoiceModal(true)}
                disabled={!latestInvoice}
                className={`flex items-center gap-1 px-3 py-1.5 font-bold uppercase tracking-wider border transition-colors ${
                  latestInvoice 
                    ? 'bg-purple-100 hover:bg-purple-200 text-purple-800 border-purple-300' 
                    : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                }`}
              >
                <FileText size={14} />
                View Invoice
              </button>

              <div className="flex gap-2">
                <button
                  onClick={() => setActiveId(null)}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-1.5 font-bold uppercase tracking-wider border border-gray-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={buyAndPrint}
                  disabled={loading}
                  className="flex items-center gap-2 bg-indigo-700 hover:bg-indigo-600 text-white px-4 py-1.5 font-bold uppercase tracking-wider shadow-md transition-colors disabled:opacity-50"
                >
                  <Printer size={14} />
                  Buy Label
                </button>
                <button
                  onClick={submit}
                  disabled={!serial || !tracking || loading}
                  className="flex items-center gap-2 bg-green-700 hover:bg-green-600 text-white px-6 py-1.5 font-bold uppercase tracking-wider shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Check size={14} />
                  Complete Fulfillment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Table Container */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Table Header */}
        <div className="overflow-x-auto bg-gray-100 border-b border-gray-400">
          <table className="w-full table-fixed border-collapse">
            <thead className="bg-[#F5F5F5] text-gray-600 border-b border-gray-300">
              <tr>
                <th className="w-32 border-r border-gray-300 py-1 font-bold text-center uppercase">Invoice #</th>
                <th className="w-24 border-r border-gray-300 py-1 font-bold text-center uppercase">Store #</th>
                <th className="w-1/3 border-r border-gray-300 py-1 font-bold pl-2 text-left uppercase">Store Name</th>
                <th className="w-32 border-r border-gray-300 py-1 font-bold text-center uppercase">Plan Code</th>
                <th className="w-24 border-r border-gray-300 py-1 font-bold text-center uppercase">Status</th>
                <th className="w-24 py-1 font-bold text-center uppercase">Action</th>
              </tr>
            </thead>
          </table>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-auto bg-white">
          {loading ? (
             <div className="p-8 text-center text-gray-500 font-bold uppercase tracking-wider">Loading Pending Fulfillments...</div>
          ) : error ? (
             <div className="p-8 text-center text-red-600 font-bold uppercase tracking-wider">Error: {error}</div>
          ) : (
            <table className="w-full table-fixed border-collapse">
              <tbody className="divide-y divide-gray-200">
                {pending.map((row) => (
                  <tr key={row.id} className="hover:bg-blue-50 transition-colors group">
                    <td className="w-32 border-r border-gray-200 px-2 py-1.5 text-center text-gray-600 font-mono font-bold">
                      #{row.id}
                    </td>
                    <td className="w-24 border-r border-gray-200 px-2 py-1.5 text-center text-blue-800 font-bold">
                      {row.store_number}
                    </td>
                    <td className="w-1/3 border-r border-gray-200 px-2 py-1.5 font-black uppercase text-[#2D3E50]">
                      {row.store_name}
                    </td>
                    <td className="w-32 border-r border-gray-200 px-2 py-1.5 text-center text-gray-600 font-bold uppercase">
                      {row.plan_code}
                    </td>
                    <td className="w-24 border-r border-gray-200 px-2 py-1.5 text-center">
                       <span className={`text-[9px] px-1.5 py-0.5 rounded border uppercase font-black tracking-tighter ${
                          row.status === 'active' 
                            ? 'bg-green-100 text-green-800 border-green-300' 
                            : 'bg-yellow-100 text-yellow-800 border-yellow-300'
                        }`}>
                          {row.status}
                       </span>
                    </td>
                    <td className="w-24 px-2 py-1.5 text-center">
                      <button
                        onClick={() => startFulfill(row)}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shadow-sm transition-colors"
                      >
                        Fulfill
                      </button>
                    </td>
                  </tr>
                ))}
                {pending.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-20 text-center">
                      <div className="flex flex-col items-center">
                        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-2">
                          <Package className="w-6 h-6 text-gray-400" />
                        </div>
                        <p className="text-gray-500 font-bold uppercase tracking-wider">No Pending Fulfillments</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Invoice Modal */}
      {showInvoiceModal && latestInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowInvoiceModal(false)}>
          <div className="bg-white border border-gray-400 shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="bg-[#2D3E50] text-white px-4 py-2 flex justify-between items-center">
              <span className="font-bold uppercase tracking-wider">Invoice Details</span>
              <button onClick={() => setShowInvoiceModal(false)} className="text-gray-300 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-3 font-mono text-sm">
              <div className="flex justify-between border-b border-gray-100 pb-2">
                <span className="text-gray-500 font-bold">INVOICE #</span>
                <span className="font-bold">{latestInvoice.number || '—'}</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-2">
                <span className="text-gray-500 font-bold">STATUS</span>
                <span className="uppercase">{latestInvoice.status}</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-2">
                <span className="text-gray-500 font-bold">AMOUNT DUE</span>
                <span className="font-bold text-red-600">${((Number(latestInvoice.amount_due || 0) / 100)).toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-b border-gray-100 pb-2">
                <span className="text-gray-500 font-bold">AMOUNT PAID</span>
                <span className="font-bold text-green-600">${((Number(latestInvoice.amount_paid || 0) / 100)).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 font-bold">DATE</span>
                <span>{latestInvoice.created ? new Date(Number(latestInvoice.created) * 1000).toLocaleDateString() : '—'}</span>
              </div>
            </div>
            <div className="bg-gray-100 p-4 flex justify-end gap-2 border-t border-gray-200">
              <button 
                className="px-4 py-1.5 bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold uppercase text-xs rounded border border-gray-400"
                onClick={() => setShowInvoiceModal(false)}
              >
                Close
              </button>
              <button 
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold uppercase text-xs rounded border border-indigo-700 shadow-sm"
                disabled={!latestInvoiceUrl} 
                onClick={() => {
                  if (!latestInvoiceUrl) return;
                  window.open(latestInvoiceUrl, '_blank');
                }}
              >
                Open in Stripe
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
