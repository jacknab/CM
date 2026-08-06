import { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Bell, BellDot, X, Trash2 } from "lucide-react";
import { useNotifications, type AppNotification } from "@/hooks/use-notifications";
import { safeDistanceToNow } from "@/lib/utils";

function notifLabel(n: AppNotification): { title: string; body: string } {
  switch (n.type) {
    case "payment_received":
      return {
        title: "Payment received",
        body: `$${(n.amount || 0).toFixed(0)} from ${n.customerName}`,
      };
    case "appointment_cancelled":
      return {
        title: "Booking cancelled",
        body: `${n.customerName}'s ${n.serviceName || "appointment"} was cancelled`,
      };
    case "appointment_rescheduled":
      return {
        title: "Booking rescheduled",
        body: `${n.customerName}'s ${n.serviceName || "appointment"} was rescheduled`,
      };
    case "support_reply":
      return {
        title: "Support replied",
        body: n.customerName || "You have a new reply from support",
      };
    default:
      return {
        title: "Notification",
        body: n.customerName || "You have a new notification",
      };
  }
}

function typeIcon(type: AppNotification["type"]) {
  switch (type) {
    case "payment_received":
      return "💳";
    case "appointment_cancelled":
      return "❌";
    case "appointment_rescheduled":
      return "🔄";
    case "support_reply":
      return "💬";
    default:
      return "🔔";
  }
}

function NotificationList({
  notifications,
  clearAll,
  onClose,
}: {
  notifications: AppNotification[];
  clearAll: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <p className="text-sm font-semibold text-foreground">Notifications</p>
        <div className="flex items-center gap-2">
          {notifications.length > 0 && (
            <button
              onClick={clearAll}
              className="p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
              title="Clear all"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="overflow-y-auto divide-y divide-border" style={{ maxHeight: "60vh" }}>
        {notifications.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Bell className="w-7 h-7 mx-auto mb-2 opacity-30" />
            No notifications yet
          </div>
        ) : (
          notifications.map((n) => {
            const { title, body } = notifLabel(n);
            return (
              <div
                key={n.id}
                className={`flex items-start gap-3 px-4 py-3 transition-colors ${
                  !n.read ? "bg-violet-50 dark:bg-violet-950/20" : "hover:bg-muted/40"
                }`}
              >
                <span className="text-lg mt-0.5 shrink-0">{typeIcon(n.type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground leading-tight">{title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{body}</p>
                  <p className="text-[11px] text-muted-foreground/60 mt-1">
                    {safeDistanceToNow(new Date(n.ts), { addSuffix: true })}
                  </p>
                </div>
                {!n.read && (
                  <span className="w-2 h-2 rounded-full bg-violet-500 shrink-0 mt-1.5" />
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

export function NotificationBell({ mobile = false, staffPortalFilter }: { mobile?: boolean; staffPortalFilter?: { staffId: number } }) {
  const { notifications, unreadCount, markAllRead, clearAll } = useNotifications(
    staffPortalFilter ? { staffPortalFilter } : undefined
  );
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (mobile) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        !buttonRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [mobile]);

  const handleOpen = () => {
    setOpen((prev) => !prev);
    if (!open && unreadCount > 0) {
      setTimeout(markAllRead, 600);
    }
  };

  const handleClose = () => setOpen(false);

  if (mobile) {
    return (
      <>
        <button
          ref={buttonRef}
          onClick={handleOpen}
          className="relative w-9 h-9 flex items-center justify-center rounded-full text-slate-400 active:text-slate-700 transition-colors shrink-0"
          aria-label="Notifications"
        >
          {unreadCount > 0 ? (
            <BellDot size={18} className="text-violet-500" />
          ) : (
            <Bell size={18} />
          )}
          {unreadCount > 0 && (
            <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-violet-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>

        {open && createPortal(
          <div className="fixed inset-0 z-[300] flex flex-col justify-end">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={handleClose}
            />
            <div
              ref={panelRef}
              className="relative bg-card rounded-t-2xl shadow-2xl overflow-hidden"
              style={{ maxHeight: "75vh" }}
            >
              <div className="w-10 h-1 rounded-full bg-muted-foreground/20 mx-auto mt-3 mb-1" />
              <NotificationList
                notifications={notifications}
                clearAll={clearAll}
                onClose={handleClose}
              />
            </div>
          </div>,
          document.body
        )}
      </>
    );
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={handleOpen}
        className="relative p-2 rounded-xl border border-border hover:bg-muted transition-colors mt-1"
        aria-label="Notifications"
      >
        {unreadCount > 0 ? (
          <BellDot className="w-5 h-5 text-violet-500" />
        ) : (
          <Bell className="w-5 h-5 text-muted-foreground" />
        )}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-violet-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-12 w-80 bg-card border border-border rounded-2xl shadow-xl z-50 overflow-hidden"
        >
          <NotificationList
            notifications={notifications}
            clearAll={clearAll}
            onClose={handleClose}
          />
        </div>
      )}
    </div>
  );
}
