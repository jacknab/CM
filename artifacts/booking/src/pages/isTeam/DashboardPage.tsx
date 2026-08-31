import { Search } from "lucide-react";

export default function TeamDashboardPage() {
  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">Search Accounts</h1>
        <p className="text-slate-500 text-sm mt-1">Find any customer account by name, email, phone, or account ID</p>
      </div>

      <div className="text-center py-20">
        <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Search size={28} className="text-indigo-400" />
        </div>
        <p className="text-slate-600 font-medium">Search for an account to get started</p>
        <p className="text-slate-400 text-sm mt-1">Use the search bar at the top of the page</p>
      </div>
    </div>
  );
}
