import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2 } from "lucide-react";

/**
 * Autumn's instructions: what the owner tells her, given to her at the start of every call
 * (server: GET/PUT /api/ai-receptionist/instructions → ownerInstructionsBlock in routes/aiReceptionist.ts).
 * The onboarding questions are answered one at a time; each answer is placed into the large text box,
 * which is what Autumn receives and which the owner can edit freely.
 */

interface Saved { text: string; answers: Record<string, string>; maxLength: number }

type Lang = { en: string; vi: string; es: string; fr: string };
const QUESTIONS: { key: string; q: Lang }[] = [
  { key: "about", q: { en: "How should Autumn describe your salon to a caller?", vi: "Autumn nên giới thiệu tiệm của bạn với khách gọi như thế nào?", es: "¿Cómo debe Autumn describir su salón a quien llama?", fr: "Comment Autumn doit-elle décrire votre salon à un appelant ?" } },
  { key: "walkins", q: { en: "Do you take walk-ins? What should callers know about them?", vi: "Tiệm có nhận khách vãng lai không? Khách cần biết gì?", es: "¿Acepta clientes sin cita? ¿Qué deben saber?", fr: "Acceptez-vous les clients sans rendez-vous ? Que doivent-ils savoir ?" } },
  { key: "cancellation", q: { en: "What is your cancellation and late-arrival policy?", vi: "Chính sách hủy hẹn và đến trễ của tiệm là gì?", es: "¿Cuál es su política de cancelación y llegadas tarde?", fr: "Quelle est votre politique d'annulation et de retard ?" } },
  { key: "payments", q: { en: "Which payment methods do you accept?", vi: "Tiệm nhận những hình thức thanh toán nào?", es: "¿Qué métodos de pago acepta?", fr: "Quels moyens de paiement acceptez-vous ?" } },
  { key: "popular", q: { en: "What do callers ask about most, and what should Autumn tell them?", vi: "Khách gọi hay hỏi gì nhất, và Autumn nên trả lời thế nào?", es: "¿Qué preguntan más quienes llaman y qué debe responder Autumn?", fr: "Que demandent le plus souvent les appelants, et que doit répondre Autumn ?" } },
  { key: "never", q: { en: "Is there anything Autumn should never say or promise?", vi: "Có điều gì Autumn không bao giờ được nói hoặc hứa không?", es: "¿Hay algo que Autumn nunca deba decir o prometer?", fr: "Y a-t-il quelque chose qu'Autumn ne doit jamais dire ou promettre ?" } },
  { key: "other", q: { en: "Anything else Autumn should know?", vi: "Autumn còn cần biết điều gì nữa không?", es: "¿Algo más que Autumn deba saber?", fr: "Autre chose qu'Autumn devrait savoir ?" } },
];

/** Puts one answer into the text: replaces the block it wrote last time for this question, or adds it at the end. */
export function placeAnswer(text: string, question: string, previous: string | undefined, answer: string): string {
  const block = (a: string) => `${question}\n${a}`;
  const next = answer.trim();
  if (previous && text.includes(block(previous))) {
    return next ? text.replace(block(previous), block(next)) : text.replace(block(previous), "").replace(/\n{3,}/g, "\n\n").trim();
  }
  if (!next) return text;
  return text.trim() ? `${text.trim()}\n\n${block(next)}` : block(next);
}

export default function AiReceptionistInstructions() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { pick } = useLanguage();

  const t = {
    back:      pick({ en: "Back to Autumn", vi: "Quay lại Autumn", es: "Volver a Autumn", fr: "Retour à Autumn" }),
    title:     pick({ en: "Autumn — Instructions", vi: "Autumn — Hướng dẫn", es: "Autumn — Instrucciones", fr: "Autumn — Instructions" }),
    subtitle:  pick({ en: "Autumn reads everything in the box below at the start of every call.", vi: "Autumn đọc toàn bộ nội dung trong ô bên dưới khi bắt đầu mỗi cuộc gọi.", es: "Autumn lee todo el cuadro de abajo al comienzo de cada llamada.", fr: "Autumn lit tout le contenu ci-dessous au début de chaque appel." }),
    step:      (n: number, of: number) => pick({ en: `Question ${n} of ${of}`, vi: `Câu hỏi ${n}/${of}`, es: `Pregunta ${n} de ${of}`, fr: `Question ${n} sur ${of}` }),
    prev:      pick({ en: "Back", vi: "Trước", es: "Atrás", fr: "Précédent" }),
    next:      pick({ en: "Next", vi: "Tiếp", es: "Siguiente", fr: "Suivant" }),
    finish:    pick({ en: "Add to instructions", vi: "Thêm vào hướng dẫn", es: "Agregar a las instrucciones", fr: "Ajouter aux instructions" }),
    boxLabel:  pick({ en: "Instructions for Autumn", vi: "Hướng dẫn cho Autumn", es: "Instrucciones para Autumn", fr: "Instructions pour Autumn" }),
    save:      pick({ en: "Save", vi: "Lưu", es: "Guardar", fr: "Enregistrer" }),
    saved:     pick({ en: "Saved — Autumn will use these on her next call", vi: "Đã lưu — Autumn sẽ dùng từ cuộc gọi tiếp theo", es: "Guardado: Autumn las usará en su próxima llamada", fr: "Enregistré — Autumn les utilisera dès son prochain appel" }),
    saveError: pick({ en: "Couldn't save the instructions", vi: "Không lưu được hướng dẫn", es: "No se pudieron guardar las instrucciones", fr: "Impossible d'enregistrer les instructions" }),
  };

  const { data, isLoading } = useQuery<Saved>({
    queryKey: ["/api/ai-receptionist/instructions"],
    queryFn: async () => {
      const res = await fetch("/api/ai-receptionist/instructions", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load instructions");
      return res.json();
    },
  });

  const [text, setText] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!data || loaded) return;
    setText(data.text); setAnswers(data.answers ?? {}); setDraft(data.answers?.[QUESTIONS[0].key] ?? ""); setLoaded(true);
  }, [data, loaded]);

  const maxLength = data?.maxLength ?? 8000;
  const question = QUESTIONS[step];
  const dirty = !!data && (text !== data.text || JSON.stringify(answers) !== JSON.stringify(data.answers ?? {}));

  // The answer on screen goes into the text box; then move `by` questions.
  const commitAndMove = (by: number) => {
    const asked = pick(question.q);
    const nextText = placeAnswer(text, asked, answers[question.key], draft);
    const nextAnswers = { ...answers };
    if (draft.trim()) nextAnswers[question.key] = draft.trim(); else delete nextAnswers[question.key];
    setText(nextText.slice(0, maxLength));
    setAnswers(nextAnswers);
    const to = Math.min(QUESTIONS.length - 1, Math.max(0, step + by));
    setStep(to);
    setDraft(nextAnswers[QUESTIONS[to].key] ?? "");
  };

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ai-receptionist/instructions", {
        method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, answers }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message || t.saveError);
      return body as Saved;
    },
    onSuccess: (saved) => {
      qc.setQueryData(["/api/ai-receptionist/instructions"], saved);
      setText(saved.text); setAnswers(saved.answers ?? {});
      toast({ title: t.saved });
    },
    onError: (err: any) => toast({ title: err?.message || t.saveError, variant: "destructive" }),
  });

  const last = step === QUESTIONS.length - 1;

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto pb-16">
        <button onClick={() => navigate("/manage/ai-receptionist")} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          {t.back}
        </button>

        <h1 className="text-2xl font-bold text-slate-800">{t.title}</h1>
        <p className="text-sm text-slate-500 mt-1 mb-6">{t.subtitle}</p>

        {isLoading || !loaded ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
        ) : (
          <>
            <div className="rounded-xl border border-slate-200 bg-white p-5 mb-6" data-testid="autumn-onboarding">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t.step(step + 1, QUESTIONS.length)}</p>
              <p className="mt-2 text-base font-semibold text-slate-800">{pick(question.q)}</p>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={3}
                maxLength={2000}
                className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
                data-testid="autumn-onboarding-answer"
              />
              <div className="mt-3 flex justify-between">
                <button type="button" onClick={() => commitAndMove(-1)} disabled={step === 0}
                  className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-40">
                  {t.prev}
                </button>
                <button type="button" onClick={() => commitAndMove(last ? 0 : 1)} data-testid="autumn-onboarding-next"
                  className="px-4 py-2 text-sm font-semibold text-white bg-slate-800 rounded-lg hover:bg-slate-700">
                  {last ? t.finish : t.next}
                </button>
              </div>
            </div>

            <label className="block text-sm font-semibold text-slate-700 mb-2" htmlFor="autumn-instructions">{t.boxLabel}</label>
            <textarea
              id="autumn-instructions"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={maxLength}
              rows={18}
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm leading-relaxed text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
              data-testid="autumn-instructions-text"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-slate-400">{text.length.toLocaleString()} / {maxLength.toLocaleString()}</span>
              <button type="button" onClick={() => save.mutate()} disabled={!dirty || save.isPending} data-testid="autumn-instructions-save"
                className="px-5 py-2 text-sm font-semibold text-white bg-slate-800 rounded-lg hover:bg-slate-700 disabled:opacity-40">
                {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t.save}
              </button>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
