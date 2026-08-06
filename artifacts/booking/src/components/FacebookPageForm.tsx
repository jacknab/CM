import { useState } from "react";

interface FacebookPageFormProps {
  storeId?: number | null;
  onSave: (pageId: string) => void;
  onSkip: () => void;
}

export function FacebookPageForm({ storeId, onSave, onSkip }: FacebookPageFormProps) {
  const [pageUrl, setPageUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function extractPageId(raw: string): string | null {
    const trimmed = raw.trim();
    // Strip trailing slashes and query strings
    const clean = trimmed.replace(/\?.*$/, "").replace(/\/+$/, "");

    // If it's a full FB URL — extract the page username/path after facebook.com/
    const match = clean.match(/^https?:\/\/(?:www\.)?facebook\.com\/(.+)$/i);
    if (match) return match[1].replace(/\//g, ""); // e.g. "MyBusiness" or "mybiz.123"

    // If it looks like a plain username/ID (no slashes, no dots besides FB allowed chars)
    if (/^[\w.]+$/.test(clean) && clean.length > 0) return clean;

    return null;
  }

  async function handleSubmit() {
    const pageId = extractPageId(pageUrl);
    if (!pageId) {
      setError("Please enter a valid Facebook Page URL or username.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (storeId) {
        await fetch(`/api/stores/${storeId}/facebook-page`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ facebookPageId: pageId }),
        });
      }
      onSave(pageId);
    } catch {
      onSave(pageId);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "calc(100vh - 64px)",
      padding: "40px 24px",
      background: "#fff",
    }}>
      <div style={{ maxWidth: 560, width: "100%" }}>

        {/* Facebook logo mark */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, background: "#1877F2",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
          </div>
          <span style={{ fontWeight: 800, fontSize: "1.1rem", color: "#111" }}>Connect Facebook</span>
        </div>

        <h2 style={{ fontSize: "1.6rem", fontWeight: 800, color: "#111", margin: "0 0 8px" }}>
          Enter your Facebook Page URL
        </h2>
        <p style={{ color: "#6b7280", fontSize: "0.95rem", margin: "0 0 32px", lineHeight: 1.6 }}>
          Your Facebook Page URL lets us pull in your business recommendations and reviews automatically.
        </p>

        {/* Page URL input */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontWeight: 700, fontSize: "0.85rem", color: "#374151", marginBottom: 6 }}>
            Facebook Page URL or Username
          </label>
          <div
            style={{ display: "flex", alignItems: "center", border: "1.5px solid #d1d5db", borderRadius: 10, overflow: "hidden", background: "#fff" }}
            onFocusCapture={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "#1877F2"; }}
            onBlurCapture={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "#d1d5db"; }}
          >
            <span style={{ padding: "11px 14px", background: "#f9fafb", borderRight: "1px solid #e5e7eb", color: "#9ca3af", fontSize: "0.88rem", whiteSpace: "nowrap" }}>
              facebook.com/
            </span>
            <input
              value={pageUrl}
              onChange={e => { setPageUrl(e.target.value); setError(null); }}
              onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }}
              placeholder="YourBusinessPage"
              style={{
                flex: 1, border: "none", outline: "none",
                padding: "11px 14px", fontSize: "0.95rem",
                fontFamily: "inherit", background: "transparent",
              }}
            />
          </div>
          {error && <p style={{ color: "#dc2626", fontSize: "0.82rem", marginTop: 6 }}>{error}</p>}
        </div>

        {/* How to find instructions */}
        <div style={{
          background: "#fafafa", border: "1px solid #e5e7eb",
          borderRadius: 12, padding: "18px 20px", marginBottom: 28,
        }}>
          <p style={{ fontWeight: 700, fontSize: "0.85rem", color: "#374151", margin: "0 0 12px" }}>
            📍 How to find your Facebook Page URL
          </p>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: "0.88rem", color: "#4b5563", lineHeight: 1.9 }}>
            <li>Go to <a href="https://facebook.com" target="_blank" rel="noreferrer" style={{ color: "#1877F2", fontWeight: 600 }}>facebook.com</a> and open your Business Page</li>
            <li>Look at your browser's address bar — it will show:<br />
              <code style={{ background: "#f3f4f6", padding: "2px 6px", borderRadius: 4, fontSize: "0.82rem", color: "#111" }}>
                facebook.com/<strong>YourPageName</strong>
              </code>
            </li>
            <li>Copy everything after <code style={{ background: "#f3f4f6", padding: "1px 5px", borderRadius: 4, fontSize: "0.82rem" }}>facebook.com/</code> and paste it above</li>
            <li>You can also paste the full URL — we'll extract the page name automatically</li>
          </ol>
          <div style={{ marginTop: 12, padding: "10px 14px", background: "#eff6ff", borderRadius: 8, border: "1px solid #bfdbfe" }}>
            <p style={{ margin: 0, fontSize: "0.82rem", color: "#1e3a8a" }}>
              <strong>What we collect:</strong> We only read public reviews and recommendations visible on your Page. We never post on your behalf or access private messages.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <button
            onClick={handleSubmit}
            disabled={saving || !pageUrl.trim()}
            style={{
              padding: "13px 28px", borderRadius: 10,
              background: pageUrl.trim() && !saving ? "#1877F2" : "#e5e7eb",
              color: pageUrl.trim() && !saving ? "#fff" : "#9ca3af",
              border: "none", fontWeight: 700, fontSize: "0.95rem",
              cursor: pageUrl.trim() && !saving ? "pointer" : "not-allowed",
              transition: "background 0.15s",
            }}
          >
            {saving ? "Saving…" : "Connect Facebook →"}
          </button>
          <button
            onClick={onSkip}
            style={{
              background: "none", border: "none", color: "#9ca3af",
              fontSize: "0.88rem", cursor: "pointer", padding: "6px",
            }}
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
