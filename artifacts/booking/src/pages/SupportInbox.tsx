import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSelectedStore } from "@/hooks/use-store";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  MessageSquare,
  Plus,
  Send,
  ChevronLeft,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  HelpCircle,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { safeDistanceToNow } from "@/lib/utils";
import { Link } from "react-router-dom";

type Ticket = {
  id: number;
  ticket_number: string;
  subject: string;
  description: string | null;
  priority: string;
  status: string;
  agent_replies: number;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
};

type Message = {
  id: number;
  ticket_id: number;
  author_type: "user" | "agent";
  author_name: string;
  content: string;
  created_at: string;
};

function statusBadge(status: string) {
  switch (status) {
    case "open":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          Open
        </span>
      );
    case "pending":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          <Clock className="w-2.5 h-2.5" />
          Pending
        </span>
      );
    case "closed":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-500 border border-gray-200">
          <CheckCircle2 className="w-2.5 h-2.5" />
          Closed
        </span>
      );
    case "escalated":
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200">
          <AlertCircle className="w-2.5 h-2.5" />
          Escalated
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600 border border-gray-200">
          {status}
        </span>
      );
  }
}

function NewTicketModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (ticket: Ticket) => void;
}) {
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal");
  const [error, setError] = useState("");

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/my/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ subject, description, priority }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create ticket");
      }
      return res.json() as Promise<Ticket>;
    },
    onSuccess: (ticket) => {
      onCreated(ticket);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">New Support Request</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Subject</label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What do you need help with?"
              className="w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the issue in as much detail as possible..."
              rows={5}
              className="w-full resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Priority</label>
            <div className="flex gap-2">
              {(["low", "normal", "high", "urgent"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={cn(
                    "flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all capitalize",
                    priority === p
                      ? "bg-teal-600 border-teal-600 text-white"
                      : "border-gray-200 text-gray-600 hover:border-gray-300"
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => mutate()}
            disabled={!subject.trim() || isPending}
            className="bg-teal-600 hover:bg-teal-700 text-white"
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            Submit Request
          </Button>
        </div>
      </div>
    </div>
  );
}

function ThreadView({
  ticket,
  onBack,
}: {
  ticket: Ticket;
  onBack: () => void;
}) {
  const [reply, setReply] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<{ ticket: Ticket; messages: Message[] }>({
    queryKey: ["/api/my/tickets", ticket.id],
    queryFn: async () => {
      const res = await fetch(`/api/my/tickets/${ticket.id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    refetchInterval: 15_000,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages?.length]);

  const { mutate: sendReply, isPending } = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/my/tickets/${ticket.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content: reply }),
      });
      if (!res.ok) throw new Error("Failed to send");
      return res.json();
    },
    onSuccess: () => {
      setReply("");
      qc.invalidateQueries({ queryKey: ["/api/my/tickets", ticket.id] });
      qc.invalidateQueries({ queryKey: ["/api/my/tickets"] });
    },
  });

  const liveTicket = data?.ticket ?? ticket;
  const messages = data?.messages ?? [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 flex-shrink-0">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 md:hidden"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-gray-900 truncate">{liveTicket.subject}</h2>
            {statusBadge(liveTicket.status)}
          </div>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {liveTicket.ticket_number} · Opened{" "}
            {safeDistanceToNow(new Date(liveTicket.created_at), { addSuffix: true })}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">No messages yet</p>
        ) : (
          messages.map((msg) => {
            const isUser = msg.author_type === "user";
            return (
              <div
                key={msg.id}
                className={cn("flex", isUser ? "justify-end" : "justify-start")}
              >
                <div className={cn("max-w-[80%]", isUser ? "items-end" : "items-start")}>
                  {!isUser && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <div className="w-5 h-5 rounded-full bg-teal-600 flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0">
                        CS
                      </div>
                      <span className="text-[11px] font-semibold text-gray-600">
                        {msg.author_name || "Support Team"}
                      </span>
                    </div>
                  )}
                  <div
                    className={cn(
                      "rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                      isUser
                        ? "bg-teal-600 text-white rounded-tr-sm"
                        : "bg-gray-100 text-gray-800 rounded-tl-sm"
                    )}
                  >
                    {msg.content}
                  </div>
                  <p
                    className={cn(
                      "text-[10px] text-gray-400 mt-1",
                      isUser ? "text-right" : "text-left"
                    )}
                  >
                    {safeDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reply box */}
      {liveTicket.status !== "closed" ? (
        <div className="flex-shrink-0 border-t border-gray-100 px-5 py-3">
          <div className="flex gap-2 items-end">
            <Textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Write a reply..."
              rows={2}
              className="flex-1 resize-none text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && reply.trim() && !isPending) {
                  e.preventDefault();
                  sendReply();
                }
              }}
            />
            <Button
              onClick={() => sendReply()}
              disabled={!reply.trim() || isPending}
              size="sm"
              className="bg-teal-600 hover:bg-teal-700 text-white h-9 w-9 p-0 flex-shrink-0"
            >
              {isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-[10px] text-gray-400 mt-1">⌘ + Enter to send</p>
        </div>
      ) : (
        <div className="flex-shrink-0 border-t border-gray-100 px-5 py-3 text-center text-sm text-gray-400">
          This ticket is closed. <button className="underline text-teal-600 hover:text-teal-700" onClick={onBack}>Open a new request</button>
        </div>
      )}
    </div>
  );
}

export default function SupportInbox() {
  const { selectedStore } = useSelectedStore();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);
  const qc = useQueryClient();

  const { data: tickets = [], isLoading } = useQuery<Ticket[]>({
    queryKey: ["/api/my/tickets"],
    queryFn: async () => {
      const res = await fetch("/api/my/tickets", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    enabled: !!selectedStore?.id,
    refetchInterval: 30_000,
  });

  const selectedTicket = tickets.find((t) => t.id === selectedId) ?? null;

  return (
    <AppLayout fullHeight>
    <div className="flex flex-col flex-1 overflow-hidden bg-gray-50">
      {showNew && (
        <NewTicketModal
          onClose={() => setShowNew(false)}
          onCreated={(ticket) => {
            setShowNew(false);
            qc.invalidateQueries({ queryKey: ["/api/my/tickets"] });
            setSelectedId(ticket.id);
          }}
        />
      )}

      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-teal-50 flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-teal-600" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-gray-900">Support</h1>
            <p className="text-xs text-gray-400">Get help from the Certxa team</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/help"
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-teal-700 transition-colors px-3 py-1.5 rounded-lg hover:bg-teal-50"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Help Center
          </Link>
          <Button
            onClick={() => setShowNew(true)}
            size="sm"
            className="bg-teal-600 hover:bg-teal-700 text-white"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New Request
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Ticket list */}
        <div
          className={cn(
            "w-full md:w-80 xl:w-96 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col overflow-hidden",
            selectedTicket ? "hidden md:flex" : "flex"
          )}
        >
          <div className="px-4 py-3 border-b border-gray-50">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {tickets.length} {tickets.length === 1 ? "Ticket" : "Tickets"}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
              </div>
            ) : tickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <div className="w-12 h-12 rounded-2xl bg-teal-50 flex items-center justify-center mb-3">
                  <HelpCircle className="w-6 h-6 text-teal-400" />
                </div>
                <p className="text-sm font-semibold text-gray-700 mb-1">No support requests yet</p>
                <p className="text-xs text-gray-400 mb-4">
                  Hit the button above to get help from the Certxa support team.
                </p>
                <Button
                  size="sm"
                  onClick={() => setShowNew(true)}
                  className="bg-teal-600 hover:bg-teal-700 text-white"
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Open a Request
                </Button>
              </div>
            ) : (
              tickets.map((ticket) => {
                const isActive = ticket.id === selectedId;
                return (
                  <button
                    key={ticket.id}
                    onClick={() => setSelectedId(ticket.id)}
                    className={cn(
                      "w-full text-left px-4 py-3.5 transition-colors hover:bg-gray-50",
                      isActive && "bg-teal-50 border-l-2 border-teal-500"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-sm font-semibold text-gray-800 truncate leading-tight">
                        {ticket.subject}
                      </p>
                      {statusBadge(ticket.status)}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-gray-400">{ticket.ticket_number}</p>
                      <p className="text-[11px] text-gray-400 flex-shrink-0">
                        {safeDistanceToNow(
                          new Date(ticket.last_message_at ?? ticket.updated_at),
                          { addSuffix: true }
                        )}
                      </p>
                    </div>
                    {ticket.agent_replies > 0 && (
                      <p className="text-[11px] text-teal-600 mt-0.5 font-medium">
                        {ticket.agent_replies} {ticket.agent_replies === 1 ? "reply" : "replies"} from support
                      </p>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Thread view */}
        <div
          className={cn(
            "flex-1 overflow-hidden",
            !selectedTicket ? "hidden md:flex items-center justify-center" : "flex flex-col"
          )}
        >
          {selectedTicket ? (
            <ThreadView
              ticket={selectedTicket}
              onBack={() => setSelectedId(null)}
            />
          ) : (
            <div className="text-center px-8">
              <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
                <MessageSquare className="w-7 h-7 text-gray-300" />
              </div>
              <p className="text-sm font-semibold text-gray-500 mb-1">Select a conversation</p>
              <p className="text-xs text-gray-400">
                Choose a support request from the list to view the thread.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
    </AppLayout>
  );
}
