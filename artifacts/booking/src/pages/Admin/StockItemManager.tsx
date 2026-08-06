import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { 
  Search, 
  Edit3, 
  X,
  Eye
} from 'lucide-react';

interface StoreAccount {
  id: number;
  name: string;
  user_id: string | null;
  booking_slug: string | null;
  category: string | null;
  email: string | null;
  timezone: string;
  address: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  commission_payout_frequency: string;
  subscription: string;
  accountStatus: string;
}

interface StockItemManagerProps {
  onClose?: () => void;
}

export const StockItemManager: React.FC<StockItemManagerProps> = ({ 
  onClose 
}) => {
  const navigate = useNavigate();
  const [items, setItems] = useState<StoreAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditMode, setIsEditMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  
  // Filters for store columns
  const [filters, setFilters] = useState({
    name: '',
    user_id: '',
    booking_slug: '',
    category: '',
    email: '',
    subscription: '',
    accountStatus: ''
  });

  useEffect(() => {
    const fetchItems = async () => {
      try {
        setLoading(true);
        
        // Fetch all store accounts from the admin API
        const response = await fetch('/api/admin/stores');
        if (!response.ok) {
          throw new Error('Failed to fetch stores');
        }
        
        const storesData = await response.json();
        setItems(storesData || []);
      } catch (error) {
        console.error('Error fetching store accounts:', error);
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    fetchItems();
  }, []);

  const handleLiveUpdate = async (id: number, field: string, value: any) => {
    setItems(items.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    ));
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = 
      (item.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
      (item.booking_slug || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.user_id || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesFilters = Object.entries(filters).every(([key, value]) => {
      if (!value) return true;
      const itemValue = (item as any)[key];
      if (itemValue === null || itemValue === undefined) return false;
      return itemValue.toString().toLowerCase().includes(value.toLowerCase());
    });

    return matchesSearch && matchesFilters;
  });

  return (
    <div className="flex flex-col h-full bg-[#E0E0E0] text-gray-800 font-sans text-xs select-none overflow-hidden">
      {/* Top Header Bar */}
      <div className="bg-[#2D3E50] text-white p-1 flex justify-between items-center shadow-md">
        <div className="flex items-center space-x-4 ml-2">
          <span className="text-sm font-bold uppercase tracking-wider">Store Accounts</span>
          <div className="flex items-center bg-white rounded px-2 py-0.5 text-gray-800">
            <span className="text-[10px] mr-2 text-gray-500 uppercase font-bold">Search</span>
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent outline-none w-32 border-l border-gray-300 pl-2"
              placeholder="Name, slug, or user ID..."
            />
            <Search size={14} className="text-gray-400" />
          </div>
        </div>
        
        <div className="flex items-center space-x-1">
          <button 
            onClick={() => setIsEditMode(!isEditMode)}
            className={`px-3 py-1 flex flex-col items-center justify-center border border-gray-600 transition-colors ${isEditMode ? 'bg-yellow-500 text-black' : 'bg-gray-700 hover:bg-gray-600'}`}
          >
            <Edit3 size={16} />
            <span className="text-[9px] font-bold mt-0.5 uppercase">Edit Mode</span>
          </button>
          <button 
            onClick={onClose}
            className="bg-red-800 hover:bg-red-700 p-2 border border-gray-600"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full table-fixed border-collapse">
          <thead className="sticky top-0 z-10 bg-[#F5F5F5] text-gray-600 border-b border-gray-300 shadow-sm">
            <tr>
              <th className="w-32 border-r border-gray-300 py-1 font-normal pl-2 text-left">Name</th>
              <th className="w-28 border-r border-gray-300 py-1 font-normal text-center">Subscription</th>
              <th className="w-32 border-r border-gray-300 py-1 font-normal text-center">Booking Slug</th>
              <th className="w-24 border-r border-gray-300 py-1 font-normal text-center">Category</th>
              <th className="w-32 border-r border-gray-300 py-1 font-normal text-center">Email</th>
              <th className="w-24 border-r border-gray-300 py-1 font-normal text-center">Account Status</th>
            </tr>
              {/* Filter Row */}
              <tr className="bg-white">
                <td className="border-r border-gray-300 px-1 py-0.5">
                  <input 
                    value={filters.name}
                    onChange={(e) => setFilters({...filters, name: e.target.value})}
                    className="w-full border border-gray-200 px-1 outline-none focus:border-blue-500" 
                  />
                </td>
                <td className="border-r border-gray-300 px-1 py-0.5">
                  <input 
                    value={filters.subscription}
                    onChange={(e) => setFilters({...filters, subscription: e.target.value})}
                    className="w-full border border-gray-200 px-1 outline-none focus:border-blue-500 text-center" 
                  />
                </td>
                <td className="border-r border-gray-300 px-1 py-0.5">
                  <input 
                    value={filters.booking_slug}
                    onChange={(e) => setFilters({...filters, booking_slug: e.target.value})}
                    className="w-full border border-gray-200 px-1 outline-none focus:border-blue-500 text-center" 
                  />
                </td>
                <td className="border-r border-gray-300 px-1 py-0.5">
                  <input 
                    value={filters.category}
                    onChange={(e) => setFilters({...filters, category: e.target.value})}
                    className="w-full border border-gray-200 px-1 outline-none focus:border-blue-500 text-center" 
                  />
                </td>
                <td className="border-r border-gray-300 px-1 py-0.5">
                  <input 
                    value={filters.email}
                    onChange={(e) => setFilters({...filters, email: e.target.value})}
                    className="w-full border border-gray-200 px-1 outline-none focus:border-blue-500 text-center" 
                  />
                </td>
                <td className="border-r border-gray-300 px-1 py-0.5">
                  <input 
                    value={filters.accountStatus}
                    onChange={(e) => setFilters({...filters, accountStatus: e.target.value})}
                    className="w-full border border-gray-200 px-1 outline-none focus:border-blue-500 text-center" 
                  />
                </td>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200">
              {filteredItems.map((item) => {
                const isSelected = selectedStoreId === item.id;
                return (
                  <tr 
                    key={item.id} 
                    className={`transition-colors cursor-pointer ${isSelected ? 'bg-blue-200' : 'hover:bg-blue-50'}`}
                    onClick={() => setSelectedStoreId(item.id)}
                  >
                    <td className="w-32 border-r border-gray-200 px-2 py-1 font-medium">
                      {isEditMode ? (
                        <input 
                          defaultValue={item.name}
                          onBlur={(e) => handleLiveUpdate(item.id, 'name', e.target.value)}
                          className="w-full px-1 bg-white border border-blue-300 outline-none focus:ring-1 focus:ring-blue-500"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        item.name
                      )}
                    </td>

                    <td className="w-28 border-r border-gray-200 px-2 py-1 text-center">
                      {isEditMode ? (
                        <input 
                          defaultValue={item.subscription || ''}
                          onBlur={(e) => handleLiveUpdate(item.id, 'subscription', e.target.value)}
                          className="w-full px-1 bg-white border border-blue-300 outline-none focus:ring-1 focus:ring-blue-500 text-center"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-green-100 text-green-700">
                          {item.subscription || 'None'}
                        </span>
                      )}
                    </td>

                    <td className="w-32 border-r border-gray-200 px-2 py-1 text-center font-mono text-xs">
                      {isEditMode ? (
                        <input 
                          defaultValue={item.booking_slug || ''}
                          onBlur={(e) => handleLiveUpdate(item.id, 'booking_slug', e.target.value)}
                          className="w-full px-1 bg-white border border-blue-300 outline-none focus:ring-1 focus:ring-blue-500 text-center"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        item.booking_slug || '-'
                      )}
                    </td>

                    <td className="w-24 border-r border-gray-200 px-2 py-1 text-center">
                      {isEditMode ? (
                        <input 
                          defaultValue={item.category || ''}
                          onBlur={(e) => handleLiveUpdate(item.id, 'category', e.target.value)}
                          className="w-full px-1 bg-white border border-blue-300 outline-none focus:ring-1 focus:ring-blue-500 text-center"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-gray-100 text-gray-700">
                          {item.category || 'N/A'}
                        </span>
                      )}
                    </td>

                    <td className="w-32 border-r border-gray-200 px-2 py-1 text-center">
                      {isEditMode ? (
                        <input 
                          defaultValue={item.email || ''}
                          onBlur={(e) => handleLiveUpdate(item.id, 'email', e.target.value)}
                          className="w-full px-1 bg-white border border-blue-300 outline-none focus:ring-1 focus:ring-blue-500 text-center"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className="text-xs text-blue-600">
                          {item.email || '-'}
                        </span>
                      )}
                    </td>

                    <td className="w-24 border-r border-gray-200 px-2 py-1 text-center">
                      {isEditMode ? (
                        <input 
                          defaultValue={item.accountStatus || ''}
                          onBlur={(e) => handleLiveUpdate(item.id, 'accountStatus', e.target.value)}
                          className="w-full px-1 bg-white border border-blue-300 outline-none focus:ring-1 focus:ring-blue-500 text-center"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          item.accountStatus === 'active' 
                            ? 'bg-green-100 text-green-700' 
                            : item.accountStatus === 'trialing'
                            ? 'bg-blue-100 text-blue-700'
                            : item.accountStatus === 'past_due'
                            ? 'bg-red-100 text-red-700'
                            : item.accountStatus === 'canceled'
                            ? 'bg-gray-100 text-gray-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {item.accountStatus || 'Inactive'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          
          {loading && (
            <div className="flex justify-center items-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800"></div>
            </div>
          )}
          
          {!loading && filteredItems.length === 0 && (
            <div className="text-center py-20 text-gray-400 italic">
              No store accounts found.
            </div>
          )}
      </div>

      {/* Bottom Toolbar */}
      <div className="bg-[#404040] text-gray-200 p-1 flex justify-between items-center border-t border-gray-600 shadow-inner">
        <div className="flex items-center space-x-4 ml-2">
          <span className="text-[10px] font-bold text-gray-400">{filteredItems.length} records</span>
        </div>
        
        <div className="flex space-x-1 mr-2">
          <button 
            disabled={!selectedStoreId}
            onClick={() => selectedStoreId && navigate(`/isadmin/store-entry/${selectedStoreId}`)}
            className={`px-8 py-1.5 border border-[#333333] flex items-center space-x-1.5 transition-all ${selectedStoreId ? 'bg-blue-700 hover:bg-blue-600 text-white' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}
          >
            <Eye size={12} />
            <span className="uppercase text-[9px] font-bold">View Account</span>
          </button>
          <button 
            onClick={() => setIsEditMode(true)}
            className="bg-[#555555] hover:bg-blue-800 px-8 py-1.5 border border-[#333333] flex items-center space-x-1.5 transition-all text-blue-200"
          >
            <Edit3 size={12} />
            <span className="uppercase text-[9px] font-bold">Modify</span>
          </button>
        </div>
      </div>
    </div>
  );
};
