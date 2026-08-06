import React, { useState, useEffect, useCallback } from 'react';
import { dbAdapter as supabase } from '../../lib/db-adapter';
import { Trash2, Edit2, Plus, X, Package, Truck } from 'lucide-react';
import { FulfillmentManager } from './FulfillmentManager';
import { confirm, appAlert } from "@/lib/confirm";

/**
 * AddOn interface representing the structure of an add-on in the database
 */
interface AddOn {
  addon_id: number;
  name: string;
  description: string;
  price: number;
  duration_minutes: number;
  pricing_type: 'flat' | 'per_item';
  service_id?: number;
  business_type: string;
  storeid: number;
}

/**
 * Service interface for linked service dropdown
 */
interface Service {
  service_id: number;
  name: string;
}

/**
 * Props for the AddOnsManager component
 */
interface AddOnsManagerProps {
  storeId?: number;
  businessType?: string;
}

/**
 * AddOnsManager component - Manages add-on services for a specific store and business type.
 * Redesigned to match the enterprise "Stock Items" aesthetic with high-density data tables
 * and a dark blue/light gray color scheme.
 */
export const AddOnsManager: React.FC<AddOnsManagerProps> = ({
  storeId,
  businessType
}) => {
  const [items, setItems] = useState<AddOn[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [view, setView] = useState<'addons' | 'fulfillment'>('addons');
  
  const [formData, setFormData] = useState<Partial<AddOn>>({
    name: '',
    description: '',
    price: 0,
    duration_minutes: 0,
    pricing_type: 'flat',
    service_id: 0
  });

  /**
   * Fetches add-ons and services from Supabase
   */
  const fetchData = useCallback(async () => {
    if (!storeId) return;
    try {
      setLoading(true);
      
      // Fetch add-ons
      let addonsQuery = supabase
        .from('addons')
        .select('*')
        .eq('storeid', storeId);
      
      if (businessType) {
        addonsQuery = addonsQuery.eq('business_type', businessType);
      }

      const { data: addonsData, error: addonsError } = await addonsQuery.order('addon_id');
      
      if (addonsError) {
        if (addonsError.code === '42703' && businessType) {
          console.warn('business_type column missing in addons, retrying with storeid only');
          const { data: retryData, error: retryError } = await supabase
            .from('addons')
            .select('*')
            .eq('storeid', storeId)
            .order('addon_id');
          if (retryError) throw retryError;
          
          const mappedData = (retryData || []).map((item: any) => ({
            ...item,
            duration_minutes: item.duration_minutes || item.duration_mins || 0
          }));
          setItems(mappedData);
        } else {
          throw addonsError;
        }
      } else {
        const mappedData = (addonsData || []).map((item: any) => ({
          ...item,
          duration_minutes: item.duration_minutes || item.duration_mins || 0
        }));
        setItems(mappedData);
      }

      // Fetch services for dropdown
      let servicesQuery = supabase
        .from('services')
        .select('service_id, name')
        .eq('storeid', storeId);
      
      if (businessType) {
        servicesQuery = servicesQuery.eq('business_type', businessType);
      }

      const { data: servicesData, error: servicesError } = await servicesQuery.order('name');
        
      if (servicesError) {
        if (servicesError.code === '42703' && businessType) {
          console.warn('business_type column missing in services, retrying with storeid only');
          const { data: retryServices, error: retryServicesError } = await supabase
            .from('services')
            .select('service_id, name')
            .eq('storeid', storeId)
            .order('name');
          if (retryServicesError) throw retryServicesError;
          setServices(retryServices || []);
        } else {
          throw servicesError;
        }
      } else {
        setServices(servicesData || []);
      }

    } catch (error) {
      console.error('Error fetching data:', error);
    }
    finally {
      setLoading(false);
    }
  }, [businessType, storeId]);

  useEffect(() => {
    if (view === 'addons') {
      fetchData();
    }
  }, [businessType, storeId, view, fetchData]);

  /**
   * Prepares the form for editing an existing add-on
   */
  const handleEdit = (addon: AddOn) => {
    setEditingId(addon.addon_id);
    setFormData({
      name: addon.name,
      description: addon.description,
      price: addon.price,
      duration_minutes: addon.duration_minutes,
      pricing_type: addon.pricing_type,
      service_id: addon.service_id || 0
    });
    setIsAdding(false);
  };

  /**
   * Deletes an add-on after confirmation
   */
  const handleDelete = async (id: number) => {
    if (!(await confirm("Are you sure you want to delete this add-on?", { destructive: true }))) return;
    
    try {
      const performDelete = async (useBusinessType: boolean) => {
        let query = supabase
          .from('addons')
          .delete()
          .eq('addon_id', id)
          .eq('storeid', storeId);
        
        if (useBusinessType && businessType) {
          query = query.eq('business_type', businessType);
        }
        
        return await query;
      };

      let { error } = await performDelete(true);
      
      if (error) {
        if (error.code === '42703' && businessType) {
          console.warn('business_type column missing during delete, retrying with storeid only');
          const retry = await performDelete(false);
          error = retry.error;
        }
        
        if (error) throw error;
      }
      
      fetchData();
    } catch (error) {
      console.error('Error deleting addon:', error);
      void appAlert("Error deleting addon. It might be referenced by other records.");
    }
  };

  /**
   * Saves or updates an add-on
   */
  const handleSave = async () => {
    if (!storeId) {
      void appAlert("Missing store configuration");
      return;
    }

    try {
      const payload: any = { 
        name: formData.name,
        price: formData.price,
        pricing_type: formData.pricing_type,
        storeid: storeId
      };

      if (formData.service_id && formData.service_id !== 0) payload.service_id = formData.service_id;
      if (businessType) payload.business_type = businessType;
      if (formData.description) payload.description = formData.description;

      const durationValue = formData.duration_minutes || 0;
      payload.duration_minutes = durationValue;
      payload.duration_mins = durationValue;

      const performSave = async (data: any) => {
        if (editingId) {
          return await supabase
            .from('addons')
            .update(data)
            .eq('addon_id', editingId)
            .eq('storeid', storeId);
        } else {
          return await supabase
            .from('addons')
            .insert([data]);
        }
      };

      let { error } = await performSave(payload);
      
      if (error) {
        console.warn('Initial save failed, attempting recovery:', error);
        
        if (error.code === '42703' && payload.duration_minutes !== undefined) {
          const { duration_minutes, ...rest } = payload;
          const retry = await performSave(rest);
          error = retry.error;
        }

        if (error?.code === '42703' && payload.duration_mins !== undefined) {
          const { duration_mins, ...rest } = payload;
          const retry = await performSave(rest);
          error = retry.error;
        }

        if (error?.code === '42703' && payload.business_type) {
          const { business_type, ...rest } = payload;
          const retry = await performSave(rest);
          error = retry.error;
        }

        if (error?.code === '42703' && payload.service_id) {
          const { service_id, ...rest } = payload;
          const retry = await performSave(rest);
          error = retry.error;
        }

        if (error?.code === '42703' && payload.description) {
          const { description, ...rest } = payload;
          const retry = await performSave(rest);
          error = retry.error;
        }

        if (error) throw error;
      }

      setIsAdding(false);
      setEditingId(null);
      setFormData({
        name: '',
        description: '',
        price: 0,
        duration_minutes: 0,
        pricing_type: 'flat',
        service_id: 0
      });
      fetchData();
    } catch (error) {
      console.error('Error saving addon:', error);
      void appAlert(`Error saving addon: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  if (!storeId) {
    return <div className="p-6 text-gray-400 italic">Initializing store data...</div>;
  }

  return (
    <div className="flex flex-col h-full bg-[#E0E0E0] text-gray-800 font-sans text-xs select-none overflow-hidden">
      {/* Header Bar */}
      <div className="bg-[#2D3E50] text-white p-1 flex justify-between items-center shadow-md">
        <div className="flex items-center space-x-4 ml-2">
          <button
            onClick={() => setView('addons')}
            className={`flex items-center space-x-2 px-3 py-1 transition-colors ${
              view === 'addons' ? 'bg-blue-600 text-white' : 'text-blue-200 hover:bg-[#3a5068]'
            }`}
          >
            <Package size={16} />
            <span className="text-sm font-bold uppercase tracking-wider">Add-Ons Management</span>
          </button>
          <button
            onClick={() => setView('fulfillment')}
            className={`flex items-center space-x-2 px-3 py-1 transition-colors ${
              view === 'fulfillment' ? 'bg-blue-600 text-white' : 'text-blue-200 hover:bg-[#3a5068]'
            }`}
          >
            <Truck size={16} />
            <span className="text-sm font-bold uppercase tracking-wider">Fulfillment Management</span>
          </button>
          {view === 'addons' && (
            <span className="text-[10px] bg-blue-500/30 px-2 py-0.5 rounded border border-blue-400/30 text-blue-100 font-bold uppercase">
              {businessType?.replace(/_/g, ' ') || 'STORE'}
            </span>
          )}
        </div>
        
        {view === 'addons' && (
          <div className="flex items-center space-x-1">
            <button 
              onClick={() => {
                setIsAdding(true);
                setEditingId(null);
                setFormData({
                  name: '',
                  description: '',
                  price: 0,
                  duration_minutes: 0,
                  pricing_type: 'flat',
                  service_id: services[0]?.service_id || 0
                });
              }}
              className="bg-green-700 hover:bg-green-600 px-3 py-1 flex flex-col items-center justify-center border border-gray-600 transition-colors"
            >
              <Plus size={16} />
              <span className="text-[9px] font-bold mt-0.5 uppercase">Add Add-On</span>
            </button>
          </div>
        )}
      </div>

      {view === 'addons' && (
        <>
          {/* Editor Panel - Conditional */}
          {(isAdding || editingId) && (
            <div className="bg-white border-b border-gray-400 p-4 shadow-inner">
              <div className="max-w-4xl mx-auto">
                <div className="flex items-center justify-between mb-4 border-b border-gray-200 pb-2">
                  <h3 className="text-[#2D3E50] text-sm font-black uppercase tracking-tight">
                    {isAdding ? 'Create New Add-On' : `Editing Add-On: ${formData.name}`}
                  </h3>
                  <button 
                    onClick={() => { setIsAdding(false); setEditingId(null); }}
                    className="text-gray-400 hover:text-red-600 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>
                
                <div className="grid grid-cols-12 gap-4 mb-4">
                  <div className="col-span-6 flex flex-col">
                    <label className="text-[9px] font-black text-gray-500 uppercase mb-1">Add-On Name</label>
                    <input
                      type="text"
                      value={formData.name || ''}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      className="bg-white border border-blue-300 px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 font-bold uppercase text-blue-900"
                      placeholder="e.g. FRENCH TIPS"
                    />
                  </div>
                  <div className="col-span-3 flex flex-col">
                    <label className="text-[9px] font-black text-gray-500 uppercase mb-1">Price ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.price || 0}
                      onChange={e => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                      className="bg-white border border-blue-300 px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 font-bold font-mono text-green-700"
                    />
                  </div>
                  <div className="col-span-3 flex flex-col">
                    <label className="text-[9px] font-black text-gray-500 uppercase mb-1">Duration (Mins)</label>
                    <input
                      type="number"
                      value={formData.duration_minutes || 0}
                      onChange={e => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) })}
                      className="bg-white border border-blue-300 px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 font-bold"
                    />
                  </div>

                  <div className="col-span-6 flex flex-col">
                    <label className="text-[9px] font-black text-gray-500 uppercase mb-1">Linked Service</label>
                    <select
                      value={formData.service_id || 0}
                      onChange={e => setFormData({ ...formData, service_id: parseInt(e.target.value) })}
                      className="bg-white border border-blue-300 px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 font-bold uppercase"
                    >
                      <option value={0}>GENERIC / ALL SERVICES</option>
                      {services.map(service => (
                        <option key={service.service_id} value={service.service_id}>{service.name.toUpperCase()}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-6 flex flex-col">
                    <label className="text-[9px] font-black text-gray-500 uppercase mb-1">Pricing Type</label>
                    <select
                      value={formData.pricing_type || 'flat'}
                      onChange={e => setFormData({ ...formData, pricing_type: e.target.value as any })}
                      className="bg-white border border-blue-300 px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 font-bold uppercase"
                    >
                      <option value="flat">FLAT RATE</option>
                      <option value="per_item">PER ITEM / UNIT</option>
                    </select>
                  </div>

                  <div className="col-span-12 flex flex-col">
                    <label className="text-[9px] font-black text-gray-500 uppercase mb-1">Description</label>
                    <textarea
                      value={formData.description || ''}
                      onChange={e => setFormData({ ...formData, description: e.target.value })}
                      className="bg-white border border-blue-300 px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 h-16 resize-none"
                      placeholder="OPTIONAL DESCRIPTION"
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-2 border-t border-gray-100 pt-3">
                  <button
                    onClick={() => { setIsAdding(false); setEditingId(null); }}
                    className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-1.5 font-bold uppercase tracking-wider border border-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    className="bg-blue-700 hover:bg-blue-600 text-white px-6 py-1.5 font-bold uppercase tracking-wider shadow-md transition-colors"
                  >
                    {editingId ? 'Save Changes' : 'Insert Add-On'}
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
                    <th className="w-20 border-r border-gray-300 py-1 font-bold text-center uppercase">Code</th>
                    <th className="w-1/4 border-r border-gray-300 py-1 font-bold pl-2 text-left uppercase">Name / Description</th>
                    <th className="w-1/4 border-r border-gray-300 py-1 font-bold pl-2 text-left uppercase">Linked Service</th>
                    <th className="w-32 border-r border-gray-300 py-1 font-bold text-center uppercase">Price</th>
                    <th className="w-24 border-r border-gray-300 py-1 font-bold text-center uppercase">Duration</th>
                    <th className="w-24 border-r border-gray-300 py-1 font-bold text-center uppercase">Type</th>
                    <th className="w-24 py-1 font-bold text-center uppercase">Actions</th>
                  </tr>
                </thead>
              </table>
            </div>

            {/* Table Body */}
            <div className="flex-1 overflow-auto bg-white">
              <table className="w-full table-fixed border-collapse">
                <tbody className="divide-y divide-gray-200">
                  {items.map((addon) => (
                    <tr key={addon.addon_id} className="hover:bg-blue-50 transition-colors group">
                      <td className="w-20 border-r border-gray-200 px-2 py-1.5 text-center text-blue-800 font-bold">{addon.addon_id}</td>
                      <td className="w-1/4 border-r border-gray-200 px-2 py-1.5 align-top">
                        <div className="font-black uppercase text-[#2D3E50]">{addon.name}</div>
                        <div className="text-[10px] text-gray-500 italic mt-0.5 line-clamp-1">{addon.description || '-'}</div>
                      </td>
                      <td className="w-1/4 border-r border-gray-200 px-2 py-1.5 align-top">
                        <span className="text-[9px] px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-gray-600 font-black uppercase tracking-tighter">
                          {services.find(s => s.service_id === addon.service_id)?.name.toUpperCase() || 'GENERIC'}
                        </span>
                      </td>
                      <td className="w-32 border-r border-gray-200 px-2 py-1.5 text-center font-mono font-bold text-green-700">
                        ${addon.price.toFixed(2)}
                      </td>
                      <td className="w-24 border-r border-gray-200 px-2 py-1.5 text-center text-gray-600 font-bold">
                        {addon.duration_minutes}m
                      </td>
                      <td className="w-24 border-r border-gray-200 px-2 py-1.5 text-center">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border uppercase font-black tracking-tighter ${
                          addon.pricing_type === 'flat' 
                            ? 'bg-blue-100 text-blue-800 border-blue-300' 
                            : 'bg-purple-100 text-purple-800 border-purple-300'
                        }`}>
                          {addon.pricing_type === 'flat' ? 'Flat' : 'Unit'}
                        </span>
                      </td>
                      <td className="w-24 px-2 py-1.5 text-center">
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            onClick={() => handleEdit(addon)}
                            className="p-1 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                            title="Edit"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(addon.addon_id)}
                            className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {items.length === 0 && !loading && (
                    <tr>
                      <td colSpan={7} className="py-20 text-center">
                        <div className="flex flex-col items-center">
                          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-2">
                            <Plus className="w-6 h-6 text-gray-400" />
                          </div>
                          <p className="text-gray-500 font-bold uppercase tracking-wider">No Add-Ons Found</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {view === 'fulfillment' && <FulfillmentManager />}

      {/* Footer Info Bar */}
      <div className="bg-[#F5F5F5] border-t border-gray-300 p-1 px-3 flex justify-between items-center text-[9px] text-gray-500 font-bold uppercase tracking-widest">
        <div>Total Add-Ons: {items.length}</div>
        <div>Store ID: {storeId} | Business: {businessType?.toUpperCase()}</div>
      </div>
    </div>
  );
};
