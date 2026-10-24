import { useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Check, Copy, ExternalLink, Search } from 'lucide-react';
import { backlinks_roundup_outreach as c } from 'virtual:content';

const SITE = 'https://certxa.com';
const PAGE_URL = `${SITE}/backlinks/roundup-outreach`;

const searchQueries = [
  'best salon software 2025',
  'best nail salon software',
  'best hair salon software',
  'best barbershop software',
  'salon management software comparison',
  'vagaro alternatives',
  'glossgenius alternatives',
  'fresha alternatives',
  'square for salons alternatives',
  'salon booking software reviews',
  'nail salon pos system',
  'salon software with ai receptionist',
];

interface Article {
  id: string;
  title: string;
  url: string;
  domain: string;
  query: string;
  status: 'not-pitched' | 'pitched' | 'listed' | 'declined';
}

const seedArticles: Article[] = [
  { id: '1', title: 'Best Salon Software of 2025', url: 'https://www.capterra.com/salon-software/', domain: 'capterra.com', query: 'best salon software 2025', status: 'not-pitched' },
  { id: '2', title: 'Best Nail Salon Software', url: 'https://www.g2.com/categories/nail-salon', domain: 'g2.com', query: 'best nail salon software', status: 'not-pitched' },
  { id: '3', title: 'Vagaro Alternatives & Competitors', url: 'https://www.g2.com/products/vagaro/competitors/alternatives', domain: 'g2.com', query: 'vagaro alternatives', status: 'not-pitched' },
  { id: '4', title: 'GlossGenius Alternatives', url: 'https://www.capterra.com/p/glossgenius/alternatives/', domain: 'capterra.com', query: 'glossgenius alternatives', status: 'not-pitched' },
  { id: '5', title: 'Best Salon Management Software', url: 'https://www.softwareadvice.com/salon/', domain: 'softwareadvice.com', query: 'best salon software 2025', status: 'not-pitched' },
];

const comparisonPages = [
  { label: 'Certxa vs GlossGenius', path: '/compare/certxa-vs-glossgenius' },
  { label: 'Certxa vs Vagaro', path: '/compare/certxa-vs-vagaro' },
  { label: 'Certxa vs Fresha', path: '/compare/certxa-vs-fresha' },
  { label: 'Certxa vs Square', path: '/compare/certxa-vs-square' },
];

const statusLabels: Record<Article['status'], string> = {
  'not-pitched': c.statusLabels.notPitched,
  'pitched': c.statusLabels.pitched,
  'listed': c.statusLabels.listed,
  'declined': c.statusLabels.declined,
};

const statusColors: Record<Article['status'], string> = {
  'not-pitched': 'bg-muted text-muted-foreground border-border',
  'pitched': 'bg-yellow-50 text-yellow-700 border-yellow-200',
  'listed': 'bg-green-50 text-green-700 border-green-200',
  'declined': 'bg-red-50 text-red-600 border-red-200',
};

function buildOutreachEmail(articleTitle: string, articleUrl: string): string {
  const domain = (() => { try { return new URL(articleUrl).hostname.replace('www.', ''); } catch { return articleUrl; } })();
  return `Subject: Addition suggestion for "${articleTitle}"

Hi [Author/Editor name],

I came across your article "${articleTitle}" on ${domain} — it's a great resource for salon owners comparing their options.

I wanted to flag Certxa (certxa.com) for potential inclusion. We're an all-in-one salon management platform built by a former nail salon owner, and we cover everything in one place: online booking, POS, self check-in kiosk, turn rotation, loyalty programs, and an AI receptionist called Autumn.

A few things that might be useful for your readers:
- Starter plan from $29/month — no contracts
- A $69 Stripe card reader
- Built specifically for nail salons, hair salons, barbershops, and spas

We also have a detailed comparison page that might be useful as a reference: certxa.com/compare/certxa-vs-vagaro (and similar pages for GlossGenius, Fresha, and Square).

Happy to provide a free trial account for your team to test. Let me know if you'd like more details or screenshots.

Thanks for your time,

Thanh Lam
Founder, Certxa
thanh@certxa.com
certxa.com`;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-background text-muted-foreground hover:text-foreground hover:border-primary transition-colors duration-150"
    >
      {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
      {copied ? 'Copied!' : label}
    </button>
  );
}

export default function RoundupOutreachPage() {
  const [articles, setArticles] = useState<Article[]>(seedArticles);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newQuery, setNewQuery] = useState(searchQueries[0]);

  function updateStatus(id: string, status: Article['status']) {
    setArticles(prev => prev.map(a => a.id === id ? { ...a, status } : a));
  }

  function addArticle() {
    if (!newTitle.trim() || !newUrl.trim()) return;
    let domain = newUrl;
    try { domain = new URL(newUrl).hostname.replace('www.', ''); } catch { /* keep raw */ }
    const id = Date.now().toString();
    setArticles(prev => [...prev, { id, title: newTitle.trim(), url: newUrl.trim(), domain, query: newQuery, status: 'not-pitched' }]);
    setNewTitle('');
    setNewUrl('');
  }

  const notPitched = articles.filter(a => a.status === 'not-pitched').length;
  const pitched = articles.filter(a => a.status === 'pitched').length;
  const listed = articles.filter(a => a.status === 'listed').length;

  return (
    <>
      <Helmet>
        <title>Roundup Article Outreach — Certxa Backlink Strategy</title>
        <meta name="description" content="Track and send outreach emails to 'best salon software' roundup articles. Includes search queries, article tracker, and ready-to-send email templates." />
        <link rel="canonical" href={PAGE_URL} />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <main className="pt-16 pb-xxl">
        <div className="max-w-4xl mx-auto px-6 md:px-10">

          {/* Header */}
          <div className="py-12 border-b border-border mb-10">
            <span className="text-xs font-semibold text-primary tracking-widest uppercase">{c.eyebrow}</span>
            <h1 className="mt-3 text-3xl md:text-4xl font-extrabold text-foreground tracking-tight" style={{ fontFamily: 'var(--font-heading)' }}>
              {c.heading}
            </h1>
            <p className="mt-3 text-muted-foreground leading-relaxed max-w-2xl">
              {c.description}
            </p>

            {/* Stats */}
            <div className="mt-6 flex flex-wrap gap-3">
              {[
                { label: c.statsLabels.toPitch, value: notPitched, color: 'text-foreground' },
                { label: c.statsLabels.pitched, value: pitched, color: 'text-yellow-600' },
                { label: c.statsLabels.listed, value: listed, color: 'text-green-600' },
              ].map(s => (
                <div key={s.label} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-card text-sm">
                  <span className={`text-xl font-extrabold ${s.color}`} style={{ fontFamily: 'var(--font-heading)' }}>{s.value}</span>
                  <span className="text-muted-foreground">{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Search queries */}
          <section className="mb-10">
            <h2 className="text-lg font-bold text-foreground mb-4" style={{ fontFamily: 'var(--font-heading)' }}>
              {c.queriesHeading}
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              {c.queriesDescription}
            </p>
            <div className="flex flex-wrap gap-2">
              {searchQueries.map(q => (
                <a
                  key={q}
                  href={`https://www.google.com/search?q=${encodeURIComponent(q)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card text-sm text-foreground hover:border-primary hover:text-primary transition-colors duration-150"
                >
                  <Search size={12} className="text-muted-foreground" />
                  {q}
                  <ExternalLink size={11} className="text-muted-foreground" />
                </a>
              ))}
            </div>
          </section>

          {/* Comparison pages — pitch assets */}
          <section className="mb-10 rounded-2xl border border-border bg-muted p-6">
            <h2 className="text-sm font-bold text-foreground mb-2" style={{ fontFamily: 'var(--font-heading)' }}>{c.assetsHeading}</h2>
            <p className="text-xs text-muted-foreground mb-4">{c.assetsDescription}</p>
            <div className="flex flex-wrap gap-2">
              {comparisonPages.map(p => (
                <a
                  key={p.path}
                  href={`${SITE}${p.path}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background text-xs text-primary hover:underline font-medium"
                >
                  <ExternalLink size={11} />
                  {p.label}
                </a>
              ))}
            </div>
          </section>

          {/* Article tracker */}
          <section className="mb-10">
            <h2 className="text-lg font-bold text-foreground mb-4" style={{ fontFamily: 'var(--font-heading)' }}>{c.trackerHeading}</h2>
            <div className="flex flex-col gap-3">
              {articles.map(article => {
                const isExpanded = expandedId === article.id;
                const email = buildOutreachEmail(article.title, article.url);
                return (
                  <div key={article.id} className="rounded-2xl border border-border bg-card overflow-hidden">
                    <div className="flex items-center gap-3 px-5 py-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-foreground truncate" style={{ fontFamily: 'var(--font-heading)' }}>{article.title}</span>
                          <span className="text-xs text-muted-foreground">{article.domain}</span>
                        </div>
                        <span className="text-xs text-muted-foreground mt-0.5 block">Query: {article.query}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <select
                          value={article.status}
                          onChange={e => updateStatus(article.id, e.target.value as Article['status'])}
                          className={`text-xs font-medium px-2.5 py-1 rounded-full border cursor-pointer bg-transparent ${statusColors[article.status]}`}
                        >
                          {(Object.keys(statusLabels) as Article['status'][]).map(s => (
                            <option key={s} value={s}>{statusLabels[s]}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : article.id)}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          {isExpanded ? 'Collapse' : 'Pitch email'}
                        </button>
                        <a href={article.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
                          <ExternalLink size={13} />
                        </a>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="border-t border-border px-5 pb-5 pt-4 flex flex-col gap-3">
                        <pre className="whitespace-pre-wrap font-sans text-sm text-foreground bg-muted rounded-xl p-5 border border-border leading-relaxed overflow-x-auto">
                          {email}
                        </pre>
                        <div className="flex gap-2">
                          <CopyButton text={email} label="Copy full email" />
                          <CopyButton text={`Subject: Addition suggestion for "${article.title}"`} label="Copy subject line" />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Add article */}
          <section className="rounded-2xl border border-border bg-card p-6">
            <h2 className="text-sm font-bold text-foreground mb-4" style={{ fontFamily: 'var(--font-heading)' }}>{c.addHeading}</h2>
            <div className="flex flex-col gap-3">
              <input
                type="text"
                placeholder="Article title"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
              <input
                type="url"
                placeholder="Article URL (https://...)"
                value={newUrl}
                onChange={e => setNewUrl(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
              <select
                value={newQuery}
                onChange={e => setNewQuery(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              >
                {searchQueries.map(q => <option key={q} value={q}>{q}</option>)}
              </select>
              <button
                onClick={addArticle}
                disabled={!newTitle.trim() || !newUrl.trim()}
                className="self-start px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Add article
              </button>
            </div>
          </section>

        </div>
      </main>
    </>
  );
}
