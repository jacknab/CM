interface YelpConnectGateProps {
  onConnect: () => void;
  onSkip?: () => void;
}

export function YelpConnectGate({ onConnect, onSkip }: YelpConnectGateProps) {
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
            Connect your Yelp business page to auto-collect Yelp reviews
          </h2>

          <button
            onClick={onConnect}
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              gap: 10, background: "#d32323", color: "#fff", border: "none",
              borderRadius: 999, padding: "12px 28px", fontSize: "0.95rem",
              fontWeight: 600, cursor: "pointer", width: "100%",
              boxShadow: "0 2px 8px rgba(211,34,35,0.3)",
              transition: "background 0.15s",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "#b01c1c"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "#d32323"; }}
          >
            <YelpBurst size={20} />
            Connect to Yelp
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

        {/* ── Right: Yelp-style mockup card ─────────────────── */}
        <div style={{
          flex: 1, maxWidth: 420,
          borderRadius: 16, overflow: "hidden",
          border: "1px solid #e5e7eb", background: "#fff",
          boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
        }}>
          {/* Header photo strip */}
          <div style={{ background: "#e8ecef", height: 120, position: "relative", display: "flex" }}>
            {/* Left: circle avatar overlapping */}
            <div style={{
              position: "absolute", bottom: -24, left: 20,
              width: 64, height: 64, borderRadius: "50%",
              background: "#d1d5db", border: "3px solid #fff",
            }} />
          </div>

          {/* Business info */}
          <div style={{ padding: "32px 20px 20px" }}>
            {/* Name bar */}
            <div style={{ height: 16, background: "#dde1e7", borderRadius: 5, width: "60%", marginBottom: 8 }} />
            {/* Category / location bars */}
            <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
              <div style={{ height: 11, background: "#e8ecef", borderRadius: 3, width: 60 }} />
              <div style={{ height: 11, background: "#e8ecef", borderRadius: 3, width: 80 }} />
            </div>

            {/* Rating row */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 3 }}>
                {[0,1,2,3,4].map(i => <YelpStar key={i} filled={i < 4} />)}
              </div>
              <div style={{ height: 12, background: "#dde1e7", borderRadius: 4, width: 48 }} />
            </div>

            <div style={{ height: 1, background: "#f3f4f6", marginBottom: 16 }} />

            {/* Review rows */}
            {[1, 2, 3].map(i => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 14 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#e8ecef", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", gap: 3, marginBottom: 5 }}>
                    {[0,1,2,3,4].map(j => <YelpStar key={j} filled={j < 5} size={10} />)}
                  </div>
                  <div style={{ height: 10, background: "#e8ecef", borderRadius: 3, width: `${65 - i * 8}%`, marginBottom: 4 }} />
                  <div style={{ height: 10, background: "#e8ecef", borderRadius: 3, width: `${50 - i * 5}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function YelpBurst({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#fff">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
    </svg>
  );
}

function YelpStar({ filled, size = 13 }: { filled: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z"
        fill={filled ? "#d32323" : "none"}
        stroke={filled ? "#d32323" : "#d1d5db"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
