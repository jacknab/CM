import { useState } from "react";

interface YelpAliasFormProps {
  storeId?: number | null;
  onSave: (alias: string) => void;
  onSkip: () => void;
}

export function YelpAliasForm({ storeId, onSave, onSkip }: YelpAliasFormProps) {
  const [alias, setAlias] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    const trimmed = alias.trim();
    if (!trimmed) { setError("Please enter your Yelp business alias."); return; }

    // Strip full URLs if pasted — extract just the alias segment
    const cleaned = trimmed
      .replace(/^https?:\/\/[^/]*yelp\.com\/biz\//i, "")
      .replace(/\?.*$/, "")
      .replace(/\/+$/, "")
      .trim();

    if (!cleaned) { setError("Could not read an alias from what you entered. Try just the alias, e.g. joes-pizza-new-york"); return; }

    setSaving(true);
    setError(null);
    try {
      if (storeId) {
        await fetch(`/api/stores/${storeId}/yelp-alias`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ yelpAlias: cleaned }),
        });
      }
      onSave(cleaned);
    } catch {
      // Non-blocking — still proceed
      onSave(cleaned);
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

        {/* Yelp logo mark */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, background: "#d32323",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff">
              <text x="3" y="18" fontSize="18" fontWeight="bold" fontFamily="Arial,sans-serif">y!</text>
            </svg>
          </div>
          <span style={{ fontWeight: 800, fontSize: "1.1rem", color: "#111" }}>Connect Yelp</span>
        </div>

        <h2 style={{ fontSize: "1.6rem", fontWeight: 800, color: "#111", margin: "0 0 8px" }}>
          Enter your Yelp business alias
        </h2>
        <p style={{ color: "#6b7280", fontSize: "0.95rem", margin: "0 0 32px", lineHeight: 1.6 }}>
          Your Yelp alias lets us pull in your reviews automatically. It's the short name that appears in your Yelp URL.
        </p>

        {/* Alias input */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontWeight: 700, fontSize: "0.85rem", color: "#374151", marginBottom: 6 }}>
            Yelp Business Alias
          </label>
          <div style={{ display: "flex", alignItems: "center", border: "1.5px solid #d1d5db", borderRadius: 10, overflow: "hidden", background: "#fff", transition: "border-color 0.15s" }}
            onFocusCapture={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "#d32323"; }}
            onBlurCapture={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "#d1d5db"; }}
          >
            <span style={{ padding: "11px 14px", background: "#f9fafb", borderRight: "1px solid #e5e7eb", color: "#9ca3af", fontSize: "0.88rem", whiteSpace: "nowrap" }}>
              yelp.com/biz/
            </span>
            <input
              value={alias}
              onChange={e => { setAlias(e.target.value); setError(null); }}
              onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }}
              placeholder="your-business-name-city"
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
            📍 How to find your Yelp alias
          </p>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: "0.88rem", color: "#4b5563", lineHeight: 1.9 }}>
            <li>Go to <a href="https://yelp.com" target="_blank" rel="noreferrer" style={{ color: "#d32323", fontWeight: 600 }}>yelp.com</a> and search for your business</li>
            <li>Click on your business listing to open it</li>
            <li>Look at the URL in your browser — it will look like:<br />
              <code style={{ background: "#f3f4f6", padding: "2px 6px", borderRadius: 4, fontSize: "0.82rem", color: "#111" }}>
                yelp.com/biz/<strong>your-business-alias</strong>
              </code>
            </li>
            <li>Copy everything after <code style={{ background: "#f3f4f6", padding: "1px 5px", borderRadius: 4, fontSize: "0.82rem" }}>/biz/</code> and paste it above</li>
          </ol>
          <div style={{ marginTop: 12, padding: "10px 14px", background: "#fff3f3", borderRadius: 8, border: "1px solid #fecaca" }}>
            <p style={{ margin: 0, fontSize: "0.82rem", color: "#7f1d1d" }}>
              <strong>Example:</strong> If your Yelp URL is<br />
              <code style={{ fontSize: "0.8rem" }}>yelp.com/biz/joes-pizza-new-york-3</code><br />
              then your alias is <strong>joes-pizza-new-york-3</strong>
            </p>
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <button
            onClick={handleSubmit}
            disabled={saving || !alias.trim()}
            style={{
              padding: "13px 28px", borderRadius: 10,
              background: alias.trim() && !saving ? "#d32323" : "#e5e7eb",
              color: alias.trim() && !saving ? "#fff" : "#9ca3af",
              border: "none", fontWeight: 700, fontSize: "0.95rem",
              cursor: alias.trim() && !saving ? "pointer" : "not-allowed",
              transition: "background 0.15s",
            }}
          >
            {saving ? "Saving…" : "Connect Yelp →"}
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
