import { useState } from "react";
import { Loader2 } from "lucide-react";

interface GoogleConnectGateProps {
  onConnect: () => void;
  onSkip?: () => void;
  loading?: boolean;
  title?: string;
  subtitle?: string;
  compact?: boolean;
}

export function GoogleConnectGate({
  onConnect,
  onSkip,
  loading = false,
  title = "Connect your Google Business account to auto-collect Google reviews",
  subtitle,
  compact = false,
}: GoogleConnectGateProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  const content = (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: compact ? 48 : 80,
      maxWidth: 860,
      width: "100%",
    }}>

        {/* ── Left: CTA ──────────────────────────────────────── */}
        <div style={{
          flex: "0 0 auto",
          maxWidth: 260,
          textAlign: "center",
        }}>
          <h2 style={{
            fontSize: "1.5rem",
            fontWeight: 600,
            color: "#111827",
            lineHeight: 1.35,
            margin: "0 0 32px",
          }}>
            {title}
          </h2>

          {subtitle && (
            <p style={{ fontSize: "0.9rem", color: "#6b7280", marginBottom: 24 }}>
              {subtitle}
            </p>
          )}

          <button
            onClick={() => setShowConfirm(true)}
            disabled={loading}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              background: "#1a73e8",
              color: "#fff",
              border: "none",
              borderRadius: 999,
              padding: "12px 28px",
              fontSize: "0.95rem",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.75 : 1,
              transition: "background 0.15s",
              width: "100%",
              boxShadow: "0 2px 8px rgba(26,115,232,0.3)",
            }}
            onMouseEnter={e => { if (!loading) (e.currentTarget as HTMLButtonElement).style.background = "#1558b0"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = loading ? "#1a73e8" : "#1a73e8"; }}
          >
            {loading ? (
              <>
                <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                Redirecting…
              </>
            ) : (
              <>
                <GoogleIcon />
                Connect with Google
              </>
            )}
          </button>

          {onSkip && (
            <button
              onClick={onSkip}
              style={{
                display: "block",
                margin: "16px auto 0",
                background: "none",
                border: "none",
                color: "#6b7280",
                fontSize: "0.88rem",
                cursor: "pointer",
                textDecoration: "none",
              }}
            >
              Skip
            </button>
          )}
        </div>

        {/* ── Right: Mockup card ─────────────────────────────── */}
        <div style={{
          flex: 1,
          maxWidth: 420,
          borderRadius: 16,
          overflow: "hidden",
          border: "1px solid #e5e7eb",
          background: "#fff",
          boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
        }}>
          {/* Map area */}
          <div style={{
            background: "#e8ecef",
            height: 160,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <MapPinIcon />
          </div>

          {/* Business listing skeleton */}
          <div style={{ padding: "20px 22px 24px" }}>
            {/* Business name bar */}
            <div style={{ height: 18, background: "#dde1e7", borderRadius: 6, width: "70%", marginBottom: 14 }} />

            {/* Rating row */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
              <div style={{ width: 24, height: 24, background: "#dde1e7", borderRadius: "50%" }} />
              <div style={{ display: "flex", gap: 4 }}>
                {[0,1,2,3,4].map(i => (
                  <StarOutline key={i} />
                ))}
              </div>
              <div style={{ height: 13, background: "#dde1e7", borderRadius: 4, width: 64 }} />
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: "#f3f4f6", marginBottom: 18 }} />

            {/* Review text lines */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ height: 12, background: "#e8ecef", borderRadius: 4, width: "65%" }} />
              <div style={{ height: 12, background: "#e8ecef", borderRadius: 4, width: "48%" }} />
              <div style={{ height: 12, background: "#e8ecef", borderRadius: 4, width: "35%" }} />
            </div>
          </div>
        </div>
      </div>
  );

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {compact ? (
        <div style={{ padding: "24px 0" }}>
          {content}
        </div>
      ) : (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "calc(100vh - 64px)",
          padding: "40px 24px",
          background: "#fff",
        }}>
          {content}
        </div>
      )}

      {/* ── Confirmation dialog ─────────────────────────────── */}
      {showConfirm && (
        <div
          onClick={() => setShowConfirm(false)}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: "32px 36px",
              maxWidth: 500,
              width: "90%",
              boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
            }}
          >
            <h3 style={{ margin: "0 0 14px", fontSize: "1.2rem", fontWeight: 700, color: "#111" }}>
              Connect your Google account
            </h3>
            <p style={{ margin: "0 0 32px", fontSize: "0.95rem", color: "#4b5563", lineHeight: 1.65 }}>
              Link your Google Business Profile to display your Google reviews and sync your Certxa booking link to your Google listing — all managed directly from your Certxa account.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 16, alignItems: "center" }}>
              <button
                onClick={() => setShowConfirm(false)}
                style={{
                  background: "none", border: "none",
                  color: "#1a73e8", fontWeight: 600,
                  fontSize: "0.95rem", cursor: "pointer",
                  padding: "8px 4px",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => { setShowConfirm(false); onConnect(); }}
                disabled={loading}
                style={{
                  background: "#1a73e8", color: "#fff",
                  border: "none", borderRadius: 999,
                  padding: "10px 28px", fontSize: "0.95rem",
                  fontWeight: 700, cursor: loading ? "not-allowed" : "pointer",
                  opacity: loading ? 0.75 : 1,
                  display: "flex", alignItems: "center", gap: 8,
                }}
              >
                {loading ? (
                  <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> Connecting…</>
                ) : "Connect"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#fff" fillOpacity={0.9}/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.859-3.048.859-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#fff" fillOpacity={0.75}/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#fff" fillOpacity={0.75}/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#fff" fillOpacity={0.9}/>
    </svg>
  );
}

function MapPinIcon() {
  return (
    <svg width="32" height="40" viewBox="0 0 32 40" fill="none">
      <path d="M16 0C7.163 0 0 7.163 0 16c0 10 16 24 16 24S32 26 32 16C32 7.163 24.837 0 16 0Zm0 22a6 6 0 1 1 0-12 6 6 0 0 1 0 12Z" fill="#bfc6ce"/>
    </svg>
  );
}

function StarOutline() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z"
        stroke="#d1d5db" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
