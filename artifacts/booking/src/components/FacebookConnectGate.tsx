interface FacebookConnectGateProps {
  onConnect: () => void;
  onSkip?: () => void;
}

export function FacebookConnectGate({ onConnect, onSkip }: FacebookConnectGateProps) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "calc(100vh - 64px)",
      padding: "40px 24px",
      background: "#fff",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 80,
        maxWidth: 860,
        width: "100%",
      }}>

        {/* ── Left: CTA ──────────────────────────────────────── */}
        <div style={{ flex: "0 0 auto", maxWidth: 260, textAlign: "center" }}>
          <h2 style={{
            fontSize: "1.5rem", fontWeight: 600, color: "#111827",
            lineHeight: 1.35, margin: "0 0 32px",
          }}>
            Connect your Facebook business page to auto-collect Facebook reviews
          </h2>

          <button
            onClick={onConnect}
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              gap: 10, background: "#1877F2", color: "#fff", border: "none",
              borderRadius: 999, padding: "12px 28px", fontSize: "0.95rem",
              fontWeight: 600, cursor: "pointer", width: "100%",
              boxShadow: "0 2px 8px rgba(24,119,242,0.3)",
              transition: "background 0.15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#1464d8"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#1877F2"; }}
          >
            <FacebookIcon />
            Connect to Facebook
          </button>

          {onSkip && (
            <button
              onClick={onSkip}
              style={{
                display: "block", margin: "16px auto 0",
                background: "none", border: "none",
                color: "#6b7280", fontSize: "0.88rem", cursor: "pointer",
              }}
            >
              Skip
            </button>
          )}
        </div>

        {/* ── Right: Facebook-style mockup card ─────────────── */}
        <div style={{
          flex: 1, maxWidth: 460,
          borderRadius: 16, overflow: "hidden",
          border: "1px solid #e5e7eb", background: "#fff",
          boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
        }}>
          {/* Cover photo + profile pic */}
          <div style={{ position: "relative", background: "#e8ecef", height: 130 }}>
            <div style={{
              position: "absolute", bottom: -28, left: 20,
              width: 64, height: 64, borderRadius: "50%",
              background: "#d1d5db", border: "3px solid #fff",
            }} />
          </div>

          {/* Business info area */}
          <div style={{ padding: "36px 20px 20px", display: "flex", gap: 16 }}>

            {/* Left col: name bars + rating badge */}
            <div style={{ flex: 1 }}>
              {/* Name */}
              <div style={{ height: 14, background: "#dde1e7", borderRadius: 4, width: "70%", marginBottom: 6 }} />
              {/* Category */}
              <div style={{ height: 11, background: "#e8ecef", borderRadius: 3, width: "50%", marginBottom: 20 }} />
              {/* Grey skeleton bars (like page details) */}
              {[60, 80, 50].map((w, i) => (
                <div key={i} style={{ height: 9, background: "#eef0f3", borderRadius: 3, width: `${w}%`, marginBottom: 6 }} />
              ))}

              {/* Rating badge block */}
              <div style={{ marginTop: 20, display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: "50%",
                  background: "#1e3a5f",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <span style={{ color: "#fff", fontWeight: 800, fontSize: "1rem" }}>4.8</span>
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: "0.82rem", fontWeight: 700, color: "#374151" }}>4.8 out of 5</p>
                  <p style={{ margin: "2px 0 0", fontSize: "0.72rem", color: "#9ca3af", lineHeight: 1.4 }}>
                    Based on the opinion of<br />294 people
                  </p>
                </div>
              </div>
            </div>

            {/* Right col: "recommended" + review rows */}
            <div style={{ flex: 1, paddingLeft: 12, borderLeft: "1px solid #f3f4f6" }}>
              {/* Recommended row */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#e8ecef" }} />
                <div style={{ height: 10, background: "#e8ecef", borderRadius: 3, width: "70%" }} />
              </div>

              {/* Review skeleton rows */}
              {[1, 2, 3].map(i => (
                <div key={i} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#e8ecef", flexShrink: 0 }} />
                    <div style={{ height: 9, background: "#dde1e7", borderRadius: 3, width: "55%" }} />
                  </div>
                  <div style={{ height: 8, background: "#eef0f3", borderRadius: 3, width: "80%", marginBottom: 3 }} />
                  <div style={{ height: 8, background: "#eef0f3", borderRadius: 3, width: "60%", marginBottom: 6 }} />
                  {/* Action pills */}
                  <div style={{ display: "flex", gap: 6 }}>
                    {["Like", "Comment", "Share"].map(label => (
                      <div key={label} style={{
                        height: 16, background: "#f3f4f6", borderRadius: 4,
                        width: label === "Like" ? 28 : label === "Comment" ? 42 : 32,
                      }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

function FacebookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
    </svg>
  );
}
