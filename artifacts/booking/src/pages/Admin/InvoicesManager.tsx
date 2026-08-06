import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { apiRequest } from '../../services/api';
import { format } from 'date-fns';

interface Invoice {
  store_number: number;
  subscription_id: string;
  plan_code: string;
  invoice_id: string;
  invoice_number: string;
  status: string;
  amount_due: number;
  amount_paid: number;
  currency: string;
  due_date: string | null;
  created_date: string;
  hosted_invoice_url: string;
  days_until_cancellation: number | null;
}

export const InvoicesManager: React.FC = () => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const location = useLocation();
  const filter = (location.state as { filter?: string })?.filter || 'all';

  useEffect(() => {
    const fetchInvoices = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await apiRequest('/api/billing/invoices/all');
        let filteredInvoices = response.data;

        if (filter === 'unpaid') {
          filteredInvoices = filteredInvoices.filter((inv: Invoice) => inv.status === 'unpaid');
        } else if (filter === 'past_due') {
          filteredInvoices = filteredInvoices.filter((inv: Invoice) => inv.status === 'past_due');
        }

        setInvoices(filteredInvoices);
      } catch (err: any) {
        console.error('Failed to fetch invoices:', err);
        setError(err.message || 'Failed to fetch invoices');
      } finally {
        setLoading(false);
      }
    };

    fetchInvoices();
  }, [filter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-[#151515] text-white">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-800"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-[#151515] text-red-500">
        <p>Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#151515] text-white p-6">
      <h1 className="text-3xl font-bold mb-6">Invoices Manager</h1>

      <div className="bg-[#1e1e1e] rounded-2xl p-6 shadow-lg">
        {invoices.length === 0 ? (
          <p className="text-gray-400">No invoices found for the selected filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-700">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Store ID</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Subscription</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Due Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Days to Cancel</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Link</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {invoices.map((invoice) => (
                  <tr key={invoice.invoice_id}>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-300">{invoice.store_number}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-300">{invoice.plan_code}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-300">{`${invoice.currency.toUpperCase()} ${(invoice.amount_due / 100).toFixed(2)}`}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-300">{invoice.due_date ? format(new Date(invoice.due_date), 'MMM dd, yyyy') : 'N/A'}</td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm font-medium">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        invoice.status === 'paid' ? 'bg-green-100 text-green-800' :
                        invoice.status === 'unpaid' ? 'bg-red-100 text-red-800' :
                        invoice.status === 'past_due' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {invoice.status.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-300">
                      {invoice.days_until_cancellation !== null ? 
                        (invoice.days_until_cancellation > 0 ? `${invoice.days_until_cancellation} days` : 'Today') 
                        : 'N/A'}
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-sm text-blue-400 hover:underline">
                      <a href={invoice.hosted_invoice_url} target="_blank" rel="noopener noreferrer">View</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};