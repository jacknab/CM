/**
 * A client's form or waiver from a Certxa Pro business (owner, 2026-11-15; routes/proForms.ts): certxa.com/f/<code>,
 * the link in the e-mail or text, or opened on the pro's phone with "Fill in here". No sign-in: the code in the link
 * is the key. A waiver ends with the client's typed full name and a drawn signature.
 */
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";

type Field = { label: string; fieldType: "text" | "long_text" | "yes_no" | "choice" | "multi" | "date" | "agree" | "info" | "signature"; options: string[]; required: boolean };
type Form = { business: string; name: string; description: string | null; kind: "intake" | "waiver"; completed: boolean; clientName: string | null; firstName: string | null; visitAt: string | null; timezone: string; fields: Field[] };

const input = "w-full rounded-xl border border-gray-300 bg-white px-3.5 py-2.5 text-[15px] outline-none focus:border-gray-900";

/** Draw with a finger or mouse; the picture is sent as a PNG. */
function SignaturePad({ onChange }: { onChange: (png: string | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const drawn = useRef(false);
  useEffect(() => {
    const c = canvas.current!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio; c.height = c.offsetHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio); ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#111827";
  }, []);
  const point = (e: React.PointerEvent) => { const r = canvas.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const; };
  const down = (e: React.PointerEvent) => {
    e.preventDefault(); canvas.current!.setPointerCapture(e.pointerId); drawing.current = true;
    const ctx = canvas.current!.getContext("2d")!; const [x, y] = point(e); ctx.beginPath(); ctx.moveTo(x, y);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvas.current!.getContext("2d")!; const [x, y] = point(e); ctx.lineTo(x, y); ctx.stroke(); drawn.current = true;
  };
  const up = () => { if (!drawing.current) return; drawing.current = false; if (drawn.current) onChange(canvas.current!.toDataURL("image/png")); };
  const clear = () => {
    const c = canvas.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); drawn.current = false; onChange(null);
  };
  return (
    <div>
      <canvas ref={canvas} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
        className="h-40 w-full touch-none rounded-xl border border-gray-300 bg-white" aria-label="Sign here" data-testid="form-signature-pad" />
      <div className="mt-1 flex justify-between text-xs text-gray-500"><span>Sign above with your finger or mouse</span>
        <button type="button" onClick={clear} className="font-semibold text-gray-700 underline">Clear</button></div>
    </div>
  );
}

export default function ClientForm() {
  const { token = "" } = useParams();
  const [form, setForm] = useState<Form | null>(null);
  const [failed, setFailed] = useState("");
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [signatureName, setSignatureName] = useState("");
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/public/forms/${encodeURIComponent(token)}`).then(async (res) => {
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "This link isn't valid.");
      setForm(data); setSignatureName(data.clientName || "");
    }).catch((e) => setFailed(e instanceof Error ? e.message : "This link isn't valid."));
  }, [token]);

  const set = (i: number, v: unknown) => setAnswers((a) => ({ ...a, [String(i)]: v }));

  const submit = async () => {
    if (!form || busy) return;
    for (const [i, f] of form.fields.entries()) {
      if (!f.required || f.fieldType === "info" || f.fieldType === "signature") continue;
      const v = answers[String(i)];
      if (v === undefined || v === "" || v === false || (Array.isArray(v) && v.length === 0)) { setError(`Please answer: ${f.label}`); return; }
    }
    const needsSignature = form.fields.some((f) => f.fieldType === "signature");
    if (needsSignature && (!signatureName.trim() || !signatureImage)) { setError("Please type your full name and sign."); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/public/forms/${encodeURIComponent(token)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, ...(needsSignature ? { signatureName: signatureName.trim(), signatureImage } : {}) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "The form could not be sent. Please try again.");
      setDone(true); window.scrollTo(0, 0);
    } catch (e) { setError(e instanceof Error ? e.message : "The form could not be sent. Please try again."); }
    finally { setBusy(false); }
  };

  if (failed) return <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6 text-center text-gray-700"><p>{failed}</p></main>;
  if (!form) return <main className="flex min-h-screen items-center justify-center bg-gray-50"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></main>;

  const header = (
    <header className="border-b border-gray-200 bg-white px-5 py-5">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm font-medium text-gray-500" data-testid="form-business">{form.business}</p>
        <h1 className="mt-1 text-xl font-semibold text-gray-900" data-testid="form-name">{form.name}</h1>
        {form.visitAt && !form.completed && !done && (
          <p className="mt-1 text-sm text-gray-500">For your visit on {new Date(form.visitAt).toLocaleString("en-US", { timeZone: form.timezone, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>
        )}
      </div>
    </header>
  );

  if (form.completed || done) return (
    <main className="min-h-screen bg-gray-50 text-gray-900">{header}
      <div className="mx-auto max-w-2xl px-5 py-10 text-center" data-testid="form-done">
        <p className="text-lg font-semibold">Thank you{form.firstName ? `, ${form.firstName}` : ""}!</p>
        <p className="mt-2 text-gray-600">{form.business} has your {form.kind === "waiver" ? "signed form" : "answers"}. You can close this page.</p>
      </div>
    </main>
  );

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900" data-testid="client-form">{header}
      <div className="mx-auto max-w-2xl space-y-6 px-5 py-6">
        {form.description && <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-gray-700">{form.description}</p>}
        {form.fields.map((f, i) => {
          const v = answers[String(i)];
          const label = <p className="mb-2 text-[15px] font-semibold leading-snug">{f.label}{f.required && <span className="text-gray-400"> *</span>}</p>;
          if (f.fieldType === "info") return <p key={i} className="whitespace-pre-wrap text-[15px] leading-relaxed text-gray-700">{f.label}</p>;
          if (f.fieldType === "signature") return (
            <div key={i} className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4">
              {label}
              <input className={input} value={signatureName} onChange={(e) => setSignatureName(e.target.value)} placeholder="Your full name" autoComplete="name" data-testid="form-signature-name" />
              <SignaturePad onChange={setSignatureImage} />
            </div>
          );
          if (f.fieldType === "agree") return (
            <label key={i} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-gray-200 bg-white p-4">
              <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-gray-900" checked={v === true} onChange={(e) => set(i, e.target.checked)} data-testid={`form-field-${i}`} />
              <span className="text-[15px] leading-relaxed">{f.label}{f.required && <span className="text-gray-400"> *</span>}</span>
            </label>
          );
          return (
            <div key={i}>
              {label}
              {f.fieldType === "text" && <input className={input} value={String(v ?? "")} maxLength={500} onChange={(e) => set(i, e.target.value)} data-testid={`form-field-${i}`} />}
              {f.fieldType === "long_text" && <textarea className={input} rows={3} value={String(v ?? "")} maxLength={5000} onChange={(e) => set(i, e.target.value)} data-testid={`form-field-${i}`} />}
              {f.fieldType === "date" && <input type="date" className={input} value={String(v ?? "")} onChange={(e) => set(i, e.target.value)} data-testid={`form-field-${i}`} />}
              {f.fieldType === "yes_no" && (
                <div className="flex gap-3" data-testid={`form-field-${i}`}>
                  {(["yes", "no"] as const).map((o) => (
                    <button key={o} type="button" onClick={() => set(i, o)}
                      className={`flex-1 rounded-xl border px-4 py-2.5 text-[15px] font-semibold ${v === o ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white"}`}>{o === "yes" ? "Yes" : "No"}</button>
                  ))}
                </div>
              )}
              {f.fieldType === "choice" && (
                <select className={input} value={String(v ?? "")} onChange={(e) => set(i, e.target.value)} data-testid={`form-field-${i}`}>
                  <option value="">Choose…</option>
                  {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              )}
              {f.fieldType === "multi" && (
                <div className="space-y-2" data-testid={`form-field-${i}`}>
                  {f.options.map((o) => {
                    const list = Array.isArray(v) ? (v as string[]) : [];
                    return (
                      <label key={o} className="flex items-center gap-3 text-[15px]">
                        <input type="checkbox" className="h-5 w-5 accent-gray-900" checked={list.includes(o)} onChange={(e) => set(i, e.target.checked ? [...list, o] : list.filter((x) => x !== o))} />{o}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        <button type="button" onClick={submit} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-full bg-gray-900 px-6 py-3.5 text-[15px] font-semibold text-white disabled:opacity-50" data-testid="form-submit">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}{form.kind === "waiver" ? "Sign and send" : "Send"}
        </button>
        <p className="pb-6 text-center text-xs text-gray-400">Your answers go only to {form.business}.</p>
      </div>
    </main>
  );
}
