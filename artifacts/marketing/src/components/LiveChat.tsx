import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { isLiveChatOpen } from '@/lib/live-chat-hours';

declare global {
  interface Window {
    certxaChat?: { open: () => void; close: () => void };
  }
}

const WIDGET_SRC = `${import.meta.env.BASE_URL}livechat-widget.js`;

/** True only in the browser, and only while live chat is staffed. Rechecked every minute. */
export function useLiveChatOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const check = () => setOpen(isLiveChatOpen());
    check();
    const timer = window.setInterval(check, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return open;
}

/** Loads the chat launcher while live chat is staffed. Renders nothing itself. */
export function LiveChatLauncher() {
  const open = useLiveChatOpen();
  useEffect(() => {
    if (!open || document.querySelector(`script[src="${WIDGET_SRC}"]`)) return;
    const script = document.createElement('script');
    script.src = WIDGET_SRC;
    script.defer = true;
    document.body.appendChild(script);
  }, [open]);
  return null;
}

/** Contact page button that opens the chat. Absent outside staffed hours. */
export function LiveChatButton({ className = '' }: { className?: string }) {
  const open = useLiveChatOpen();
  if (!open) return null;
  return (
    <button
      type="button"
      onClick={() => window.certxaChat?.open()}
      className={`inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity ${className}`}
    >
      <MessageCircle size={16} />
      Chat with us now
    </button>
  );
}
