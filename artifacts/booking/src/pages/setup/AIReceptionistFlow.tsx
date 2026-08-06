/**
 * /setup/ai — AI Receptionist onboarding flow
 * Intro step → redirects to the full enrollment flow.
 */
import { useNavigate } from "react-router-dom";
import { PhoneCall, Check, Bot, Calendar, MessageSquare, Mic } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useUpdateFlowStatus } from "@/hooks/use-setup-progress";

export default function AIReceptionistFlow() {
  const navigate = useNavigate();
  const updateFlow = useUpdateFlowStatus();

  const handleSetup = () => {
    updateFlow.mutate(
      { flowKey: "ai_receptionist", status: "in_progress" },
      { onSuccess: () => navigate("/manage/ai-receptionist/setup") }
    );
  };

  const handleMarkComplete = () => {
    updateFlow.mutate(
      { flowKey: "ai_receptionist", status: "complete" },
      { onSuccess: () => navigate("/setup") }
    );
  };

  const FEATURES = [
    { icon: Calendar, label: "Books appointments automatically via phone" },
    { icon: MessageSquare, label: "Answers common questions about hours, services, and pricing" },
    { icon: Mic, label: "Uses a natural, conversational AI voice" },
    { icon: PhoneCall, label: "Handles missed calls so no client goes unanswered" },
  ];

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* Header */}
        <button onClick={() => navigate("/setup")} className="text-sm text-slate-500 hover:text-slate-800 transition-colors mb-6 flex items-center gap-1">
          ← Back to Setup
        </button>

        {/* Hero */}
        <div className="bg-gradient-to-br from-[#1A0333] to-[#3B0764] rounded-2xl p-8 text-white mb-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="relative">
            <div className="w-12 h-12 bg-white/15 rounded-2xl flex items-center justify-center mb-4">
              <Bot className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold mb-2">AI Receptionist</h1>
            <p className="text-white/70 text-sm leading-relaxed">
              Your salon's 24/7 phone agent. It books appointments, answers questions, and handles
              calls — even when you're with a client.
            </p>
          </div>
        </div>

        {/* Features */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-4">
          <h2 className="text-sm font-bold text-slate-800 mb-4">What it does</h2>
          <div className="space-y-3">
            {FEATURES.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#1A0333]/8 flex items-center justify-center flex-shrink-0">
                  <Icon className="w-4 h-4 text-[#1A0333]" />
                </div>
                <span className="text-sm text-slate-700">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Requirements note */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 mb-6">
          <p className="text-xs font-semibold text-amber-800 mb-1">Requirements</p>
          <p className="text-xs text-amber-700 leading-relaxed">
            A Twilio phone number must be configured on your server. Contact your administrator or{" "}
            <a href="mailto:support@certxa.com" className="underline font-semibold">support@certxa.com</a>{" "}
            to provision a number before completing setup.
          </p>
        </div>

        {/* CTAs */}
        <div className="flex flex-col gap-3">
          <button
            onClick={handleSetup}
            className="flex items-center justify-center gap-2 bg-[#1A0333] hover:bg-[#2d0554] text-white text-sm font-semibold px-6 py-3.5 rounded-xl transition-colors shadow-sm w-full"
          >
            <Bot className="w-4 h-4" />
            Configure AI Receptionist
          </button>
          <button
            onClick={handleMarkComplete}
            disabled={updateFlow.isPending}
            className="flex items-center justify-center gap-2 text-sm font-semibold text-slate-500 border border-slate-200 px-6 py-3 rounded-xl hover:bg-slate-50 transition-colors w-full disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
            {updateFlow.isPending ? "Saving…" : "Mark as complete (already set up)"}
          </button>
          <button onClick={() => navigate("/setup")} className="text-sm text-slate-400 hover:text-slate-600 transition-colors text-center">
            Set this up later
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
