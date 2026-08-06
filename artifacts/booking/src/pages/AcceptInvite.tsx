import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Loader2, ArrowRight, CheckCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PLUM = "#3B0764";
const PLUM_MID = "#5B21B6";
const GOLD = "#F59E0B";

interface InviteInfo {
  id: number;
  name: string;
  email: string;
  employmentType: string;
  storeName: string;
}

export default function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName]   = useState("");
  const [password, setPassword]   = useState("");
  const [confirm, setConfirm]     = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) { setError("No invite token provided."); setLoading(false); return; }
    fetch(`/api/team/invite/${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.message) { setError(data.message); }
        else {
          setInvite(data);
          const parts = (data.name ?? "").split(" ");
          setFirstName(parts[0] ?? "");
          setLastName(parts.slice(1).join(" ") ?? "");
        }
      })
      .catch(() => setError("Failed to load invitation."))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords don't match."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/team/invite/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ firstName, lastName, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message ?? "Failed to accept invite."); return; }
      setDone(true);
      setTimeout(() => navigate("/calendar"), 2000);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Inter:wght@400;500;600;700&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
    return () => { if (document.head.contains(link)) document.head.removeChild(link); };
  }, []);

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "linear-gradient(145deg, #FEFAF5 0%, #EDE9FE 55%, #F5F3FF 100%)",
      fontFamily: "'Inter', sans-serif", padding: "24px",
    }}>
      <div style={{
        background: "#fff", borderRadius: 20,
        boxShadow: "0 20px 60px rgba(59,7,100,0.12), 0 0 0 1px rgba(229,231,235,0.7)",
        padding: "48px 44px", width: "100%", maxWidth: 460,
      }}>
        {/* Logo */}
        <a href="/overview" style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontSize: "1.45rem", fontWeight: 700, letterSpacing: "-0.02em",
          color: PLUM, textDecoration: "none", display: "block", marginBottom: 32,
        }}>
          Certxa<span style={{ color: GOLD }}>.</span>
        </a>

        {loading && (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <Loader2 style={{ width: 32, height: 32, color: PLUM_MID, margin: "0 auto 12px", animation: "spin 1s linear infinite" }} />
            <p style={{ color: "#6b7280" }}>Loading your invitation…</p>
          </div>
        )}

        {!loading && error && !done && (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              background: "rgba(239,68,68,0.1)", display: "flex",
              alignItems: "center", justifyContent: "center", margin: "0 auto 16px",
            }}>
              <span style={{ fontSize: "1.5rem" }}>⚠️</span>
            </div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.6rem", fontWeight: 700, color: "#1c1917", margin: "0 0 8px" }}>
              Invitation Issue
            </h2>
            <p style={{ color: "#6b7280", marginBottom: 24 }}>{error}</p>
            <a href="/auth" style={{
              display: "inline-block", padding: "12px 28px", borderRadius: 50,
              background: `linear-gradient(135deg, ${PLUM}, ${PLUM_MID})`,
              color: "#fff", textDecoration: "none", fontWeight: 600, fontSize: ".875rem",
            }}>
              Go to Sign In
            </a>
          </div>
        )}

        {done && (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <CheckCircle style={{ width: 52, height: 52, color: "#16a34a", margin: "0 auto 16px" }} />
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.8rem", fontWeight: 700, color: "#1c1917", margin: "0 0 8px" }}>
              You're all set!
            </h2>
            <p style={{ color: "#6b7280" }}>Redirecting you to your dashboard…</p>
          </div>
        )}

        {!loading && invite && !done && !error && (
          <>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "5px 14px", borderRadius: 50,
              background: "rgba(91,33,182,0.07)", border: "1px solid rgba(91,33,182,0.18)",
              color: PLUM_MID, fontSize: ".75rem", fontWeight: 700,
              marginBottom: 20,
            }}>
              Team invitation
            </div>

            <h1 style={{
              fontFamily: "'Cormorant Garamond', serif",
              fontSize: "2rem", fontWeight: 700, letterSpacing: "-0.02em",
              color: "#1c1917", lineHeight: 1.1, margin: "0 0 8px",
            }}>
              Join {invite.storeName}
            </h1>
            <p style={{ color: "#6b7280", fontSize: ".9rem", marginBottom: 28 }}>
              You've been invited to join as a team member. Set up your account to get started.
            </p>

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <Label style={{ display: "block", fontSize: ".7rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>First name</Label>
                  <Input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="Jane" required style={{ height: 44, borderRadius: 9 }} />
                </div>
                <div>
                  <Label style={{ display: "block", fontSize: ".7rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>Last name</Label>
                  <Input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Doe" style={{ height: 44, borderRadius: 9 }} />
                </div>
              </div>

              <div>
                <Label style={{ display: "block", fontSize: ".7rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>Email</Label>
                <Input value={invite.email} disabled style={{ height: 44, borderRadius: 9, background: "#f9fafb", color: "#9ca3af" }} />
              </div>

              <div>
                <Label style={{ display: "block", fontSize: ".7rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>Create password</Label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" required minLength={6} style={{ height: 44, borderRadius: 9 }} />
              </div>

              <div>
                <Label style={{ display: "block", fontSize: ".7rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>Confirm password</Label>
                <Input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Re-enter password" required minLength={6} style={{ height: 44, borderRadius: 9 }} />
              </div>

              {error && (
                <p style={{ color: "#dc2626", fontSize: ".8rem", margin: "-4px 0 0", padding: "8px 12px", background: "#fef2f2", borderRadius: 8 }}>{error}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "center",
                  gap: 8, padding: "14px", borderRadius: 10, border: "none",
                  background: `linear-gradient(135deg, ${PLUM}, ${PLUM_MID})`,
                  color: "#fff", fontWeight: 700, fontSize: ".9rem",
                  cursor: submitting ? "not-allowed" : "pointer",
                  opacity: submitting ? 0.65 : 1,
                  boxShadow: "0 4px 20px rgba(59,7,100,0.35)",
                  marginTop: 4,
                }}
              >
                {submitting ? <Loader2 style={{ width: 16, height: 16, animation: "spin 1s linear infinite" }} /> : null}
                {submitting ? "Setting up your account…" : "Create account & join"}
                {!submitting && <ArrowRight style={{ width: 16, height: 16 }} />}
              </button>
            </form>
          </>
        )}
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
