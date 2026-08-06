import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  HeadphonesIcon,
  MessageCircle,
  Send,
  Loader2,
  Bot,
  User,
  ChevronRight,
  X,
  HelpCircle,
  Ticket,
  Phone,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useLanguage } from "@/hooks/use-language";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

async function sendChatMessage(payload: {
  message: string;
  history: ChatMessage[];
}): Promise<{ reply: string }> {
  const res = await fetch("/api/support-chat/message", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to get response");
  return data;
}

export default function CustomerSupportPage() {
  const navigate = useNavigate();
  const { pick } = useLanguage();

  // Chat state
  const [chatOpen, setChatOpen]     = useState(false);
  const [messages, setMessages]     = useState<ChatMessage[]>([]);
  const [input, setInput]           = useState("");
  const bottomRef                   = useRef<HTMLDivElement>(null);
  const inputRef                    = useRef<HTMLTextAreaElement>(null);

  const t = {
    title:          pick({ en: "Customer Support",                         vi: "Hỗ trợ khách hàng",                 es: "Soporte al cliente",                  fr: "Support client" }),
    subtitle:       pick({ en: "Get help with your Certxa account",        vi: "Nhận hỗ trợ về tài khoản Certxa",   es: "Obtén ayuda con tu cuenta de Certxa",  fr: "Obtenez de l'aide avec votre compte Certxa" }),
    callTitle:      pick({ en: "Call Us",                                  vi: "Gọi cho chúng tôi",                  es: "Llámanos",                             fr: "Appelez-nous" }),
    callSubtitle:   pick({ en: "Phone and email support",                  vi: "Hỗ trợ qua điện thoại và email",     es: "Soporte por teléfono y correo",        fr: "Support par téléphone et e-mail" }),
    callDesc:       pick({ en: "For phone support, contact us and share your account email with the agent.", vi: "Để được hỗ trợ qua điện thoại, hãy liên hệ và cung cấp email tài khoản cho nhân viên hỗ trợ.", es: "Para soporte telefónico, contáctanos y comparte tu correo de cuenta con el agente.", fr: "Pour une assistance téléphonique, contactez-nous et partagez l'e-mail de votre compte avec l'agent." }),
    chatTitle:      pick({ en: "Chat with Support AI",                     vi: "Chat với AI hỗ trợ",                 es: "Chatear con el AI de soporte",         fr: "Discuter avec le support IA" }),
    chatSubtitle:   pick({ en: "Instant answers — always free",            vi: "Câu trả lời ngay lập tức — luôn miễn phí", es: "Respuestas instantáneas — siempre gratis", fr: "Réponses instantanées — toujours gratuit" }),
    chatDesc:       pick({ en: "Ask anything about bookings, billing, staff, reports, or any other Certxa feature.", vi: "Hỏi về đặt lịch, thanh toán, nhân viên, báo cáo hoặc tính năng Certxa.", es: "Pregunta sobre reservas, facturación, personal, informes u otras funciones de Certxa.", fr: "Posez vos questions sur les réservations, la facturation, le personnel ou toute autre fonctionnalité." }),
    startChat:      pick({ en: "Start Chat",                               vi: "Bắt đầu trò chuyện",                 es: "Iniciar chat",                         fr: "Démarrer le chat" }),
    helpTitle:      pick({ en: "Help Center",                              vi: "Trung tâm trợ giúp",                 es: "Centro de ayuda",                      fr: "Centre d'aide" }),
    helpSubtitle:   pick({ en: "Guides, FAQs and how-to articles",         vi: "Hướng dẫn, FAQ và bài viết",          es: "Guías, preguntas frecuentes y artículos", fr: "Guides, FAQ et articles pratiques" }),
    helpDesc:       pick({ en: "Browse step-by-step guides and answers to the most common questions about using Certxa.", vi: "Xem hướng dẫn từng bước và câu trả lời cho các câu hỏi phổ biến nhất.", es: "Explora guías paso a paso y respuestas a las preguntas más comunes.", fr: "Parcourez des guides étape par étape et les réponses aux questions les plus fréquentes." }),
    openHelp:       pick({ en: "Browse Help Articles",                     vi: "Xem bài viết trợ giúp",               es: "Ver artículos de ayuda",               fr: "Parcourir les articles d'aide" }),
    ticketsTitle:   pick({ en: "Support Tickets",                          vi: "Phiếu hỗ trợ",                       es: "Tickets de soporte",                   fr: "Tickets de support" }),
    ticketsSubtitle:pick({ en: "Track and manage your support requests",   vi: "Theo dõi và quản lý yêu cầu hỗ trợ", es: "Sigue y gestiona tus solicitudes",     fr: "Suivez et gérez vos demandes de support" }),
    ticketsDesc:    pick({ en: "Submit a new support request or check the status of an existing ticket.", vi: "Gửi yêu cầu hỗ trợ mới hoặc kiểm tra trạng thái phiếu hiện có.", es: "Envía una nueva solicitud o comprueba el estado de un ticket.", fr: "Soumettez une nouvelle demande ou vérifiez l'état d'un ticket." }),
    openTickets:    pick({ en: "View Support Tickets",                     vi: "Xem phiếu hỗ trợ",                   es: "Ver tickets de soporte",               fr: "Voir les tickets de support" }),
    email:          pick({ en: "Email",                                    vi: "Email",                               es: "Correo",                               fr: "E-mail" }),
    responseTime:   pick({ en: "Response time",                            vi: "Thời gian phản hồi",                  es: "Tiempo de respuesta",                  fr: "Délai de réponse" }),
    within24:       pick({ en: "Within 24 hours",                          vi: "Trong vòng 24 giờ",                   es: "En 24 horas",                          fr: "Sous 24 heures" }),
    otherWays:      pick({ en: "Other ways to reach us",                   vi: "Các cách liên hệ khác",               es: "Otras formas de contactarnos",         fr: "D'autres façons de nous contacter" }),
    hereToHelp:     pick({ en: "We're here to help",                       vi: "Chúng tôi ở đây để giúp",             es: "Estamos aquí para ayudarte",           fr: "Nous sommes là pour vous aider" }),
    supportAssistant: pick({ en: "Support Assistant",                      vi: "Trợ lý hỗ trợ",                       es: "Asistente de soporte",                 fr: "Assistant support" }),
    onlineAlwaysFree: pick({ en: "Online · Always free",                   vi: "Trực tuyến · Luôn miễn phí",          es: "En línea · Siempre gratis",            fr: "En ligne · Toujours gratuit" }),
    placeholder:    pick({ en: "Ask a question…",                          vi: "Đặt câu hỏi…",                        es: "Haz una pregunta…",                    fr: "Posez une question…" }),
    disclaimer:     pick({ en: "Responses are AI-generated. For billing issues, email support@certxa.com", vi: "Câu trả lời do AI tạo ra. Vấn đề thanh toán, email support@certxa.com", es: "Respuestas generadas por IA. Para problemas de facturación, escribe a support@certxa.com", fr: "Réponses générées par IA. Pour les problèmes de facturation, écrivez à support@certxa.com" }),
    suggested:      pick({ en: "Suggested questions",                      vi: "Câu hỏi gợi ý",                       es: "Preguntas sugeridas",                  fr: "Questions suggérées" }),
    errorPrefix:    pick({ en: "Sorry, I ran into an issue:",              vi: "Xin lỗi, tôi gặp sự cố:",             es: "Lo siento, ocurrió un error:",         fr: "Désolé, j'ai rencontré un problème :" }),
    errorSuffix:    pick({ en: "Please try again or email support@certxa.com.", vi: "Vui lòng thử lại hoặc email support@certxa.com.", es: "Inténtalo de nuevo o escribe a support@certxa.com.", fr: "Réessayez ou écrivez à support@certxa.com." }),
    greeting:       pick({ en: "Hi! I'm Certxa's support assistant. I can help you with bookings, billing, staff management, and anything else on the platform. What can I help you with today?", vi: "Xin chào! Tôi là trợ lý hỗ trợ của Certxa. Tôi có thể giúp bạn về đặt lịch, thanh toán, quản lý nhân viên và bất kỳ điều gì khác trên nền tảng. Tôi có thể giúp gì hôm nay?", es: "¡Hola! Soy el asistente de soporte de Certxa. Puedo ayudarte con reservas, facturación, gestión del personal y todo lo demás. ¿En qué puedo ayudarte hoy?", fr: "Bonjour ! Je suis l'assistant support de Certxa. Je peux vous aider avec les réservations, la facturation, la gestion du personnel et tout le reste. Comment puis-je vous aider aujourd'hui ?" }),
  };

  const SUGGESTED_QUESTIONS = [
    pick({ en: "How do I add a new staff member?",   vi: "Làm thế nào để thêm nhân viên mới?",     es: "¿Cómo añado un nuevo miembro del equipo?", fr: "Comment ajouter un nouveau membre du personnel ?" }),
    pick({ en: "How do I set up online booking?",    vi: "Làm thế nào để cài đặt đặt lịch trực tuyến?", es: "¿Cómo configuro la reserva en línea?",  fr: "Comment configurer la réservation en ligne ?" }),
    pick({ en: "How do I process a refund?",         vi: "Làm thế nào để xử lý hoàn tiền?",         es: "¿Cómo proceso un reembolso?",             fr: "Comment traiter un remboursement ?" }),
    pick({ en: "How do loyalty points work?",        vi: "Điểm thưởng hoạt động như thế nào?",       es: "¿Cómo funcionan los puntos de fidelidad?", fr: "Comment fonctionnent les points de fidélité ?" }),
  ];

  const chatMutation = useMutation({
    mutationFn: sendChatMessage,
    onSuccess: (data) => {
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    },
    onError: (err: Error) => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `${t.errorPrefix} ${err.message}. ${t.errorSuffix}` },
      ]);
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatMutation.isPending]);

  const handleOpenChat = () => {
    setChatOpen(true);
    if (messages.length === 0) {
      setMessages([{ role: "assistant", content: t.greeting }]);
    }
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleSend = (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || chatMutation.isPending) return;
    setInput("");
    const newHistory = [...messages, { role: "user" as const, content: msg }];
    setMessages(newHistory);
    chatMutation.mutate({ message: msg, history: messages });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto pb-10">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate("/manage")}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-colors border"
            style={{ background: "#17171A", borderColor: "#27272D" }}
          >
            <ArrowLeft className="w-4 h-4" style={{ color: "#8A8A96" }} />
          </button>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "#F2F2F5", fontFamily: "'Outfit', sans-serif" }}>{t.title}</h1>
            <p className="text-sm mt-0.5" style={{ color: "#8A8A96" }}>{t.subtitle}</p>
          </div>
        </div>

        <div className="space-y-3">

          {/* ── Chat — primary CTA ─────────────────────────────────────────── */}
          <div className="rounded-2xl overflow-hidden border" style={{ borderColor: "#C9F23C33", background: "#17171A" }}>
            <div className="p-6">
              <div className="flex items-center gap-4 mb-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#C9F23C1A" }}>
                  <MessageCircle className="w-5 h-5" style={{ color: "#C9F23C" }} />
                </div>
                <div>
                  <p className="font-semibold text-base" style={{ color: "#F2F2F5" }}>{t.chatTitle}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#8A8A96" }}>{t.chatSubtitle}</p>
                </div>
              </div>
              <p className="text-sm mb-5" style={{ color: "#8A8A96" }}>{t.chatDesc}</p>
              <button
                onClick={handleOpenChat}
                className="w-full flex items-center justify-center gap-2 font-bold rounded-xl py-3.5 text-sm transition-all active:scale-[0.98]"
                style={{ background: "#C9F23C", color: "#0D0D0F" }}
              >
                <MessageCircle className="w-4 h-4" />
                {t.startChat}
              </button>
            </div>
          </div>

          {/* ── Call Us ─────────────────────────────────────────────────────── */}
          <div className="rounded-2xl border overflow-hidden" style={{ background: "#17171A", borderColor: "#27272D" }}>
            <div className="p-6">
              <div className="flex items-center gap-4 mb-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#0D0D0F" }}>
                  <Phone className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <p className="font-semibold text-base" style={{ color: "#F2F2F5" }}>{t.callTitle}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#8A8A96" }}>{t.callSubtitle}</p>
                </div>
              </div>
              <p className="text-sm" style={{ color: "#8A8A96" }}>{t.callDesc}</p>
            </div>
          </div>

          {/* ── Help Center ───────────────────────────────────────────────── */}
          <div className="rounded-2xl border overflow-hidden" style={{ background: "#17171A", borderColor: "#27272D" }}>
            <div className="p-6">
              <div className="flex items-center gap-4 mb-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#0D0D0F" }}>
                  <HelpCircle className="w-5 h-5 text-sky-400" />
                </div>
                <div>
                  <p className="font-semibold text-base" style={{ color: "#F2F2F5" }}>{t.helpTitle}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#8A8A96" }}>{t.helpSubtitle}</p>
                </div>
              </div>
              <p className="text-sm mb-5" style={{ color: "#8A8A96" }}>{t.helpDesc}</p>
              <button
                onClick={() => navigate("/help")}
                className="w-full flex items-center justify-center gap-2 font-semibold rounded-xl py-3 text-sm transition-all active:scale-[0.98] border"
                style={{ background: "#1E1E23", borderColor: "#353540", color: "#F2F2F5" }}
              >
                <HelpCircle className="w-4 h-4" />
                {t.openHelp}
              </button>
            </div>
          </div>

          {/* ── Support Tickets ───────────────────────────────────────────── */}
          <div className="rounded-2xl border overflow-hidden" style={{ background: "#17171A", borderColor: "#27272D" }}>
            <div className="p-6">
              <div className="flex items-center gap-4 mb-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#0D0D0F" }}>
                  <Ticket className="w-5 h-5 text-teal-400" />
                </div>
                <div>
                  <p className="font-semibold text-base" style={{ color: "#F2F2F5" }}>{t.ticketsTitle}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#8A8A96" }}>{t.ticketsSubtitle}</p>
                </div>
              </div>
              <p className="text-sm mb-5" style={{ color: "#8A8A96" }}>{t.ticketsDesc}</p>
              <button
                onClick={() => navigate("/support")}
                className="w-full flex items-center justify-center gap-2 font-semibold rounded-xl py-3 text-sm transition-all active:scale-[0.98] border"
                style={{ background: "#1E1E23", borderColor: "#353540", color: "#F2F2F5" }}
              >
                <Ticket className="w-4 h-4" />
                {t.openTickets}
              </button>
            </div>
          </div>

          {/* ── Contact info ──────────────────────────────────────────────── */}
          <div className="rounded-2xl border p-6" style={{ background: "#17171A", borderColor: "#27272D" }}>
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#0D0D0F" }}>
                <HeadphonesIcon className="w-5 h-5 text-sky-400" />
              </div>
              <div>
                <p className="font-semibold text-base" style={{ color: "#F2F2F5" }}>{t.otherWays}</p>
                <p className="text-xs mt-0.5" style={{ color: "#8A8A96" }}>{t.hereToHelp}</p>
              </div>
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex items-center justify-between py-2.5 border-b" style={{ borderColor: "#27272D" }}>
                <span style={{ color: "#8A8A96" }}>{t.email}</span>
                <a href="mailto:support@certxa.com" className="font-medium hover:underline" style={{ color: "#C9F23C" }}>support@certxa.com</a>
              </div>
              <div className="flex items-center justify-between py-2.5">
                <span style={{ color: "#8A8A96" }}>{t.responseTime}</span>
                <span className="font-medium" style={{ color: "#F2F2F5" }}>{t.within24}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Chat panel ────────────────────────────────────────────────────── */}
      {chatOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setChatOpen(false)} />
          <div
            className="relative z-10 w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden border"
            style={{ height: "clamp(420px, 72vh, 640px)", background: "#17171A", borderColor: "#27272D" }}
          >
            {/* Chat header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0" style={{ borderColor: "#27272D" }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#C9F23C1A" }}>
                <Bot className="w-4 h-4" style={{ color: "#C9F23C" }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm" style={{ color: "#F2F2F5" }}>{t.supportAssistant}</p>
                <p className="text-xs font-medium" style={{ color: "#C9F23C" }}>{t.onlineAlwaysFree}</p>
              </div>
              <button
                onClick={() => setChatOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full transition-colors"
                style={{ background: "#1E1E23" }}
              >
                <X className="w-4 h-4" style={{ color: "#8A8A96" }} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messages.map((msg, i) => (
                <div key={i} className={cn("flex gap-2 items-start", msg.role === "user" ? "flex-row-reverse" : "flex-row")}>
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={msg.role === "user" ? { background: "#C9F23C" } : { background: "#1E1E23" }}
                  >
                    {msg.role === "user"
                      ? <User className="w-3.5 h-3.5" style={{ color: "#0D0D0F" }} />
                      : <Bot className="w-3.5 h-3.5" style={{ color: "#C9F23C" }} />
                    }
                  </div>
                  <div
                    className="max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
                    style={msg.role === "user"
                      ? { background: "#C9F23C", color: "#0D0D0F", borderRadius: "16px 4px 16px 16px" }
                      : { background: "#1E1E23", color: "#F2F2F5", borderRadius: "4px 16px 16px 16px" }
                    }
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {chatMutation.isPending && (
                <div className="flex gap-2 items-start">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: "#1E1E23" }}>
                    <Bot className="w-3.5 h-3.5" style={{ color: "#C9F23C" }} />
                  </div>
                  <div className="rounded-2xl px-4 py-3" style={{ background: "#1E1E23", borderRadius: "4px 16px 16px 16px" }}>
                    <div className="flex gap-1 items-center h-4">
                      <span className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:0ms]" style={{ background: "#5A5A64" }} />
                      <span className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:150ms]" style={{ background: "#5A5A64" }} />
                      <span className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:300ms]" style={{ background: "#5A5A64" }} />
                    </div>
                  </div>
                </div>
              )}

              {messages.length === 1 && !chatMutation.isPending && (
                <div className="space-y-2 pt-1">
                  <p className="text-xs font-medium px-1" style={{ color: "#5A5A64" }}>{t.suggested}</p>
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      onClick={() => handleSend(q)}
                      className="w-full text-left text-xs rounded-xl px-3 py-2.5 transition-colors border"
                      style={{ background: "#1E1E23", borderColor: "#27272D", color: "#8A8A96" }}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="px-4 pb-4 pt-2 border-t shrink-0" style={{ borderColor: "#27272D" }}>
              <div
                className="flex items-end gap-2 rounded-xl px-3 py-2 transition-colors border"
                style={{ background: "#1E1E23", borderColor: "#353540" }}
              >
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={t.placeholder}
                  className="flex-1 resize-none bg-transparent text-sm focus:outline-none min-h-[24px] max-h-[120px]"
                  style={{ color: "#F2F2F5" }}
                  onInput={(e) => {
                    const el = e.currentTarget;
                    el.style.height = "auto";
                    el.style.height = Math.min(el.scrollHeight, 120) + "px";
                  }}
                />
                <button
                  onClick={() => handleSend()}
                  disabled={!input.trim() || chatMutation.isPending}
                  className="w-8 h-8 flex items-center justify-center rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                  style={{ background: "#C9F23C" }}
                >
                  <Send className="w-3.5 h-3.5" style={{ color: "#0D0D0F" }} />
                </button>
              </div>
              <p className="text-[10px] text-center mt-2" style={{ color: "#3A3A42" }}>{t.disclaimer}</p>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
