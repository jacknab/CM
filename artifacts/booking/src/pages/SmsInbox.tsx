import { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useSelectedStore } from "@/hooks/use-store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  MessageSquare, Send, ArrowLeft, Phone, Plus, Search, X, User,
  CheckCheck, AlertCircle, Loader2, FlaskConical,
  CheckCircle2, AlertTriangle, WifiOff,
  MoreVertical, Archive, ArchiveRestore, Ban, ShieldOff,
} from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type Conversation = {
  clientPhone: string;
  clientName: string | null;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  direction: "inbound" | "outbound";
  isArchived: boolean;
  isBlocked: boolean;
};

type Message = {
  id: number;
  direction: "inbound" | "outbound";
  body: string;
  createdAt: string;
  readAt: string | null;
  twilioSid: string | null;
};

type ClientResult = {
  id: number;
  fullName: string;
  phone: string | null;
  displayPhone: string | null;
};

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMM d");
}

function formatPhoneNumber(raw: string) {
  const digits = (raw || "").replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length !== 10) return raw;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

function NewConversationModal({
  open,
  onClose,
  storeId,
  onStarted,
}: {
  open: boolean;
  onClose: () => void;
  storeId: number;
  onStarted: (phone: string) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientResult | null>(null);
  const [manualPhone, setManualPhone] = useState("");
  const [message, setMessage] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ClientResult[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setSelectedClient(null);
      setManualPhone("");
      setMessage("");
      setSearchResults([]);
    }
  }, [open]);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/sms-inbox/clients/search?q=${encodeURIComponent(searchQuery)}&storeId=${storeId}`,
          { credentials: "include" }
        );
        const data = await r.json();
        setSearchResults(Array.isArray(data) ? data : []);
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 300);
  }, [searchQuery, storeId]);

  const startMutation = useMutation({
    mutationFn: async () => {
      const phone = selectedClient?.phone || manualPhone;
      const clientName = selectedClient?.fullName || null;
      if (!phone || !message.trim()) throw new Error("Phone and message required");
      const r = await fetch("/api/sms-inbox/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone, body: message.trim(), clientName }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message || "Failed to send");
      }
      return r.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/sms-inbox/conversations", storeId] });
      const phone = (selectedClient?.phone || manualPhone).replace(/\D/g, "");
      onStarted(phone);
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to send", description: err.message, variant: "destructive" });
    },
  });

  const activePhone = selectedClient?.phone || manualPhone;
  const canSend = !!activePhone && !!message.trim() && !startMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Conversation</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Client search */}
          {!selectedClient ? (
            <div>
              <label className="text-sm font-medium mb-1.5 block">Search client or enter phone</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Name or phone number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
                {searching && (
                  <Loader2 className="absolute right-2.5 top-2.5 w-4 h-4 animate-spin text-muted-foreground" />
                )}
              </div>

              {searchResults.length > 0 && (
                <div className="mt-1.5 border rounded-md overflow-hidden">
                  {searchResults.map((c) => (
                    <button
                      key={c.id}
                      className="w-full px-3 py-2.5 text-left hover:bg-muted/50 flex items-center gap-3 border-b last:border-0"
                      onClick={() => {
                        setSelectedClient(c);
                        setSearchQuery("");
                        setSearchResults([]);
                      }}
                    >
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold flex-shrink-0">
                        {c.fullName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.fullName}</p>
                        {c.displayPhone && (
                          <p className="text-xs text-muted-foreground">{c.displayPhone}</p>
                        )}
                        {!c.phone && (
                          <p className="text-xs text-amber-500">No phone on file</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {searchQuery && searchResults.length === 0 && !searching && (
                <div className="mt-3">
                  <p className="text-xs text-muted-foreground mb-1.5">No client found — enter a phone number directly:</p>
                  <Input
                    placeholder="+12125551234"
                    value={manualPhone}
                    onChange={(e) => setManualPhone(e.target.value)}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-md">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                {selectedClient.fullName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{selectedClient.fullName}</p>
                <p className="text-xs text-muted-foreground">{selectedClient.displayPhone || selectedClient.phone}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setSelectedClient(null)}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}

          {/* Manual phone (standalone) */}
          {!selectedClient && !searchQuery && (
            <div>
              <label className="text-sm font-medium mb-1.5 block">Or enter phone number</label>
              <Input
                placeholder="+12125551234"
                value={manualPhone}
                onChange={(e) => setManualPhone(e.target.value)}
              />
            </div>
          )}

          {/* Message */}
          <div>
            <label className="text-sm font-medium mb-1.5 block">First message</label>
            <Textarea
              placeholder="Type your message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && canSend) {
                  e.preventDefault();
                  startMutation.mutate();
                }
              }}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              onClick={() => startMutation.mutate()}
              disabled={!canSend}
            >
              {startMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Send
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function SmsInbox() {
  const { selectedStore } = useSelectedStore();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"inbox" | "archived" | "blocked">("inbox");
  const [newConvOpen, setNewConvOpen] = useState(false);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testMessage, setTestMessage] = useState("Hey, just confirming my appointment!");
  const [confirmBlockOpen, setConfirmBlockOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const selectedPhoneRef = useRef<string | null>(null);
  const storeId = selectedStore?.id;

  // Keep a ref in sync so the WS handler always sees the latest selectedPhone
  // without needing the effect to re-run on every phone change.
  useEffect(() => {
    selectedPhoneRef.current = selectedPhone;
  }, [selectedPhone]);

  // ── WebSocket: real-time inbound push ──────────────────────────────────────
  useEffect(() => {
    if (!storeId) return;

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const url = `${protocol}://${window.location.host}/ws/notifications?storeId=${storeId}`;

    let ws: WebSocket;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let dead = false;

    function connect() {
      if (dead) return;
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        // Heartbeat every 25s to keep the connection alive through proxies
        const ping = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping", ts: Date.now() }));
          }
        }, 25_000);
        ws.addEventListener("close", () => clearInterval(ping));
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type !== "sms_inbound") return;

          // Always refresh the conversation list so the sidebar badge/preview updates
          qc.invalidateQueries({ queryKey: ["/api/sms-inbox/conversations", storeId] });

          // If this message is from the currently-open thread, refresh messages too
          const incomingPhone = (msg.clientPhone as string).replace(/\D/g, "");
          const activePhone   = (selectedPhoneRef.current ?? "").replace(/\D/g, "");
          if (incomingPhone && incomingPhone === activePhone) {
            qc.invalidateQueries({ queryKey: ["/api/sms-inbox/messages", storeId, selectedPhoneRef.current] });
          } else if (msg.clientName || msg.clientPhone) {
            // Toast for messages to a different thread
            toast({
              title: "New SMS",
              description: `${msg.clientName || msg.clientPhone}: ${(msg.body as string).slice(0, 60)}`,
            });
          }
        } catch { /* ignore parse errors */ }
      };

      ws.onclose = () => {
        if (!dead) reconnectTimer = setTimeout(connect, 4_000);
      };

      ws.onerror = () => { ws.close(); };
    }

    connect();

    return () => {
      dead = true;
      clearTimeout(reconnectTimer);
      ws?.close();
      wsRef.current = null;
    };
  }, [storeId, qc, toast]);

  type WebhookStatus = {
    status: "ok" | "misconfigured" | "no_textbelt" | "not_found" | "error";
    phoneNumber: string | null;
    smsUrl: string | null;
    expectedUrl: string | null;
  };

  const { data: webhookStatus, isLoading: webhookLoading } = useQuery<WebhookStatus>({
    queryKey: ["/api/sms-inbox/webhook-status"],
    queryFn: () =>
      fetch("/api/sms-inbox/webhook-status", { credentials: "include" }).then(r => r.json()),
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000, // 5 min — mirrors server-side cache
    gcTime: 10 * 60 * 1000,
    retry: false,
  });

  const { data: conversations = [], isLoading: convsLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/sms-inbox/conversations", storeId, view],
    queryFn: () =>
      fetch(`/api/sms-inbox/conversations?storeId=${storeId}&view=${view}`, { credentials: "include" })
        .then(r => r.json()),
    enabled: !!storeId,
    refetchInterval: 60_000, // Fallback only — WS handles real-time updates
  });

  const { data: messages = [], isLoading: msgsLoading } = useQuery<Message[]>({
    queryKey: ["/api/sms-inbox/messages", storeId, selectedPhone],
    queryFn: () =>
      fetch(`/api/sms-inbox/messages?storeId=${storeId}&phone=${encodeURIComponent(selectedPhone!)}`, {
        credentials: "include",
      }).then(r => r.json()),
    enabled: !!storeId && !!selectedPhone,
    refetchInterval: 60_000, // Fallback only — WS handles real-time updates
  });

  const sendReply = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/sms-inbox/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ storeId, phone: selectedPhone, body: replyText }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to send");
      }
      return res.json();
    },
    onSuccess: () => {
      setReplyText("");
      qc.invalidateQueries({ queryKey: ["/api/sms-inbox/messages", storeId, selectedPhone] });
      qc.invalidateQueries({ queryKey: ["/api/sms-inbox/conversations", storeId] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to send", description: err.message, variant: "destructive" });
    },
  });

  const archiveConv = useMutation({
    mutationFn: async ({ phone, archive }: { phone: string; archive: boolean }) => {
      const res = await fetch("/api/sms-inbox/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone, archive }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Failed");
      return res.json();
    },
    onSuccess: (_data, vars) => {
      setSelectedPhone(null);
      qc.invalidateQueries({ queryKey: ["/api/sms-inbox/conversations", storeId] });
      toast({
        title: vars.archive ? "Conversation archived" : "Conversation unarchived",
        description: vars.archive
          ? "Moved to archive. New replies will restore it to inbox."
          : "Moved back to inbox.",
      });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const blockConv = useMutation({
    mutationFn: async ({ phone, block }: { phone: string; block: boolean }) => {
      const res = await fetch("/api/sms-inbox/block", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone, block }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Failed");
      return res.json();
    },
    onSuccess: (_data, vars) => {
      setSelectedPhone(null);
      setConfirmBlockOpen(false);
      qc.invalidateQueries({ queryKey: ["/api/sms-inbox/conversations", storeId] });
      toast({
        title: vars.block ? "Number blocked" : "Number unblocked",
        description: vars.block
          ? "Inbound messages from this number will be silently discarded."
          : "This number can send messages again.",
      });
    },
    onError: (err: Error) => toast({ title: "Failed", description: err.message, variant: "destructive" }),
  });

  const testInbound = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/sms-inbox/test-inbound", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone: selectedPhone, body: testMessage }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to simulate");
      }
      return res.json();
    },
    onSuccess: () => {
      setTestDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["/api/sms-inbox/messages", storeId, selectedPhone] });
      qc.invalidateQueries({ queryKey: ["/api/sms-inbox/conversations", storeId] });
      toast({ title: "Inbound simulated", description: "A test reply appeared as an inbound message." });
    },
    onError: (err: Error) => {
      toast({ title: "Simulation failed", description: err.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const filteredConversations = search
    ? conversations.filter(c =>
        (c.clientName || "").toLowerCase().includes(search.toLowerCase()) ||
        c.clientPhone.includes(search.replace(/\D/g, ""))
      )
    : conversations;

  const selectedConv = conversations.find(c => c.clientPhone === selectedPhone);
  const totalUnread = conversations.reduce((s, c) => s + c.unreadCount, 0);

  return (
    <AppLayout>
      {storeId && (
        <NewConversationModal
          open={newConvOpen}
          onClose={() => setNewConvOpen(false)}
          storeId={storeId}
          onStarted={(phone) => {
            setSelectedPhone(phone);
            qc.invalidateQueries({ queryKey: ["/api/sms-inbox/conversations", storeId] });
          }}
        />
      )}

      {/* Block confirm dialog */}
      <Dialog open={confirmBlockOpen} onOpenChange={(v) => !v && setConfirmBlockOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Ban className="w-4 h-4" />
              Block this number?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <p className="text-sm text-muted-foreground">
              Blocking{" "}
              <span className="font-medium text-foreground">
                {formatPhoneNumber(selectedPhone ?? "")}
              </span>{" "}
              will silently discard all future inbound SMS from this number. You can unblock
              it at any time from the ⋯ menu.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConfirmBlockOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={blockConv.isPending}
                onClick={() => blockConv.mutate({ phone: selectedPhone!, block: true })}
              >
                {blockConv.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Ban className="w-4 h-4 mr-2" />
                )}
                Block number
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Test inbound dialog */}
      <Dialog open={testDialogOpen} onOpenChange={(v) => !v && setTestDialogOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-primary" />
              Simulate inbound reply
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <p className="text-sm text-muted-foreground">
              This inserts a fake inbound message from{" "}
              <span className="font-medium text-foreground">
                {formatPhoneNumber(selectedPhone ?? "")}
              </span>{" "}
              into the thread — no real SMS is sent or received. Use it to confirm your
              webhook routing is working end-to-end.
            </p>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Message body</label>
              <Textarea
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                rows={2}
                placeholder="What should the test reply say?"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && testMessage.trim()) {
                    e.preventDefault();
                    testInbound.mutate();
                  }
                }}
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Will appear prefixed with <span className="font-mono">[TEST]</span> in the thread.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setTestDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => testInbound.mutate()}
                disabled={!testMessage.trim() || testInbound.isPending}
              >
                {testInbound.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <FlaskConical className="w-4 h-4 mr-2" />
                )}
                Simulate
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
        {/* Conversation list */}
        <div className={cn(
          "w-full md:w-80 flex-shrink-0 border-r bg-background flex flex-col",
          selectedPhone ? "hidden md:flex" : "flex"
        )}>
          {/* Header */}
          <div className="p-4 border-b">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold">SMS Inbox</h1>
                {totalUnread > 0 && (
                  <Badge className="bg-primary text-white text-xs">{totalUnread}</Badge>
                )}
              </div>
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8 flex-shrink-0"
                onClick={() => setNewConvOpen(true)}
                title="New conversation"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                className="pl-8 h-8 text-sm"
                placeholder="Search conversations..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                  onClick={() => setSearch("")}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {/* Webhook health indicator */}
            <div className="flex items-center gap-1.5 mt-2">
              {webhookLoading ? (
                <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
              ) : webhookStatus?.status === "ok" ? (
                <>
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                  <span
                    className="text-xs text-emerald-600 dark:text-emerald-400 cursor-default"
                    title={`Inbound SMS webhook active\nProvider: Textbelt\nSMS URL: ${webhookStatus.smsUrl}`}
                  >
                    Inbound webhook active
                  </span>
                </>
              ) : webhookStatus?.status === "misconfigured" || webhookStatus?.status === "not_found" ? (
                <>
                  <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0" />
                  <span
                    className="text-xs text-amber-600 dark:text-amber-400 cursor-default"
                    title={[
                      "Inbound SMS webhook is not configured correctly.",
                      "Provider: Textbelt",
                      `Current smsUrl: ${webhookStatus.smsUrl ?? "(unset)"}`,
                      `Expected: ${webhookStatus.expectedUrl ?? "unknown"}`,
                    ].join("\n")}
                  >
                    Webhook misconfigured
                  </span>
                </>
              ) : webhookStatus?.status === "no_textbelt" ? (
                <>
                  <WifiOff className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                  <span
                    className="text-xs text-muted-foreground cursor-default"
                    title={"TEXTBELT_API_KEY not configured on this server."}
                  >
                    Textbelt not configured
                  </span>
                </>
              ) : (
                <span className="text-xs text-muted-foreground">Two-way client messaging</span>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {convsLoading ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 gap-3 text-center px-6">
                <MessageSquare className="w-10 h-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  {search
                    ? "No conversations match your search."
                    : "No messages yet. Tap + to start a conversation, or wait for clients to reply."}
                </p>
              </div>
            ) : (
              filteredConversations.map((conv) => (
                <button
                  key={conv.clientPhone}
                  onClick={() => setSelectedPhone(conv.clientPhone)}
                  className={cn(
                    "w-full px-4 py-3 border-b text-left hover:bg-muted/40 transition-colors flex gap-3 items-start",
                    selectedPhone === conv.clientPhone && "bg-primary/5 border-l-2 border-l-primary"
                  )}
                >
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary font-bold text-sm">
                    {(conv.clientName || conv.clientPhone).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm truncate">
                        {conv.clientName || formatPhoneNumber(conv.clientPhone)}
                      </span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {formatTime(conv.lastMessageAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      {conv.direction === "outbound" && (
                        <span className="text-xs text-muted-foreground flex-shrink-0">You: </span>
                      )}
                      {conv.direction === "inbound" && conv.unreadCount > 0 && (
                        <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                      )}
                      <p className={cn(
                        "text-xs truncate",
                        conv.unreadCount > 0 ? "text-foreground font-medium" : "text-muted-foreground"
                      )}>
                        {conv.lastMessage}
                      </p>
                      {conv.unreadCount > 0 && (
                        <Badge className="ml-auto flex-shrink-0 h-4 min-w-[16px] px-1 text-[10px] bg-primary text-white">
                          {conv.unreadCount}
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Message thread */}
        <div className={cn(
          "flex-1 flex flex-col bg-background",
          !selectedPhone ? "hidden md:flex" : "flex"
        )}>
          {!selectedPhone ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
              <MessageSquare className="w-16 h-16 text-muted-foreground/20" />
              <div>
                <p className="font-semibold text-muted-foreground">Select a conversation</p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  Choose a client from the left, or tap{" "}
                  <button
                    className="text-primary underline underline-offset-2"
                    onClick={() => setNewConvOpen(true)}
                  >
                    + New
                  </button>{" "}
                  to start one.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="p-4 border-b flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  onClick={() => setSelectedPhone(null)}
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary font-bold text-sm">
                  {(selectedConv?.clientName || selectedConv?.clientPhone || "?").charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">
                    {selectedConv?.clientName || formatPhoneNumber(selectedPhone)}
                  </p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone className="w-3 h-3" />
                    {formatPhoneNumber(selectedPhone)}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 flex-shrink-0 text-muted-foreground"
                      title="Conversation actions"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {/* Archive / Unarchive */}
                    {selectedConv?.isArchived ? (
                      <DropdownMenuItem
                        className="gap-2"
                        disabled={archiveConv.isPending}
                        onClick={() => archiveConv.mutate({ phone: selectedPhone!, archive: false })}
                      >
                        <ArchiveRestore className="w-4 h-4" />
                        Unarchive
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        className="gap-2"
                        disabled={archiveConv.isPending}
                        onClick={() => archiveConv.mutate({ phone: selectedPhone!, archive: true })}
                      >
                        <Archive className="w-4 h-4" />
                        Archive conversation
                      </DropdownMenuItem>
                    )}

                    {/* Block / Unblock */}
                    {selectedConv?.isBlocked ? (
                      <DropdownMenuItem
                        className="gap-2"
                        disabled={blockConv.isPending}
                        onClick={() => blockConv.mutate({ phone: selectedPhone!, block: false })}
                      >
                        <ShieldOff className="w-4 h-4" />
                        Unblock number
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        className="gap-2 text-destructive focus:text-destructive"
                        onClick={() => setConfirmBlockOpen(true)}
                      >
                        <Ban className="w-4 h-4" />
                        Block number
                      </DropdownMenuItem>
                    )}

                    <DropdownMenuSeparator />

                    {/* Test inbound */}
                    <DropdownMenuItem
                      className="gap-2 text-muted-foreground"
                      onClick={() => {
                        setTestMessage("Hey, just confirming my appointment!");
                        setTestDialogOpen(true);
                      }}
                    >
                      <FlaskConical className="w-4 h-4" />
                      Simulate inbound
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {msgsLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground mt-8">
                    No messages in this conversation yet.
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn("flex", msg.direction === "outbound" ? "justify-end" : "justify-start")}
                    >
                      <div
                        className={cn(
                          "max-w-[72%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                          msg.direction === "outbound"
                            ? "bg-primary text-primary-foreground rounded-br-sm"
                            : "bg-muted text-foreground rounded-bl-sm"
                        )}
                      >
                        <p>{msg.body}</p>
                        <div className={cn(
                          "flex items-center justify-end gap-1 mt-1",
                          msg.direction === "outbound" ? "text-primary-foreground/70" : "text-muted-foreground"
                        )}>
                          <span className="text-[10px]">
                            {format(new Date(msg.createdAt), "h:mm a")}
                          </span>
                          {msg.direction === "outbound" && (
                            msg.twilioSid
                              ? <CheckCheck className="w-3 h-3" />
                              : <AlertCircle className="w-3 h-3" />
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply input */}
              <div className="p-4 border-t bg-background">
                <div className="flex gap-2">
                  <Input
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Type a message..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && replyText.trim()) {
                        e.preventDefault();
                        sendReply.mutate();
                      }
                    }}
                    className="flex-1"
                    disabled={sendReply.isPending}
                  />
                  <Button
                    onClick={() => sendReply.mutate()}
                    disabled={!replyText.trim() || sendReply.isPending}
                    size="icon"
                    className="flex-shrink-0"
                  >
                    {sendReply.isPending
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Send className="w-4 h-4" />
                    }
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  Press Enter to send · SMS credits apply
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
