import { Mail, MessageSquare, Clock, BookOpen, ExternalLink, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Link } from "wouter";
import { useState } from "react";

export default function Support() {
  const storeid =
    typeof window !== "undefined" ? sessionStorage.getItem("storeid") : null;

  const [copied, setCopied] = useState(false);

  const handleCopyStoreId = () => {
    if (!storeid) return;
    navigator.clipboard.writeText(storeid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-3xl mx-auto px-6 lg:px-10 py-12 flex flex-col gap-10">
      {/* Header */}
      <div>
        <h1 className="font-serif text-4xl lg:text-5xl font-bold text-[#3B0764] mb-3">
          Contact Support
        </h1>
        <p className="text-gray-600 text-lg">
          We're here to help. Reach out via email or check the documentation first — most
          questions are answered there.
        </p>
      </div>

      {/* Self-serve first */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-gray-900">Quick answers</h2>
        <Card className="rounded-2xl border-gray-100 shadow-sm divide-y divide-gray-100 overflow-hidden">
          <Link href="/docs">
            <div className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors cursor-pointer">
              <div className="w-9 h-9 rounded-xl bg-[#F3EEFF] flex items-center justify-center shrink-0">
                <BookOpen className="w-4 h-4 text-[#3B0764]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">User Guide &amp; Documentation</p>
                <p className="text-xs text-gray-500">
                  Step-by-step guides for the editor, publishing, domains, and more
                </p>
              </div>
              <ExternalLink className="w-4 h-4 text-gray-300 shrink-0" />
            </div>
          </Link>
          <a
            href="/docs#faq"
            className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50 transition-colors"
          >
            <div className="w-9 h-9 rounded-xl bg-[#F3EEFF] flex items-center justify-center shrink-0">
              <MessageSquare className="w-4 h-4 text-[#3B0764]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">Frequently Asked Questions</p>
              <p className="text-xs text-gray-500">
                Common issues with the editor, custom domains, and publishing
              </p>
            </div>
            <ExternalLink className="w-4 h-4 text-gray-300 shrink-0" />
          </a>
        </Card>
      </section>

      {/* Email support */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-gray-900">Get in touch</h2>
        <Card className="rounded-2xl border-gray-100 shadow-sm divide-y divide-gray-100 overflow-hidden">
          <a
            href={`mailto:support@certxa.com?subject=Website Builder Support${storeid ? `&body=Store ID: ${storeid}%0A%0ADescribe your issue below:%0A` : ""}`}
            className="px-6 py-5 flex items-start gap-4 hover:bg-gray-50 transition-colors"
          >
            <div className="w-9 h-9 rounded-xl bg-[#F3EEFF] flex items-center justify-center shrink-0 mt-0.5">
              <Mail className="w-4 h-4 text-[#3B0764]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">Email Support</p>
              <p className="text-sm text-[#3B0764] font-medium mt-0.5">support@certxa.com</p>
              <p className="text-xs text-gray-500 mt-1">
                We respond within 1 business day. For faster help, include your Store ID and a
                brief description of the issue in your message.
              </p>
            </div>
          </a>

          <div className="px-6 py-4 flex items-center gap-4 bg-gray-50/50">
            <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4 text-gray-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-700">Support hours</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Monday – Friday, 9 am – 6 pm EST. We aim to reply within 24 hours on business days.
              </p>
            </div>
          </div>
        </Card>
      </section>

      {/* Store ID panel */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-gray-900">Your Store ID</h2>
        <Card className="rounded-2xl border-gray-100 shadow-sm px-6 py-5">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-wider mb-2">
            Include this in every support request
          </p>
          {storeid ? (
            <div className="flex items-center gap-3">
              <code className="flex-1 font-mono text-sm text-gray-800 bg-gray-50 border border-gray-100 rounded-lg px-4 py-2.5 break-all">
                {storeid}
              </code>
              <button
                onClick={handleCopyStoreId}
                className="shrink-0 bg-[#3B0764] text-white text-xs font-semibold px-4 py-2.5 rounded-lg hover:bg-[#4C0F85] transition-colors flex items-center gap-1.5"
              >
                {copied ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Copied
                  </>
                ) : (
                  "Copy"
                )}
              </button>
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic">
              Store ID not set. Make sure you opened the builder with your{" "}
              <code className="text-xs bg-gray-100 px-1 rounded">?token=</code> link from SalonOS.
            </p>
          )}
          <p className="text-xs text-gray-400 mt-3">
            Your Store ID lets us locate your account instantly and resolve issues faster.
          </p>
        </Card>
      </section>

      {/* What to include */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-gray-900">Tips for a faster resolution</h2>
        <Card className="rounded-2xl border-gray-100 shadow-sm px-6 py-5">
          <ul className="space-y-3">
            {[
              "Include your Store ID (see above) in every message.",
              "Describe the exact step you were on when the issue occurred.",
              "Attach a screenshot if the problem is visual (wrong layout, broken image, etc.).",
              "Note whether the issue happens on desktop, mobile, or both.",
              "If a custom domain isn't working, include the full domain name and your DNS registrar.",
            ].map((tip) => (
              <li key={tip} className="flex items-start gap-3 text-sm text-gray-700">
                <CheckCircle2 className="w-4 h-4 text-[#3B0764] shrink-0 mt-0.5" />
                {tip}
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}
