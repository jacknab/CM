import React, { useState, useEffect } from 'react';
import { dbAdapter as supabase } from '../../lib/db-adapter';
import { Search } from 'lucide-react';

interface SubscriptionRow {
  id: number;
  store_number: number;
  plan_code: string;
  status: string;
  current_period_end: string | null;
  interval: string;
  amount: number | null;
  plan_name: string | null;
}

interface UnifiedServiceManagerProps {
  storeId?: number;
  businessType?: string;
}

export const UnifiedServiceManager: React.FC<UnifiedServiceManagerProps> = () => {
  const [items, setItems] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // 1. Fetch subscriptions
      const { data: subsData, error: subsError } = await supabase
        .from('subscriptions')
        .select('*')
        .order('store_number');
      
      if (subsError) throw subsError;

      // 2. Fetch billing plans to get amounts and names
      const { data: plansData, error: plansError } = await supabase
        .from('billing_plans')
        .select('*');

      if (plansError) console.error('Error fetching plans:', plansError);

      // 3. Map data
      const plansMap = new Map(plansData?.map((p: any) => [p.code, p]));

      const formattedData: SubscriptionRow[] = (subsData || []).map((sub: any) => {
        const plan = plansMap.get(sub.plan_code);
        return {
          id: sub.id,
          store_number: sub.store_number,
          plan_code: sub.plan_code,
          status: sub.status,
          current_period_end: sub.current_period_end,
          interval: sub.interval || 'month',
          amount: plan ? (plan as any).price_cents / 100 : null,
          plan_name: plan ? (plan as any).name : sub.plan_code
        };
      });

      setItems(formattedData);

    } catch (error) {
      console.error('Error fetching subscriptions:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    // Handle unix timestamp if it's a number string
    if (!isNaN(Number(dateString)) && dateString.length > 10) { // millisecond timestamp
        return new Date(Number(dateString)).toLocaleDateString();
    }
    if (!isNaN(Number(dateString))) { // unix timestamp (seconds)
        return new Date(Number(dateString) * 1000).toLocaleDateString();
    }
    return new Date(dateString).toLocaleDateString();
  };

  const filteredItems = items.filter(item => 
    item.store_number.toString().includes(searchQuery) ||
    (item.plan_code || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-[#E0E0E0] text-gray-800 font-sans text-xs select-none overflow-hidden">
      {/* Top Header Bar */}
      <div className="bg-[#2D3E50] text-white p-1 flex justify-between items-center shadow-md">
        <div className="flex items-center space-x-4 ml-2">
          <span className="text-sm font-bold uppercase tracking-wider">Store Subscriptions</span>
          <div className="flex items-center bg-white rounded px-2 py-0.5 text-gray-800">
            <span className="text-[10px] mr-2 text-gray-500 uppercase font-bold">Search</span>
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent outline-none w-48 border-l border-gray-300 pl-2"
              placeholder="Store ID, Sub ID, or Plan..."
            />
            <Search size={14} className="text-gray-400" />
          </div>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full table-fixed border-collapse">
          <thead className="sticky top-0 z-10 bg-[#F5F5F5] text-gray-600 border-b border-gray-300 shadow-sm">
            <tr>
              <th className="w-24 border-r border-gray-300 py-1 font-normal text-center">Store ID</th>
              <th className="w-40 border-r border-gray-300 py-1 font-normal text-center">Plan Name</th>
              <th className="w-24 border-r border-gray-300 py-1 font-normal text-center">Amount</th>
              <th className="w-24 border-r border-gray-300 py-1 font-normal text-center">Interval</th>
              <th className="w-24 border-r border-gray-300 py-1 font-normal text-center">Status</th>
              <th className="w-32 border-r border-gray-300 py-1 font-normal text-center">Renewal Date</th>
              <th className="w-24 border-r border-gray-300 py-1 font-normal text-center">Sub ID</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredItems.map((item) => (
              <tr key={item.id} className="hover:bg-blue-50 transition-colors">
                <td className="w-24 border-r border-gray-200 px-2 py-1.5 text-center text-blue-800 font-bold">{item.store_number}</td>
                <td className="w-40 border-r border-gray-200 px-2 py-1.5 text-center font-medium uppercase text-[#2D3E50]">
                  {item.plan_name || item.plan_code}
                </td>
                <td className="w-24 border-r border-gray-200 px-2 py-1.5 text-center font-mono font-bold text-green-700">
                  {item.amount !== null ? `$${item.amount.toFixed(2)}` : '-'}
                </td>
                <td className="w-24 border-r border-gray-200 px-2 py-1.5 text-center uppercase text-xs">
                  {item.interval}
                </td>
                <td className="w-24 border-r border-gray-200 px-2 py-1.5 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    item.status === 'active' ? 'bg-green-100 text-green-800' : 
                    item.status === 'canceled' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {item.status}
                  </span>
                </td>
                <td className="w-32 border-r border-gray-200 px-2 py-1.5 text-center font-mono text-xs">
                  {formatDate(item.current_period_end)}
                </td>
                <td className="w-24 border-r border-gray-200 px-2 py-1.5 text-center font-mono text-xs text-gray-500">
                  #{item.id}
                </td>
              </tr>
            ))}
            {items.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="py-20 text-center text-gray-400 italic">
                  No subscription records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        
        {loading && (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800"></div>
          </div>
        )}
      </div>
      
      {/* Bottom Footer */}
      <div className="bg-[#404040] text-gray-200 p-1 flex justify-between items-center border-t border-gray-600 shadow-inner">
        <div className="ml-2">
          <span className="text-[10px] font-bold text-gray-400">{items.length} records</span>
        </div>
      </div>
    </div>
  );
};
