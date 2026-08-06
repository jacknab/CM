import React, { useState, useEffect, useCallback } from 'react';
import { dbAdapter as supabase } from '../../lib/db-adapter';
import { Trash2, Edit2, Plus, Check, X } from 'lucide-react';
import { confirm, appAlert } from "@/lib/confirm";

interface ServiceItem {
  [key: string]: any; // Dynamic ID access
  name: string;
  description: string;
  price: number;
  duration_mins: number;
  category_id: number;
  is_active: boolean;
}

interface Category {
  category_id: number;
  name: string;
}

interface ServiceManagerProps {
  tableName: string;
  title: string;
  idColumn: string;
  defaultCategoryId?: number;
  linkTableName?: string;
}

const STORE_ID = 1;

export const ServiceManager: React.FC<ServiceManagerProps> = ({ 
  tableName, 
  title, 
  idColumn,
  defaultCategoryId,
  linkTableName 
}) => {
  const [items, setItems] = useState<ServiceItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  
  // Add-on management state
  const [, setAvailableAddOns] = useState<any[]>([]);
  const [selectedAddOns, setSelectedAddOns] = useState<number[]>([]);
  const [, setLoadingAddOns] = useState(false);

  const [formData, setFormData] = useState<Partial<ServiceItem>>({
    name: '',
    description: '',
    price: 0,
    duration_mins: 0,
    category_id: defaultCategoryId || 1,
    is_active: true
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch items
      const { data: itemsData, error: itemsError } = await supabase
        .from(tableName)
        .select('*')
        .eq('store_id', STORE_ID)
        .order(idColumn);
      
      if (itemsError) throw itemsError;
      setItems(itemsData || []);

      // Fetch categories for dropdown
      const { data: catData, error: catError } = await supabase
        .from('categories')
        .select('category_id, name')
        .eq('store_id', STORE_ID);
        
      if (catError) throw catError;
      setCategories(catData || []);

      // Fetch available add-ons if linking is enabled
      if (linkTableName) {
        const { data: addonsData, error: addonsError } = await supabase
          .from('addons')
          .select('addon_id, name, price')
          .eq('store_id', STORE_ID)
          .order('name');
          
        if (addonsError) console.error('Error fetching addons:', addonsError);
        else setAvailableAddOns(addonsData || []);
      }

    } catch (error) {
      console.error(`Error fetching ${tableName}:`, error);
    } finally {
      // setLoading(false);
    }
  }, [tableName, idColumn, linkTableName, setItems, setCategories, setAvailableAddOns]);

  const fetchLinkedAddOns = useCallback(async (serviceId: number) => {
    if (!linkTableName) return;
    
    try {
      setLoadingAddOns(true);
      const { data, error } = await supabase
        .from(linkTableName)
        .select('addon_id')
        .eq(idColumn, serviceId);
        
      if (error) throw error;
      setSelectedAddOns(data?.map((item: any) => item.addon_id) || []);
    } catch (error) {
      console.error('Error fetching linked addons:', error);
    } finally {
      // setLoadingAddOns(false);
    }
  }, [linkTableName, idColumn]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleEdit = (item: ServiceItem) => {
    setEditingId(item[idColumn]);
    setFormData(item);
    setIsAdding(false);
    if (linkTableName) {
      fetchLinkedAddOns(item[idColumn]);
    }
  };

  const handleDelete = async (id: number) => {
    if (!(await confirm("Are you sure you want to delete this service?", { destructive: true }))) return;
    
    try {
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq(idColumn, id);
        
      if (error) throw error;
      fetchData();
    } catch (error) {
      console.error('Error deleting item:', error);
      void appAlert("Error deleting item");
    }
  };

  const handleSave = async () => {
    try {
      const payload = { ...formData, store_id: STORE_ID };
      let savedId = editingId;
      
      if (editingId) {
        const { error } = await supabase
          .from(tableName)
          .update(payload)
          .eq(idColumn, editingId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from(tableName)
          .insert([payload])
          .select(idColumn);
          // .single();
        if (error) throw error;
        savedId = data?.[0]?.[idColumn];
      }
      
      // Handle Add-on links
      if (linkTableName && savedId) {
        // Delete existing links
        const { error: deleteError } = await supabase
          .from(linkTableName)
          .delete()
          .eq(idColumn, savedId);
          
        if (deleteError) throw deleteError;
        
        // Insert new links
        if (selectedAddOns.length > 0) {
          const links = selectedAddOns.map(addonId => ({
            store_id: STORE_ID,
            [idColumn]: savedId,
            addon_id: addonId,
            category_id: formData.category_id || defaultCategoryId || 1
          }));
          
          const { error: insertError } = await supabase
            .from(linkTableName)
            .insert(links);
            
          if (insertError) throw insertError;
        }
      }
      
      setEditingId(null);
      setIsAdding(false);
      setFormData({
        name: '',
        description: '',
        price: 0,
        duration_mins: 0,
        category_id: defaultCategoryId || 1,
        is_active: true
      });
      setSelectedAddOns([]);
      fetchData();
    } catch (error) {
      console.error('Error saving item:', error);
      void appAlert("Error saving item");
    }
  };

  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">{title} Manager</h2>
        <button
          onClick={() => {
            setIsAdding(true);
            setEditingId(null);
            setFormData({
              name: '',
              description: '',
              price: 0,
              duration_mins: 0,
              category_id: defaultCategoryId || (categories.length > 0 ? categories[0].category_id : 1),
              is_active: true
            });
          }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700"
        >
          <Plus size={20} />
          Add Service
        </button>
      </div>

      {(isAdding || editingId) && (
        <div className="bg-gray-50 p-4 rounded-lg mb-6 border border-gray-200">
          <h3 className="font-bold mb-4">{isAdding ? 'Add New Service' : 'Edit Service'}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                type="text"
                value={formData.name || ''}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="w-full p-2 border rounded"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Description</label>
              <input
                type="text"
                value={formData.description || ''}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                className="w-full p-2 border rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Price ($)</label>
              <input
                type="number"
                step="0.01"
                value={formData.price || 0}
                onChange={e => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                className="w-full p-2 border rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Duration (mins)</label>
              <input
                type="number"
                value={formData.duration_mins || 0}
                onChange={e => setFormData({ ...formData, duration_mins: parseInt(e.target.value) })}
                className="w-full p-2 border rounded"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Category</label>
              <select
                value={formData.category_id}
                onChange={e => setFormData({ ...formData, category_id: parseInt(e.target.value) })}
                className="w-full p-2 border rounded"
              >
                {categories.map(cat => (
                  <option key={cat.category_id} value={cat.category_id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center mt-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={e => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4"
                />
                <span className="text-sm font-medium">Active</span>
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setEditingId(null);
                setIsAdding(false);
              }}
              className="px-4 py-2 text-gray-600 bg-gray-200 rounded hover:bg-gray-300"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-white bg-green-600 rounded hover:bg-green-700"
            >
              Save
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {items.map((item) => (
              <tr key={item[idColumn]}>
                <td className="px-6 py-4">
                  <div className="font-medium text-gray-900">{item.name}</div>
                  <div className="text-gray-500 text-sm">{item.description}</div>
                  <div className="text-xs text-blue-500 mt-1">
                    {categories.find(c => c.category_id === item.category_id)?.name || 'Unknown Category'}
                  </div>
                </td>
                <td className="px-6 py-4">${item.price.toFixed(2)}</td>
                <td className="px-6 py-4">{item.duration_mins} min</td>
                <td className="px-6 py-4">
                  {item.is_active ? (
                    <span className="flex items-center text-green-600 text-sm"><Check size={16} className="mr-1"/> Active</span>
                  ) : (
                    <span className="flex items-center text-red-600 text-sm"><X size={16} className="mr-1"/> Inactive</span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <button onClick={() => handleEdit(item)} className="text-blue-600 hover:text-blue-900 mr-3">
                    <Edit2 size={18} />
                  </button>
                  <button onClick={() => handleDelete(item[idColumn])} className="text-red-600 hover:text-red-900">
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
