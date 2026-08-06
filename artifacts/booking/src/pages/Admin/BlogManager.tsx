import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  PlusCircle, Edit2, Trash2, Eye, EyeOff, Star, StarOff,
  ChevronDown, ChevronUp, X, Save, Globe, FileText, Loader2,
  AlertCircle, CheckCircle2, Search,
} from "lucide-react";

const API = "/api";

const CATEGORIES = [
  "General","Marketing","Operations","Business","Software",
  "Clients","Guides","Growth","Success Story",
];

const COLORS = [
  "#7c3aed","#ec4899","#059669","#b45309","#3b82f6",
  "#ef4444","#f59e0b","#10b981","#6366f1","#14b8a6",
];

const EMOJIS = [
  "📝","📋","🌟","💰","📍","📱","🤝","📅","💳","🎯",
  "✂️","💅","🏪","📊","🚀","💡","🔑","🎉","👑","💎",
];

interface Post {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  category: string;
  author_name: string;
  cover_color: string;
  cover_emoji: string;
  read_time: string;
  is_featured: boolean;
  status: "draft" | "published";
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

const emptyDraft = (): Omit<Post, "id" | "created_at" | "updated_at" | "published_at"> => ({
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  category: "General",
  author_name: "Certxa Team",
  cover_color: "#7c3aed",
  cover_emoji: "📝",
  read_time: "5 min read",
  is_featured: false,
  status: "draft",
});

function slugify(t: string) {
  return t.toLowerCase().replace(/[^a-z0-9\s-]/g,"").trim().replace(/\s+/g,"-").replace(/-+/g,"-");
}

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ── Simple HTML editor ────────────────────────────────────────────────────────
function HtmlEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
      {/* toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 2, padding: "6px 10px", background: "#f9fafb", borderBottom: "1px solid #e5e7eb", flexWrap: "wrap" }}>
        {[
          ["<b>", "</b>", "B", "bold"],
          ["<i>", "</i>", "I", "italic"],
          ["<h2>", "</h2>", "H2", "heading2"],
          ["<h3>", "</h3>", "H3", "heading3"],
          ["<ul>\n<li>", "</li>\n</ul>", "List", "list"],
          ["<blockquote>", "</blockquote>", "Quote", "quote"],
          ["<a href=\"\">", "</a>", "Link", "link"],
          ["<hr>", "", "HR", "hr"],
        ].map(([open, close, label]) => (
          <button key={label}
            type="button"
            onClick={() => {
              const ta = document.getElementById("blog-content-ta") as HTMLTextAreaElement;
              if (!ta) return;
              const s = ta.selectionStart, e = ta.selectionEnd;
              const sel = ta.value.slice(s, e);
              const newVal = ta.value.slice(0, s) + open + sel + close + ta.value.slice(e);
              onChange(newVal);
              setTimeout(() => {
                ta.focus();
                ta.setSelectionRange(s + (open as string).length, s + (open as string).length + sel.length);
              }, 10);
            }}
            style={{
              padding: "3px 8px", fontSize: ".72rem", fontWeight: 700,
              background: "#fff", border: "1px solid #d1d5db",
              borderRadius: 4, cursor: "pointer", color: "#374151",
            }}
          >
            {label}
          </button>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button type="button" onClick={() => setTab("edit")}
            style={{ padding: "3px 10px", fontSize: ".72rem", fontWeight: 600, borderRadius: 4, cursor: "pointer",
              background: tab === "edit" ? "#3b0764" : "#fff", color: tab === "edit" ? "#fff" : "#6b7280",
              border: `1px solid ${tab === "edit" ? "#3b0764" : "#d1d5db"}` }}>
            Edit
          </button>
          <button type="button" onClick={() => setTab("preview")}
            style={{ padding: "3px 10px", fontSize: ".72rem", fontWeight: 600, borderRadius: 4, cursor: "pointer",
              background: tab === "preview" ? "#3b0764" : "#fff", color: tab === "preview" ? "#fff" : "#6b7280",
              border: `1px solid ${tab === "preview" ? "#3b0764" : "#d1d5db"}` }}>
            Preview
          </button>
        </div>
      </div>
      {tab === "edit" ? (
        <textarea
          id="blog-content-ta"
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={18}
          placeholder="<p>Write your article content here using HTML...</p>"
          style={{
            width: "100%", boxSizing: "border-box",
            padding: "14px 16px", fontFamily: "monospace", fontSize: ".82rem",
            lineHeight: 1.65, border: "none", outline: "none", resize: "vertical",
            background: "#fff", color: "#1f2937",
          }}
        />
      ) : (
        <div
          className="blog-content"
          style={{ padding: "20px 24px", minHeight: 240, background: "#fff", fontSize: ".95rem", lineHeight: 1.8, color: "#374151" }}
          dangerouslySetInnerHTML={{ __html: value || "<p style='color:#9ca3af'>Nothing to preview yet.</p>" }}
        />
      )}
    </div>
  );
}

// ── Post editor drawer ────────────────────────────────────────────────────────
function PostEditor({
  post, onSave, onClose,
}: {
  post: Partial<Post> | null;
  onSave: (saved: Post) => void;
  onClose: () => void;
}) {
  const isNew = !post?.id;
  const [form, setForm] = useState(() => post ? { ...emptyDraft(), ...post } : emptyDraft());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showEmojis, setShowEmojis] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  const handleTitleBlur = () => {
    if (!form.slug && form.title) set("slug", slugify(form.title));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const payload = { ...form, slug: form.slug || slugify(form.title) };
      const saved = isNew
        ? await api("POST", "/admin/blog/posts", payload)
        : await api("PATCH", `/admin/blog/posts/${post!.id}`, payload);
      onSave(saved);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const labelStyle: React.CSSProperties = {
    display: "block", fontSize: ".72rem", fontWeight: 700,
    textTransform: "uppercase", letterSpacing: ".06em",
    color: "#6b7280", marginBottom: 4,
  };
  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box",
    padding: "9px 12px", border: "1px solid #d1d5db", borderRadius: 6,
    fontSize: ".875rem", color: "#1f2937", outline: "none",
    fontFamily: "inherit",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      display: "flex", alignItems: "stretch",
    }}>
      {/* backdrop */}
      <div style={{ flex: 1, background: "rgba(0,0,0,.45)" }} onClick={onClose} />

      {/* drawer */}
      <div style={{
        width: "min(740px, 100vw)", background: "#fff",
        display: "flex", flexDirection: "column", boxShadow: "-8px 0 40px rgba(0,0,0,.18)",
        overflowY: "auto",
      }}>
        {/* header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "18px 24px", borderBottom: "1px solid #e5e7eb",
          background: "#1e1e2e", color: "#fff",
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: "1rem" }}>
              {isNew ? "New Article" : "Edit Article"}
            </div>
            <div style={{ fontSize: ".75rem", opacity: .6, marginTop: 2 }}>
              {isNew ? "Create and publish a new blog post" : `Editing: ${form.title || "…"}`}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* form */}
        <form onSubmit={handleSubmit} style={{ flex: 1, padding: "24px", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Title */}
          <div>
            <label style={labelStyle}>Title *</label>
            <input ref={titleRef} required value={form.title}
              onChange={e => set("title", e.target.value)}
              onBlur={handleTitleBlur}
              placeholder="How to Reduce No-Shows in Your Salon…"
              style={{ ...inputStyle, fontSize: "1rem", fontWeight: 600 }} />
          </div>

          {/* Slug */}
          <div>
            <label style={labelStyle}>URL Slug</label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: ".78rem", color: "#9ca3af", flexShrink: 0 }}>certxa.com/blog/</span>
              <input value={form.slug}
                onChange={e => set("slug", slugify(e.target.value))}
                placeholder="how-to-reduce-no-shows"
                style={{ ...inputStyle, flex: 1 }} />
            </div>
          </div>

          {/* Excerpt */}
          <div>
            <label style={labelStyle}>Excerpt (shown in article card)</label>
            <textarea value={form.excerpt ?? ""}
              onChange={e => set("excerpt", e.target.value)}
              rows={3}
              placeholder="A short summary of the article (1–2 sentences)…"
              style={{ ...inputStyle, resize: "vertical", lineHeight: 1.55 }} />
          </div>

          {/* Meta row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Category</label>
              <select value={form.category} onChange={e => set("category", e.target.value)} style={{ ...inputStyle }}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Author</label>
              <input value={form.author_name} onChange={e => set("author_name", e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Read Time</label>
              <input value={form.read_time} onChange={e => set("read_time", e.target.value)} placeholder="5 min read" style={inputStyle} />
            </div>
          </div>

          {/* Cover colour + emoji */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Card Colour</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                {COLORS.map(c => (
                  <button key={c} type="button"
                    onClick={() => set("cover_color", c)}
                    style={{
                      width: 28, height: 28, borderRadius: "50%", background: c, border: "none",
                      cursor: "pointer", outline: form.cover_color === c ? `3px solid ${c}` : "none",
                      outlineOffset: 2,
                    }} />
                ))}
              </div>
            </div>
            <div>
              <label style={labelStyle}>Card Emoji</label>
              <div style={{ position: "relative" }}>
                <button type="button"
                  onClick={() => setShowEmojis(v => !v)}
                  style={{
                    padding: "6px 14px", border: "1px solid #d1d5db", borderRadius: 6,
                    background: "#fff", cursor: "pointer", fontSize: "1.3rem",
                  }}>
                  {form.cover_emoji}
                </button>
                {showEmojis && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 6px)", left: 0,
                    background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8,
                    padding: 8, display: "flex", flexWrap: "wrap", gap: 4,
                    boxShadow: "0 4px 20px rgba(0,0,0,.12)", zIndex: 50, width: 220,
                  }}>
                    {EMOJIS.map(em => (
                      <button key={em} type="button"
                        onClick={() => { set("cover_emoji", em); setShowEmojis(false); }}
                        style={{ width: 36, height: 36, fontSize: "1.3rem", border: "none", background: form.cover_emoji === em ? "#f5f3ff" : "none", borderRadius: 6, cursor: "pointer" }}>
                        {em}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Status + featured */}
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <div>
              <label style={labelStyle}>Status</label>
              <select value={form.status} onChange={e => set("status", e.target.value as "draft" | "published")}
                style={{ ...inputStyle, width: "auto" }}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginTop: 18 }}>
              <input type="checkbox" checked={form.is_featured}
                onChange={e => set("is_featured", e.target.checked)}
                style={{ width: 16, height: 16 }} />
              <span style={{ fontSize: ".85rem", fontWeight: 600, color: "#374151" }}>Featured article</span>
            </label>
          </div>

          {/* Content */}
          <div>
            <label style={labelStyle}>Article Content (HTML)</label>
            <HtmlEditor value={form.content ?? ""} onChange={v => set("content", v)} />
          </div>

          {error && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6, color: "#b91c1c", fontSize: ".85rem" }}>
              <AlertCircle size={15} /> {error}
            </div>
          )}

          {/* footer */}
          <div style={{ display: "flex", gap: 10, paddingTop: 8, borderTop: "1px solid #e5e7eb" }}>
            <button type="submit" disabled={saving}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "10px 22px", background: "#3b0764", color: "#fff",
                border: "none", borderRadius: 6, fontWeight: 600, fontSize: ".875rem",
                cursor: saving ? "not-allowed" : "pointer", opacity: saving ? .7 : 1,
              }}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
              {saving ? "Saving…" : isNew ? "Create Post" : "Save Changes"}
            </button>
            <button type="button" onClick={onClose}
              style={{ padding: "10px 18px", border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: ".875rem", color: "#374151" }}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main BlogManager ──────────────────────────────────────────────────────────
export default function BlogManager() {
  const [posts, setPosts]           = useState<Post[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [editing, setEditing]       = useState<Partial<Post> | null | false>(false);
  const [search, setSearch]         = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "published" | "draft">("all");
  const [toast, setToast]           = useState<{ msg: string; ok: boolean } | null>(null);
  const [deleting, setDeleting]     = useState<number | null>(null);
  const [toggling, setToggling]     = useState<number | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3200);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api("GET", "/admin/blog/posts");
      setPosts(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = (saved: Post) => {
    setPosts(prev => {
      const idx = prev.findIndex(p => p.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [saved, ...prev];
    });
    setEditing(false);
    showToast(saved.status === "published" ? "Article published ✓" : "Draft saved ✓");
  };

  const handleDelete = async (id: number, title: string) => {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      await api("DELETE", `/admin/blog/posts/${id}`);
      setPosts(prev => prev.filter(p => p.id !== id));
      showToast("Article deleted");
    } catch (err: any) {
      showToast(err.message, false);
    } finally {
      setDeleting(null);
    }
  };

  const handleTogglePublish = async (post: Post) => {
    setToggling(post.id);
    try {
      const action = post.status === "published" ? "unpublish" : "publish";
      const updated = await api("POST", `/admin/blog/posts/${post.id}/${action}`);
      setPosts(prev => prev.map(p => p.id === updated.id ? updated : p));
      showToast(action === "publish" ? "Article published ✓" : "Moved to draft");
    } catch (err: any) {
      showToast(err.message, false);
    } finally {
      setToggling(null);
    }
  };

  const handleToggleFeatured = async (post: Post) => {
    try {
      const updated = await api("PATCH", `/admin/blog/posts/${post.id}`, { is_featured: !post.is_featured });
      setPosts(prev => prev.map(p => p.id === updated.id ? updated : p));
    } catch (err: any) {
      showToast(err.message, false);
    }
  };

  const filtered = posts.filter(p => {
    if (filterStatus !== "all" && p.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return p.title.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || p.slug.includes(q);
    }
    return true;
  });

  const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

  return (
    <div style={{ padding: "28px 32px", fontFamily: "system-ui, -apple-system, sans-serif", minHeight: "100vh", background: "#f8fafc" }}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 2000,
          display: "flex", alignItems: "center", gap: 8,
          padding: "12px 18px", borderRadius: 8, fontWeight: 600, fontSize: ".875rem",
          background: toast.ok ? "#065f46" : "#7f1d1d", color: "#fff",
          boxShadow: "0 4px 20px rgba(0,0,0,.2)",
        }}>
          {toast.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Editor drawer */}
      {editing !== false && (
        <PostEditor
          post={editing}
          onSave={handleSave}
          onClose={() => setEditing(false)}
        />
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "1.4rem", fontWeight: 800, color: "#1e1e2e", margin: 0 }}>Blog Manager</h1>
          <p style={{ color: "#6b7280", fontSize: ".82rem", marginTop: 4 }}>
            {posts.length} article{posts.length !== 1 ? "s" : ""} · {posts.filter(p => p.status === "published").length} published
          </p>
        </div>
        <button
          onClick={() => setEditing(null)}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "10px 20px", background: "#3b0764", color: "#fff",
            border: "none", borderRadius: 8, fontWeight: 600, fontSize: ".875rem",
            cursor: "pointer",
          }}>
          <PlusCircle size={16} /> New Article
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search articles…"
            style={{ padding: "8px 12px 8px 30px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: ".82rem", outline: "none", width: 220 }}
          />
        </div>
        {(["all", "published", "draft"] as const).map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            style={{
              padding: "8px 16px", borderRadius: 6, fontSize: ".78rem", fontWeight: 600, cursor: "pointer",
              background: filterStatus === s ? "#1e1e2e" : "#fff",
              color: filterStatus === s ? "#fff" : "#374151",
              border: `1px solid ${filterStatus === s ? "#1e1e2e" : "#d1d5db"}`,
            }}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        <a href="/blog" target="_blank" rel="noopener"
          style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: ".78rem", fontWeight: 600, color: "#374151", textDecoration: "none", background: "#fff" }}>
          <Globe size={13} /> View Blog
        </a>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "80px 0" }}>
          <Loader2 size={28} style={{ animation: "spin 1s linear infinite", color: "#6b7280" }} />
          <p style={{ color: "#9ca3af", marginTop: 12 }}>Loading articles…</p>
        </div>
      ) : error ? (
        <div style={{ padding: "40px", textAlign: "center", color: "#b91c1c" }}>
          <AlertCircle size={24} style={{ marginBottom: 8 }} />
          <p>{error}</p>
          <button onClick={load} style={{ marginTop: 12, padding: "8px 16px", border: "1px solid #d1d5db", borderRadius: 6, cursor: "pointer" }}>Retry</button>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 0" }}>
          <FileText size={36} style={{ color: "#d1d5db", marginBottom: 12 }} />
          <h3 style={{ color: "#374151", fontWeight: 600 }}>No articles yet</h3>
          <p style={{ color: "#9ca3af", fontSize: ".88rem" }}>Create your first article to get started.</p>
          <button onClick={() => setEditing(null)}
            style={{ marginTop: 16, padding: "10px 20px", background: "#3b0764", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, cursor: "pointer" }}>
            Write First Article
          </button>
        </div>
      ) : (
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".82rem" }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                {["Article","Category","Status","Published","Actions"].map(h => (
                  <th key={h} style={{ padding: "11px 16px", textAlign: "left", fontWeight: 700, fontSize: ".7rem", textTransform: "uppercase", letterSpacing: ".06em", color: "#6b7280" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((post, i) => (
                <tr key={post.id} style={{ borderBottom: i < filtered.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                  {/* Article */}
                  <td style={{ padding: "14px 16px", maxWidth: 340 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 38, height: 38, borderRadius: 6, flexShrink: 0,
                        background: `linear-gradient(135deg,${post.cover_color}33,${post.cover_color}66)`,
                        display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.2rem",
                      }}>
                        {post.cover_emoji}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: "#1f2937", lineHeight: 1.3 }}>{post.title}</div>
                        <div style={{ color: "#9ca3af", fontSize: ".72rem", marginTop: 2 }}>/blog/{post.slug}</div>
                      </div>
                    </div>
                  </td>
                  {/* Category */}
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{
                      padding: "3px 8px", borderRadius: 50, fontSize: ".7rem", fontWeight: 700,
                      background: `${post.cover_color}18`, color: post.cover_color,
                    }}>{post.category}</span>
                  </td>
                  {/* Status */}
                  <td style={{ padding: "14px 16px" }}>
                    <span style={{
                      padding: "3px 10px", borderRadius: 50, fontSize: ".7rem", fontWeight: 700,
                      background: post.status === "published" ? "#d1fae5" : "#f3f4f6",
                      color: post.status === "published" ? "#065f46" : "#6b7280",
                    }}>
                      {post.status}
                    </span>
                    {post.is_featured && (
                      <span style={{ marginLeft: 6, fontSize: ".65rem", padding: "2px 7px", background: "#fef3c7", color: "#92400e", borderRadius: 50, fontWeight: 700 }}>★ Featured</span>
                    )}
                  </td>
                  {/* Published */}
                  <td style={{ padding: "14px 16px", color: "#6b7280" }}>{fmtDate(post.published_at)}</td>
                  {/* Actions */}
                  <td style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      {/* Edit */}
                      <button onClick={() => setEditing(post)} title="Edit"
                        style={{ padding: "5px 8px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer", color: "#374151" }}>
                        <Edit2 size={13} />
                      </button>
                      {/* Publish/Unpublish */}
                      <button onClick={() => handleTogglePublish(post)} disabled={toggling === post.id}
                        title={post.status === "published" ? "Move to draft" : "Publish"}
                        style={{ padding: "5px 8px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer", color: post.status === "published" ? "#6b7280" : "#065f46" }}>
                        {toggling === post.id ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : post.status === "published" ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                      {/* Featured toggle */}
                      <button onClick={() => handleToggleFeatured(post)} title={post.is_featured ? "Unfeature" : "Set as featured"}
                        style={{ padding: "5px 8px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", cursor: "pointer", color: post.is_featured ? "#d97706" : "#9ca3af" }}>
                        {post.is_featured ? <Star size={13} /> : <StarOff size={13} />}
                      </button>
                      {/* View */}
                      {post.status === "published" && (
                        <a href={`/blog/${post.slug}`} target="_blank" rel="noopener" title="View live"
                          style={{ display: "flex", alignItems: "center", padding: "5px 8px", border: "1px solid #e5e7eb", borderRadius: 6, background: "#fff", color: "#374151", textDecoration: "none" }}>
                          <Globe size={13} />
                        </a>
                      )}
                      {/* Delete */}
                      <button onClick={() => handleDelete(post.id, post.title)} disabled={deleting === post.id}
                        title="Delete"
                        style={{ padding: "5px 8px", border: "1px solid #fca5a5", borderRadius: 6, background: "#fff", cursor: "pointer", color: "#b91c1c" }}>
                        {deleting === post.id ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Trash2 size={13} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
