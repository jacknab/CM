import { useState, type FormEvent } from 'react';
import { LiveChatButton } from '@/components/LiveChat';
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion } from 'motion/react';
import { Mail, Phone, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { contact } from 'virtual:content';

const SITE = 'https://certxa.com';
const PAGE_URL = `${SITE}/contact`;
const OG_IMAGE = `${SITE}/og-image.png`;

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'ContactPage',
  '@id': `${PAGE_URL}#webpage`,
  name: 'Contact Certxa — Salon Software Support & Sales',
  url: PAGE_URL,
  description: 'Get in touch with the Certxa team for demos, pricing questions, hardware setup, or technical support.',
  isPartOf: { '@id': `${SITE}/#website` },
  about: { '@id': `${SITE}/#organization` },
};

type FormStatus = 'idle' | 'sending' | 'success' | 'error';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' as const } },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

export default function ContactPage() {
  const [status, setStatus] = useState<FormStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    if (formData.get('_gotcha')) return;

    const name = String(formData.get('name') ?? '').trim();
    const email = String(formData.get('email') ?? '').trim();
    const topic = String(formData.get('topic') ?? '').trim();
    const message = String(formData.get('message') ?? '').trim();

    setStatus('sending');
    setErrorMsg('');

    try {
      const res = await fetch('/api/contact-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, topic, message }),
      });

      const json = await res.json();
      if (json.success) {
        setStatus('success');
        form.reset();
        setSelectedTopic('');
      } else {
        throw new Error(json.error || 'Something went wrong.');
      }
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  return (
    <>
      <Helmet>
        <title>Contact Certxa — Salon Software Sales & Support</title>
        <meta
          name="description"
          content="Get in touch with the Certxa team. Request a demo, ask about pricing, get hardware setup help, or reach technical support. We typically respond within a few hours."
        />
        <link rel="canonical" href={PAGE_URL} />
        <meta property="og:title" content="Contact Certxa — Salon Software Sales & Support" />
        <meta
          property="og:description"
          content="Request a demo, ask about pricing, or get support. The Certxa team typically responds within a few hours during business hours."
        />
        <meta property="og:image" content={OG_IMAGE} />
        <meta property="og:url" content={PAGE_URL} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Contact Certxa — Salon Software Sales & Support" />
        <meta
          name="twitter:description"
          content="Request a demo, ask about pricing, or get support. We typically respond within a few hours."
        />
        <meta name="twitter:image" content={OG_IMAGE} />
        <script type="application/ld+json">
          {JSON.stringify(jsonLd).replace(/</g, '\\u003c')}
        </script>
      </Helmet>

      <main className="pt-16">

        {/* ── HERO ── */}
        <section className="py-xxl bg-background border-b border-border">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <motion.div
              variants={stagger}
              initial="hidden"
              animate="visible"
              className="max-w-2xl flex flex-col gap-5"
            >
              <motion.span
                variants={fadeUp}
                className="text-xs font-semibold text-primary tracking-widest uppercase"
              >
                {contact.hero.eyebrow}
              </motion.span>
              <motion.h1
                variants={fadeUp}
                className="text-4xl md:text-5xl font-extrabold leading-tight tracking-tight text-foreground"
                style={{ fontFamily: 'var(--font-heading)' }}
              >
                {contact.hero.headline}
              </motion.h1>
              <motion.p variants={fadeUp} className="text-lg text-muted-foreground leading-relaxed">
                {contact.hero.subhead}
              </motion.p>
            </motion.div>
          </div>
        </section>

        {/* ── MAIN CONTENT ── */}
        <section className="py-xxl bg-background">
          <div className="max-w-7xl mx-auto px-6 md:px-10">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-16">

              {/* ── LEFT: Contact info ── */}
              <motion.div
                variants={stagger}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                className="lg:col-span-2 flex flex-col gap-10"
              >
                <div className="flex flex-col gap-8">
                  {/* Email */}
                  <motion.div variants={fadeUp} className="flex gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Mail size={18} className="text-primary" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <p className="text-sm font-semibold text-foreground">Email</p>
                      <a
                        href={`mailto:${contact.info.email}`}
                        className="text-sm text-muted-foreground hover:text-primary transition-colors"
                      >
                        {contact.info.email}
                      </a>
                    </div>
                  </motion.div>

                  {/* Phone */}
                  <motion.div variants={fadeUp} className="flex gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Phone size={18} className="text-primary" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <p className="text-sm font-semibold text-foreground">Phone</p>
                      <a
                        href={`tel:${contact.info.phone.replace(/\D/g, '')}`}
                        className="text-sm text-muted-foreground hover:text-primary transition-colors"
                      >
                        {contact.info.phone}
                      </a>
                    </div>
                  </motion.div>

                  {/* Hours */}
                  <motion.div variants={fadeUp} className="flex gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Clock size={18} className="text-primary" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <p className="text-sm font-semibold text-foreground">Business hours</p>
                      <p className="text-sm text-muted-foreground">{contact.info.hours}</p>
                      <p className="text-xs text-muted-foreground mt-1">{contact.info.responseTime}</p>
                    </div>
                  </motion.div>

                  {/* Live chat: present only while chat is staffed */}
                  <LiveChatButton className="self-start" />
                </div>

                {/* Decorative × */}
                <div className="hidden lg:block mt-auto" aria-hidden="true">
                  <span
                    className="text-[8rem] font-black leading-none select-none"
                    style={{ color: 'hsl(var(--primary) / 0.07)', fontFamily: 'var(--font-heading)' }}
                  >
                    ×
                  </span>
                </div>
              </motion.div>

              {/* ── RIGHT: Form ── */}
              <motion.div
                variants={stagger}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                className="lg:col-span-3"
              >
                <motion.div
                  variants={fadeUp}
                  className="rounded-2xl border border-border bg-card p-8 md:p-10"
                >
                  <div className="flex flex-col gap-2 mb-8">
                    <h2
                      className="text-2xl font-bold text-foreground"
                      style={{ fontFamily: 'var(--font-heading)' }}
                    >
                      {contact.form.heading}
                    </h2>
                    <p className="text-sm text-muted-foreground">{contact.form.subheading}</p>
                  </div>

                  {status === 'success' ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.4, ease: 'easeOut' as const }}
                      className="flex flex-col items-center gap-4 py-12 text-center"
                    >
                      <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                        <CheckCircle2 size={28} className="text-primary" />
                      </div>
                      <h3
                        className="text-xl font-bold text-foreground"
                        style={{ fontFamily: 'var(--font-heading)' }}
                      >
                        {contact.form.successTitle}
                      </h3>
                      <p className="text-sm text-muted-foreground max-w-xs">
                        {contact.form.successMessage}
                      </p>
                      <button
                        onClick={() => setStatus('idle')}
                        className="mt-2 text-sm font-semibold text-primary hover:underline"
                      >
                        Send another message
                      </button>
                    </motion.div>
                  ) : (
                    <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
                      {/* Honeypot */}
                      <input
                        type="text"
                        name="_gotcha"
                        tabIndex={-1}
                        autoComplete="off"
                        style={{ position: 'absolute', left: '-9999px' }}
                        aria-hidden="true"
                      />

                      {/* Name + Email row */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div className="flex flex-col gap-2">
                          <label htmlFor="contact-name" className="text-sm font-medium text-foreground">
                            Full name <span className="text-primary">*</span>
                          </label>
                          <input
                            id="contact-name"
                            name="name"
                            type="text"
                            required
                            autoComplete="name"
                            placeholder="Jane Smith"
                            className="w-full px-4 py-3 rounded-lg border border-border bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <label htmlFor="contact-email" className="text-sm font-medium text-foreground">
                            Email address <span className="text-primary">*</span>
                          </label>
                          <input
                            id="contact-email"
                            name="email"
                            type="email"
                            required
                            autoComplete="email"
                            placeholder="jane@yoursalon.com"
                            className="w-full px-4 py-3 rounded-lg border border-border bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors"
                          />
                        </div>
                      </div>

                      {/* Topic */}
                      <div className="flex flex-col gap-2">
                        <label htmlFor="contact-topic" className="text-sm font-medium text-foreground">
                          What can we help with? <span className="text-primary">*</span>
                        </label>
                        <select
                          id="contact-topic"
                          name="topic"
                          required
                          value={selectedTopic}
                          onChange={(e) => setSelectedTopic(e.target.value)}
                          className="w-full px-4 py-3 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors appearance-none cursor-pointer"
                        >
                          <option value="" disabled>Select a topic…</option>
                          {contact.form.topics.map((t) => (
                            <option key={t.id} value={t.label}>{t.label}</option>
                          ))}
                        </select>
                      </div>

                      {/* Message */}
                      <div className="flex flex-col gap-2">
                        <label htmlFor="contact-message" className="text-sm font-medium text-foreground">
                          Message <span className="text-primary">*</span>
                        </label>
                        <textarea
                          id="contact-message"
                          name="message"
                          required
                          rows={5}
                          placeholder="Tell us a bit about your salon and what you're looking for…"
                          className="w-full px-4 py-3 rounded-lg border border-border bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors resize-none"
                        />
                      </div>

                      {/* Error */}
                      {status === 'error' && (
                        <div
                          role="alert"
                          className="flex items-center gap-3 px-4 py-3 rounded-lg border text-sm"
                          style={{
                            borderColor: 'hsl(var(--destructive) / 0.3)',
                            background: 'hsl(var(--destructive) / 0.05)',
                            color: 'hsl(var(--destructive))',
                          }}
                        >
                          <AlertCircle size={16} className="flex-shrink-0" />
                          <span>{errorMsg}</span>
                        </div>
                      )}

                      {/* Submit */}
                      <button
                        type="submit"
                        disabled={status === 'sending'}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200"
                      >
                        {status === 'sending' ? (
                          <>
                            <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                            Sending…
                          </>
                        ) : (
                          'Send message'
                        )}
                      </button>
                    </form>
                  )}
                </motion.div>
              </motion.div>

            </div>
          </div>
        </section>

      </main>
    </>
  );
}
