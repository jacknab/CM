import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

export default function LoginPage() {
  const { agent, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  if (agent) return <Navigate to="/accounts" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await login.mutateAsync({ email, password });
    } catch (err: any) {
      setError(err.message ?? "Login failed");
    }
  };

  return (
    <div className="min-h-screen bg-[#0f1729] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <div className="text-left">
              <div className="text-white font-bold text-lg leading-tight">BACK OFFICE</div>
              <div className="text-slate-400 text-xs">Support Platform</div>
            </div>
          </div>
        </div>

        {/* Card */}
        <div className="bg-[#1a2035] rounded-2xl p-8 shadow-2xl border border-slate-700/50">
          <h1 className="text-white text-xl font-semibold mb-1">Sign in</h1>
          <p className="text-slate-400 text-sm mb-6">Internal support access only</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-slate-300 text-sm mb-1.5 font-medium">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-[#0f1729] border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                placeholder="agent@certxa.com"
                autoFocus
                required
              />
            </div>
            <div>
              <label className="block text-slate-300 text-sm mb-1.5 font-medium">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-[#0f1729] border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2.5 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={login.isPending}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-lg py-2.5 font-medium text-sm transition"
            >
              {login.isPending ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-700">
            <p className="text-slate-500 text-xs text-center">
              Default: <code className="text-slate-400">admin@certxa.com</code> / <code className="text-slate-400">support2024!</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
