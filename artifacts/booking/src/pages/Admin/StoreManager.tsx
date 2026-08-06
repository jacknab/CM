import React, { useState, useEffect, useCallback } from 'react';
import { dbAdapter as supabase } from '../../lib/db-adapter';
import { Plus, Search, Edit2, Trash2, X, ChevronLeft, ChevronRight, Store as StoreIcon, AlertTriangle } from 'lucide-react';
import axios from 'axios';
import { confirm, appAlert } from "@/lib/confirm";
import { apiRequest } from '../../services/api.js';

interface Store {
  id: number;
  store_number?: number | null;
  storeid: number;
  store_name: string;
  phone_number: string;
  pin: string;
  client_name?: string | null;
  email?: string | null;
  review_sms: string;
  checkout_sms: string | null;
  promo_name: string | null;
  promo_sms: string | null;
  promo_trigger: number | null;
  sms_count: number;
  sms_plan: number;
  review_link?: string | null;
  created_at: string;
  month_count: number | null;
  street_address?: string;
  city?: string;
  state?: string;
  zip?: string;
}

interface StoreManagerProps {
  onClose?: () => void;
}

/**
 * StoreManager - Redesigned to match the Enterprise Admin aesthetic.
 * Manages store records, SMS configurations, and client details.
 */
const StoreManager: React.FC<StoreManagerProps> = () => {
  const [stores, setStores] = useState<Store[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  // Default form data
  const defaultFormData: Partial<Store> = {
    store_name: '',
    phone_number: '',
    pin: '',
    storeid: 0,
    store_number: 0,
    review_sms: 'Thank you for visiting! If you enjoyed your experience, please leave us a review.',
    checkout_sms: '',
    promo_name: '',
    promo_sms: '',
    promo_trigger: 10,
    sms_plan: 0,
    sms_count: 0,
    month_count: 0,
    client_name: '',
    email: '',
    street_address: '',
    city: '',
    state: '',
    zip: ''
  };

  const [formData, setFormData] = useState<Partial<Store>>(defaultFormData);

  const ITEMS_PER_PAGE = 20;

  /**
   * Fetch store records
   */
  const fetchStores = useCallback(async () => {
    setIsLoading(true);
    try {
      // Using raw supabase query similar to previous implementation
      const { data, error: dbError } = await supabase
        .from('store')
        .select('*')
        .order('store_number', { ascending: true });

      if (dbError) throw dbError;
      
      const allRows: Store[] = data || [];
      const filtered = searchTerm
        ? allRows.filter(r =>
            String(r.storeid || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (r.store_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (r.phone_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (r.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (r.client_name || '').toLowerCase().includes(searchTerm.toLowerCase())
          )
        : allRows;

      const start = (currentPage - 1) * ITEMS_PER_PAGE;
      const pageRows = filtered.slice(start, start + ITEMS_PER_PAGE);
      setStores(pageRows);
      setTotalPages(Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE)));
    } catch (err) {
      console.error('Error fetching stores:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, searchTerm]);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  /**
   * Handle full store + data deletion
   */
  const handleDeleteStore = useCallback(async (store: Store) => {
    const storeName = store.store_name || `Store #${store.store_number || store.storeid}`;

    // Step 1 – first confirmation
    const step1 = await confirm(
      `⚠️ Delete "${storeName}"?\n\nThis will permanently remove the store, all appointments, clients, staff, SMS logs, payments, and every other record tied to this account. This cannot be undone.`,
      { destructive: true }
    );
    if (!step1) return;

    // Step 2 – extra confirmation by typing store name
    const typedName = window.prompt(`Type the store name exactly to confirm deletion:\n\n"${storeName}"`);
    if (typedName?.trim() !== storeName.trim()) {
      await appAlert("Store name did not match. Deletion cancelled.");
      return;
    }

    try {
      // storeid is the locations.id used by the API server
      await apiRequest(`/api/admin/stores/${store.storeid}`, { method: "DELETE" });
      await appAlert(`"${storeName}" and all its data have been permanently deleted.`);
      fetchStores();
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || "Unknown error";
      await appAlert(`Deletion failed: ${msg}`);
    }
  }, [fetchStores]);

  /**
   * Handle Edit Setup
   */
  const handleEdit = (store: Store) => {
    setEditingId(store.id);
    setFormData({ ...store });
    setShowForm(true);
  };

  /**
   * Handle Form Submit (Create or Update)
   */
  const handleSubmit = async () => {
    setIsLoading(true);
    
    try {
      // If review link is provided and changed, create short URL (logic from original component)
      let shortUrl = formData.review_link;
      if (formData.review_link && (!editingId || formData.review_link !== stores.find(s => s.id === editingId)?.review_link)) {
        try {
          const response = await axios.post('http://149.28.242.6:5000/api/shorten', {
            originalUrl: formData.review_link,
            alias: formData.store_number?.toString()
          });
          shortUrl = response.data.shortUrl;
        } catch (urlErr) {
          console.warn('Could not shorten URL:', urlErr);
        }
      }

      // Format phone number
      const formattedPhone = formData.phone_number?.startsWith('+1')
        ? formData.phone_number
        : formData.phone_number ? `+1${formData.phone_number.replace(/\D/g, '')}` : '';

      const payload = {
        ...formData,
        phone_number: formattedPhone,
        review_link: shortUrl,
      };
      
      // Remove ID from payload for update/insert to avoid conflicts if not needed
      delete payload.id;
      delete payload.created_at;

      let error;
      if (editingId) {
        const { error: updateError } = await supabase
          .from('store')
          .update(payload)
          .eq('id', editingId);
        error = updateError;
      } else {
        const { error: insertError } = await supabase
          .from('store')
          .insert({
            ...payload,
            sms_count: 0
          });
        error = insertError;
      }

      if (error) throw error;

      setShowForm(false);
      setEditingId(null);
      setFormData(defaultFormData);
      fetchStores();
    } catch (err) {
      console.error('Error saving store:', err);
      void appAlert("Failed to save store record. See console for details.");
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Render Form Input Helper
   */
  const renderInput = (label: string, field: keyof Store, type: string = 'text', colSpan: number = 6, placeholder: string = '') => (
    <div className={`col-span-${colSpan} flex flex-col`}>
      <label className="text-[9px] font-black text-gray-500 uppercase mb-1">{label}</label>
      <input
        type={type}
        value={formData[field] === null || formData[field] === undefined ? '' : String(formData[field])}
        onChange={e => setFormData({ ...formData, [field]: type === 'number' ? Number(e.target.value) : e.target.value })}
        className="bg-white border border-blue-300 px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 font-bold uppercase text-blue-900 text-xs"
        placeholder={placeholder}
      />
    </div>
  );

  const renderTextarea = (label: string, field: keyof Store, colSpan: number = 12) => (
    <div className={`col-span-${colSpan} flex flex-col`}>
      <label className="text-[9px] font-black text-gray-500 uppercase mb-1">{label}</label>
      <textarea
        value={formData[field] === null || formData[field] === undefined ? '' : String(formData[field])}
        onChange={e => setFormData({ ...formData, [field]: e.target.value })}
        className="bg-white border border-blue-300 px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 font-medium text-gray-700 text-xs h-16 resize-none"
      />
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-[#E0E0E0] text-gray-800 font-sans text-xs select-none overflow-hidden">
      {/* Header Bar */}
      <div className="bg-[#2D3E50] text-white p-1 flex justify-between items-center shadow-md">
        <div className="flex items-center space-x-4 ml-2">
          <StoreIcon size={18} className="text-blue-300" />
          <span className="text-sm font-bold uppercase tracking-wider">Store Management</span>
          <span className="text-[10px] bg-blue-500/30 px-2 py-0.5 rounded border border-blue-400/30 text-blue-100 font-bold uppercase">
            {stores.length} Records
          </span>
        </div>
        
        <div className="flex items-center space-x-2 mr-2">
          <div className="relative">
            <input
              type="text"
              placeholder="SEARCH STORES..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-[#1a252f] border border-[#34495e] text-white px-3 py-1 rounded text-xs w-48 focus:outline-none focus:border-blue-400 uppercase placeholder-gray-500"
            />
            <Search size={12} className="absolute right-2 top-1.5 text-gray-500" />
          </div>

          <button 
            onClick={() => {
              setEditingId(null);
              setFormData(defaultFormData);
              setShowForm(true);
            }}
            className="bg-green-700 hover:bg-green-600 px-3 py-1 flex items-center space-x-1 border border-green-800 transition-colors shadow-sm"
          >
            <Plus size={14} />
            <span className="text-[10px] font-bold uppercase">Register Store</span>
          </button>
        </div>
      </div>

      {/* Editor Panel */}
      {showForm && (
        <div className="bg-white border-b border-gray-400 p-4 shadow-inner overflow-y-auto max-h-[50vh]">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-4 border-b border-gray-200 pb-2">
              <h3 className="text-[#2D3E50] text-sm font-black uppercase tracking-tight">
                {editingId ? `Editing Store: ${formData.store_name}` : 'Register New Store'}
              </h3>
              <button 
                onClick={() => setShowForm(false)}
                className="text-gray-400 hover:text-red-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="grid grid-cols-12 gap-4">
              {/* General Info */}
              <div className="col-span-12 mb-2 border-b border-gray-100 pb-1">
                <span className="text-xs font-bold text-blue-800 uppercase">General Information</span>
              </div>
              {renderInput('Store Name', 'store_name', 'text', 4)}
              {renderInput('Store ID / Number', 'store_number', 'number', 2)}
              {renderInput('PIN', 'pin', 'text', 2)}
              {renderInput('Client Name', 'client_name', 'text', 4)}
              
              {renderInput('Phone Number', 'phone_number', 'text', 4)}
              {renderInput('Email', 'email', 'text', 4)}
              {renderInput('Street Address', 'street_address', 'text', 4)}
              
              {renderInput('City', 'city', 'text', 3)}
              {renderInput('State', 'state', 'text', 1)}
              {renderInput('Zip', 'zip', 'text', 2)}
              {renderInput('Review Link', 'review_link', 'text', 6)}

              {/* SMS Configuration */}
              <div className="col-span-12 mt-4 mb-2 border-b border-gray-100 pb-1">
                <span className="text-xs font-bold text-blue-800 uppercase">SMS & Promotions</span>
              </div>
              
              {renderInput('SMS Plan', 'sms_plan', 'number', 2)}
              {renderInput('Month Tokens', 'month_count', 'number', 2)}
              {renderInput('Promo Trigger (Pts)', 'promo_trigger', 'number', 2)}
              {renderInput('Promo Name', 'promo_name', 'text', 6)}

              {renderTextarea('Review SMS Template', 'review_sms', 6)}
              {renderTextarea('Checkout SMS Template', 'checkout_sms', 6)}
              
              {renderTextarea('Promo SMS Template', 'promo_sms', 6)}
            </div>

            <div className="flex justify-end space-x-2 border-t border-gray-100 pt-3 mt-4">
              <button
                onClick={() => setShowForm(false)}
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-1.5 font-bold uppercase tracking-wider border border-gray-300 transition-colors text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                className="bg-blue-700 hover:bg-blue-600 text-white px-6 py-1.5 font-bold uppercase tracking-wider shadow-md transition-colors text-xs"
              >
                {editingId ? 'Save Changes' : 'Register Store'}
              </button>
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
                <th className="w-20 border-r border-gray-300 py-1.5 font-bold text-center uppercase text-[10px]">Store ID</th>
                <th className="w-1/4 border-r border-gray-300 py-1.5 font-bold pl-2 text-left uppercase text-[10px]">Store Name / Client</th>
                <th className="w-32 border-r border-gray-300 py-1.5 font-bold pl-2 text-left uppercase text-[10px]">Contact</th>
                <th className="w-24 border-r border-gray-300 py-1.5 font-bold text-center uppercase text-[10px]">Tokens</th>
                <th className="w-24 border-r border-gray-300 py-1.5 font-bold text-center uppercase text-[10px]">Plan</th>
                <th className="w-32 border-r border-gray-300 py-1.5 font-bold text-center uppercase text-[10px]">Last Active</th>
                <th className="w-24 py-1.5 font-bold text-center uppercase text-[10px]">Actions</th>
              </tr>
            </thead>
          </table>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-auto bg-white">
          <table className="w-full table-fixed border-collapse">
            <tbody className="divide-y divide-gray-200">
              {isLoading ? (
                 <tr><td colSpan={7} className="p-4 text-center text-gray-500 italic">Loading stores...</td></tr>
              ) : stores.length === 0 ? (
                 <tr><td colSpan={7} className="p-4 text-center text-gray-500 italic">No stores found.</td></tr>
              ) : (
                stores.map((store) => (
                  <tr key={store.id} className="hover:bg-blue-50 transition-colors group">
                    <td className="w-20 border-r border-gray-200 px-2 py-1.5 text-center text-blue-800 font-bold font-mono">
                      {store.store_number || store.storeid}
                    </td>
                    <td className="w-1/4 border-r border-gray-200 px-2 py-1.5 align-top">
                      <div className="font-black uppercase text-[#2D3E50] truncate">{store.store_name}</div>
                      <div className="text-[10px] text-gray-500 italic mt-0.5 truncate">{store.client_name}</div>
                    </td>
                    <td className="w-32 border-r border-gray-200 px-2 py-1.5 align-top">
                      <div className="font-mono text-xs text-gray-700 truncate">{store.phone_number}</div>
                      <div className="text-[9px] text-gray-400 truncate">{store.email}</div>
                    </td>
                    <td className="w-24 border-r border-gray-200 px-2 py-1.5 text-center">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        (store.month_count || 0) > 100 ? 'bg-green-100 text-green-800' : 
                        (store.month_count || 0) > 0 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {store.month_count || 0}
                      </span>
                    </td>
                    <td className="w-24 border-r border-gray-200 px-2 py-1.5 text-center font-bold text-gray-600">
                      ${store.sms_plan || 0}
                    </td>
                    <td className="w-32 border-r border-gray-200 px-2 py-1.5 text-center text-[10px] text-gray-500">
                      {new Date(store.created_at).toLocaleDateString()}
                    </td>
                    <td className="w-24 px-2 py-1.5 text-center">
                      <div className="flex items-center justify-center space-x-1">
                        <button
                          onClick={() => handleEdit(store)}
                          className="p-1 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteStore(store)}
                          className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Delete store and all data"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="bg-[#E0E0E0] border-t border-gray-400 p-1 flex justify-between items-center px-4">
          <button
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(p => p - 1)}
            className="p-1 rounded hover:bg-gray-300 disabled:opacity-50"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-[10px] font-bold text-gray-600 uppercase">
            Page {currentPage} of {totalPages}
          </span>
          <button
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(p => p + 1)}
            className="p-1 rounded hover:bg-gray-300 disabled:opacity-50"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default StoreManager;
