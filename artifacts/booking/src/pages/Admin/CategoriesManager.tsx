import React, { useState, useEffect, useCallback } from 'react';
import { dbAdapter as supabase } from '../../lib/db-adapter';
import { Trash2, Edit2, Plus, X } from 'lucide-react';
import { confirm, appAlert } from "@/lib/confirm";

interface Category {
  category_id: number;
  name: string;
  description: string;
  color: string;
  business_type: string;
  storeid: number;
}

interface CategoriesManagerProps {
  storeId?: number;
  businessType?: string;
}

export const CategoriesManager: React.FC<CategoriesManagerProps> = ({ 
  storeId,
  businessType
}) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState<Partial<Category>>({
    name: '',
    description: '',
    color: 'none'
  });

  const fetchCategories = useCallback(async () => {
    if (!storeId) return;
    try {
      setLoading(true);
      let query = supabase
        .from('categories')
        .select('*')
        .eq('storeid', storeId);
      
      if (businessType) {
        query = query.eq('business_type', businessType);
      }

      const { data, error } = await query.order('category_id');
      
      if (error) {
        // Fallback if business_type column doesn't exist yet
        if (error.code === '42703' && businessType) {
          console.warn('business_type column missing, retrying with storeid only');
          const { data: retryData, error: retryError } = await supabase
            .from('categories')
            .select('*')
            .eq('storeid', storeId)
            .order('category_id');
          if (retryError) throw retryError;
          setCategories(retryData || []);
          return;
        }
        throw error;
      }
      setCategories(data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setLoading(false);
    }
  }, [businessType, storeId]);

  useEffect(() => {
    fetchCategories();
  }, [businessType, storeId, fetchCategories]);

  const handleEdit = (category: Category) => {
    setEditingId(category.category_id);
    setFormData({
      name: category.name,
      description: category.description,
      color: category.color
    });
    setIsAdding(false);
  };

  const handleDelete = async (id: number) => {
    if (!(await confirm("Are you sure you want to delete this category?", { destructive: true }))) return;
    
    try {
      const performDelete = async (useBusinessType: boolean) => {
        let query = supabase
          .from('categories')
          .delete()
          .eq('category_id', id)
          .eq('storeid', storeId);
        
        if (useBusinessType && businessType) {
          query = query.eq('business_type', businessType);
        }
        
        return await query;
      };

      let { error } = await performDelete(true);
      
      if (error) {
        // Fallback if business_type column doesn't exist
        if (error.code === '42703' && businessType) {
          console.warn('business_type column missing during delete, retrying with storeid only');
          const retry = await performDelete(false);
          error = retry.error;
        }
        
        if (error) throw error;
      }
      
      fetchCategories();
    } catch (error) {
      console.error('Error deleting category:', error);
      void appAlert("Error deleting category. It might be referenced by other records.");
    }
  };

  const handleSave = async () => {
    if (!storeId) {
      void appAlert("Missing store configuration");
      return;
    }

    try {
      const payload: any = { 
        name: formData.name,
        storeid: storeId
      };

      // Only add optional fields if they are provided
      if (businessType) payload.business_type = businessType;
      if (formData.description) payload.description = formData.description;
      if (formData.color && formData.color !== 'none') payload.color = formData.color;

      const performSave = async (data: any) => {
        if (editingId) {
          return await supabase
            .from('categories')
            .update(data)
            .eq('category_id', editingId)
            .eq('storeid', storeId);
        } else {
          return await supabase
            .from('categories')
            .insert([data]);
        }
      };

      let { error } = await performSave(payload);
      
      if (error) {
        console.warn('Initial save failed, attempting recovery:', error);
        
        // Handle missing business_type
        if (error.code === '42703' && payload.business_type) {
          delete payload.business_type;
          const retry = await performSave(payload);
          error = retry.error;
        }

        // Handle missing color
        if (error?.code === '42703' && payload.color) {
          delete payload.color;
          const retry = await performSave(payload);
          error = retry.error;
        }

        // Handle missing description
        if (error?.code === '42703' && payload.description) {
          delete payload.description;
          const retry = await performSave(payload);
          error = retry.error;
        }

        if (error) throw error;
      }
      
      setEditingId(null);
      setIsAdding(false);
      setFormData({ name: '', description: '', color: 'none' });
      fetchCategories();
    } catch (error) {
      console.error('Error saving category:', error);
      void appAlert(`Error saving category: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setIsAdding(false);
    setFormData({ name: '', description: '', color: 'none' });
  };

  if (!storeId) {
    return <div className="p-4 text-gray-500 font-bold uppercase tracking-widest text-[10px]">Initializing store data...</div>;
  }

  return (
    <div className="flex flex-col h-full bg-[#E0E0E0] text-gray-800 font-sans text-xs select-none overflow-hidden">
      {/* Search and Action Bar */}
      <div className="bg-[#2D3E50] text-white p-1 flex justify-between items-center shadow-md">
        <div className="flex items-center space-x-4 ml-2">
          <span className="text-sm font-bold uppercase tracking-wider">Categories</span>
        </div>
        
        <div className="flex items-center space-x-1">
          <button 
            onClick={() => {
              setIsAdding(true);
              setEditingId(null);
              setFormData({ name: '', description: '', color: 'none' });
            }}
            className="bg-green-700 hover:bg-green-600 px-3 py-1 flex flex-col items-center justify-center border border-gray-600 transition-colors"
          >
            <Plus size={16} />
            <span className="text-[9px] font-bold mt-0.5 uppercase">Add Category</span>
          </button>
        </div>
      </div>

      {/* Editor Panel (Conditional) */}
      {(isAdding || editingId) && (
        <div className="bg-white border-b border-gray-400 p-4 shadow-inner">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-4 border-b border-gray-200 pb-2">
              <h3 className="text-[#2D3E50] text-sm font-black uppercase tracking-tight">
                {isAdding ? 'Create New Category' : `Editing Category: ${formData.name}`}
              </h3>
              <button onClick={handleCancel} className="text-gray-400 hover:text-red-600 transition-colors">
                <X size={18} />
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="flex flex-col">
                <label className="text-[9px] font-black text-gray-500 uppercase mb-1">Category Name</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="bg-white border border-blue-300 px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 font-bold uppercase text-blue-900"
                  placeholder="CATEGORY NAME"
                />
              </div>
              <div className="flex flex-col">
                <label className="text-[9px] font-black text-gray-500 uppercase mb-1">Display Color</label>
                <select
                  value={formData.color || 'none'}
                  onChange={e => setFormData({ ...formData, color: e.target.value })}
                  className="bg-white border border-blue-300 px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 font-bold"
                >
                  <option value="none">DEFAULT</option>
                  <option value="pastel-green">PASTEL GREEN</option>
                  <option value="pastel-lemon">PASTEL LEMON</option>
                  <option value="pastel-sky">PASTEL SKY</option>
                  <option value="pastel-pink">PASTEL PINK</option>
                  <option value="pastel-lavender">PASTEL LAVENDER</option>
                  <option value="pastel-peach">PASTEL PEACH</option>
                </select>
              </div>
              <div className="flex flex-col">
                <label className="text-[9px] font-black text-gray-500 uppercase mb-1">Description</label>
                <input
                  type="text"
                  value={formData.description || ''}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="bg-white border border-blue-300 px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="OPTIONAL DESCRIPTION"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 border-t border-gray-100 pt-3">
              <button
                onClick={handleCancel}
                className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-1.5 font-bold uppercase tracking-wider border border-gray-300"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="bg-blue-700 hover:bg-blue-600 text-white px-6 py-1.5 font-bold uppercase tracking-wider shadow-md"
              >
                {editingId ? 'Save Changes' : 'Insert Category'}
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
                <th className="w-64 border-r border-gray-300 py-1 font-bold pl-2 text-left uppercase">Category Name</th>
                <th className="flex-1 border-r border-gray-300 py-1 font-bold pl-2 text-left uppercase">Description</th>
                <th className="w-40 border-r border-gray-300 py-1 font-bold text-center uppercase">Display Color</th>
                <th className="w-24 py-1 font-bold text-center uppercase">Actions</th>
              </tr>
            </thead>
          </table>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-auto bg-white">
          <table className="w-full table-fixed border-collapse">
            <tbody className="divide-y divide-gray-200">
              {categories.map((category) => (
                <tr key={category.category_id} className="hover:bg-blue-50 transition-colors group">
                  <td className="w-20 border-r border-gray-200 px-2 py-1.5 text-center text-blue-800 font-bold">{category.category_id}</td>
                  <td className="w-64 border-r border-gray-200 px-2 py-1.5 font-black uppercase text-[#2D3E50]">
                    {category.name}
                  </td>
                  <td className="flex-1 border-r border-gray-200 px-2 py-1.5 text-gray-600 truncate">
                    {category.description || '-'}
                  </td>
                  <td className="w-40 border-r border-gray-200 px-2 py-1.5 text-center">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter border ${
                      category.color === 'pastel-green' ? 'bg-green-100 text-green-800 border-green-300' :
                      category.color === 'pastel-lemon' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
                      category.color === 'pastel-sky' ? 'bg-blue-100 text-blue-800 border-blue-300' :
                      category.color === 'pastel-pink' ? 'bg-pink-100 text-pink-800 border-pink-300' :
                      category.color === 'pastel-lavender' ? 'bg-purple-100 text-purple-800 border-purple-300' :
                      category.color === 'pastel-peach' ? 'bg-orange-100 text-orange-800 border-orange-300' :
                      'bg-gray-100 text-gray-600 border-gray-300'
                    }`}>
                      {category.color === 'none' ? 'DEFAULT' : category.color.replace('pastel-', '')}
                    </span>
                  </td>
                  <td className="w-24 px-2 py-1.5 text-center">
                    <div className="flex items-center justify-center space-x-1">
                      <button
                        onClick={() => handleEdit(category)}
                        className="p-1 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                        title="Edit"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(category.category_id)}
                        className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {categories.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="py-20 text-center">
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-2">
                        <Plus className="w-6 h-6 text-gray-400" />
                      </div>
                      <p className="text-gray-500 font-bold uppercase tracking-wider">No Categories Found</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
