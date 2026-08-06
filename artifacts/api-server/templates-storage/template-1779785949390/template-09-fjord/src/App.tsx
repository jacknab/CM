import { useState, useEffect } from 'react';
import { useSiteData, groupHours, fmtPhone, fmtPrice, SLUG } from './lib/data';

const C = { bg: '#F7F6F3', bg2: '#F0EDE8', accent: '#6B6258', accentLight: '#8C8070', dark: '#2A2520', muted: '#9A9088', border: '#E0DAD4', cream: '#FDFCFB' };

function Panel({ open, onClose, slug }: { open: boolean; onClose: () => void; slug: string | null }) {
  const url = slug ? `https://certxa.com/book/${slug}` : null;
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(42,37,32,0.4)', zIndex: 9998, opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity 0.4s', backdropFilter: 'blur(8px)' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px,100vw)', background: C.cream, zIndex: 9999, display: 'flex', flexDirection: 'column', transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.5s cubic-bezier(0.22,1,0.36,1)', borderLeft: `1px solid ${C.border}` }}>
        <div style={{ padding: '40px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontFamily: 'Inter', fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', color: C.dark }}>Book</p>
          <button onClick={onClose} style={{ color: C.muted, fontSize: 16, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 300 }}>✕</button>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: url ? 'stretch' : 'center', justifyContent: url ? 'stretch' : 'center', padding: url ? 0 : 48, flexDirection: 'column' }}>
          {url ? <iframe src={url} style={{ width: '100%', height: '100%', border: 'none' }} title="Book" /> : (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 15, color: C.dark, marginBottom: 12, fontWeight: 500 }}>Contact us to book</p>
              <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.8 }}>We look forward to welcoming you.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function App() {
  const data = useSiteData();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const slug = SLUG || data.business?.booking_slug || null;
  const b = data.business || {};
  const name = b.name || 'Lumière Nail Studio';
  const addr = [b.address, b.city, b.state].filter(Boolean).join(', ');
  const hours = groupHours(data.hours || []);

  useEffect(() => {
    const s = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', s, { passive: true });
    return () => window.removeEventListener('scroll', s);
  }, []);

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', background: C.bg, color: C.dark, minHeight: '100vh', fontWeight: 400 }}>
      {/* NAV */}
      <header style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(247,246,243,0.94)', borderBottom: `1px solid ${C.border}`, backdropFilter: 'blur(16px)', transition: 'all 0.3s' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64, padding: '0 40px' }}>
          <p style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.02em', color: C.dark }}>{name}</p>
          <nav style={{ display: 'flex', gap: 28, alignItems: 'center' }}>
            {['Services', 'Team', 'Reviews', 'Contact'].map(item => (
              <a key={item} href={`#${item.toLowerCase()}`} style={{ color: C.muted, fontSize: 13, fontWeight: 400, transition: 'color 0.2s' }} onMouseEnter={e => (e.currentTarget.style.color = C.dark)} onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>{item}</a>
            ))}
            <button onClick={() => setOpen(true)} style={{ background: C.dark, color: C.cream, border: 'none', padding: '8px 22px', fontSize: 13, fontWeight: 500, cursor: 'pointer', borderRadius: 3, letterSpacing: '-0.01em', transition: 'background 0.2s' }} onMouseEnter={e => (e.currentTarget.style.background = C.accent)} onMouseLeave={e => (e.currentTarget.style.background = C.dark)}>Book</button>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section style={{ padding: '100px 40px 80px', maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'center' }}>
        <div>
          <p style={{ fontSize: 11, letterSpacing: '0.12em', color: C.muted, textTransform: 'uppercase', fontWeight: 500, marginBottom: 24 }}>Nail Studio</p>
          <h1 style={{ fontSize: 'clamp(48px,5vw,72px)', fontWeight: 300, lineHeight: 1.1, letterSpacing: '-0.04em', marginBottom: 24, color: C.dark }}>
            Considered.<br />
            Crafted.<br />
            <span style={{ color: C.accent }}>Calm.</span>
          </h1>
          <p style={{ color: C.muted, fontSize: 16, lineHeight: 1.8, marginBottom: 40, maxWidth: 380, fontWeight: 300 }}>
            Where Scandinavian restraint meets artisanal nail care. Quiet spaces. Precise results. Nothing superfluous.
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => setOpen(true)} style={{ background: C.dark, color: C.cream, border: 'none', padding: '13px 36px', fontSize: 14, fontWeight: 500, cursor: 'pointer', borderRadius: 3, letterSpacing: '-0.01em', transition: 'background 0.2s' }} onMouseEnter={e => (e.currentTarget.style.background = C.accent)} onMouseLeave={e => (e.currentTarget.style.background = C.dark)}>Book Appointment</button>
            <a href="#services" style={{ border: `1px solid ${C.border}`, color: C.muted, padding: '13px 28px', fontSize: 14, fontWeight: 400, display: 'inline-block', borderRadius: 3, transition: 'all 0.2s' }} onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.dark; (e.currentTarget as HTMLElement).style.color = C.dark; }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.color = C.muted; }}>Services</a>
          </div>
        </div>
        <div style={{ position: 'relative', borderRadius: 4, overflow: 'hidden', aspectRatio: '4/5' }}>
          <img src="https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=800&q=85" alt="Nail care" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      </section>

      {/* STATS */}
      <div style={{ padding: '40px', maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: C.border }}>
        {[['5★', 'Average Rating'], ['10yr', 'Experience'], ['100%', 'Natural Products']].map(([val, label]) => (
          <div key={label} style={{ background: C.cream, padding: '32px 40px' }}>
            <p style={{ fontSize: 32, fontWeight: 200, letterSpacing: '-0.04em', color: C.dark, marginBottom: 4 }}>{val}</p>
            <p style={{ fontSize: 12, color: C.muted, fontWeight: 400 }}>{label}</p>
          </div>
        ))}
      </div>

      {/* SERVICES */}
      <section id="services" style={{ padding: '80px 40px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 48 }}>
          <div>
            <p style={{ fontSize: 11, letterSpacing: '0.12em', color: C.muted, textTransform: 'uppercase', fontWeight: 500, marginBottom: 8 }}>What we offer</p>
            <h2 style={{ fontSize: 40, fontWeight: 300, letterSpacing: '-0.03em', color: C.dark }}>Services</h2>
          </div>
          <button onClick={() => setOpen(true)} style={{ background: 'transparent', border: `1px solid ${C.border}`, color: C.muted, padding: '10px 24px', fontSize: 13, fontWeight: 400, cursor: 'pointer', borderRadius: 3, transition: 'all 0.2s' }} onMouseEnter={e => { (e.currentTarget).style.borderColor = C.dark; (e.currentTarget).style.color = C.dark; }} onMouseLeave={e => { (e.currentTarget).style.borderColor = C.border; (e.currentTarget).style.color = C.muted; }}>Book all services →</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: C.border }}>
          {(data.services || []).map((svc, i) => (
            <div key={svc.id || i} style={{ background: C.bg, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 32px', cursor: 'pointer', transition: 'background 0.2s' }} onMouseEnter={e => (e.currentTarget.style.background = C.cream)} onMouseLeave={e => (e.currentTarget.style.background = C.bg)} onClick={() => setOpen(true)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                <span style={{ fontSize: 11, color: C.muted, fontWeight: 500, minWidth: 28 }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ fontSize: 17, fontWeight: 400, letterSpacing: '-0.01em', color: C.dark }}>{svc.name}</span>
                {svc.duration && <span style={{ fontSize: 12, color: C.muted, fontWeight: 300 }}>{svc.duration} min</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <span style={{ fontSize: 17, fontWeight: 500, color: C.dark, letterSpacing: '-0.02em' }}>{fmtPrice(svc.price)}</span>
                <span style={{ color: C.muted, fontSize: 16, fontWeight: 300 }}>→</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* TEAM */}
      {(data.staff || []).length > 0 && (
        <section id="team" style={{ padding: '80px 40px', background: C.bg2 }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <p style={{ fontSize: 11, letterSpacing: '0.12em', color: C.muted, textTransform: 'uppercase', fontWeight: 500, marginBottom: 8 }}>Our people</p>
            <h2 style={{ fontSize: 40, fontWeight: 300, letterSpacing: '-0.03em', color: C.dark, marginBottom: 48 }}>The Team</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 1, background: C.border }}>
              {(data.staff || []).map((m, i) => (
                <div key={m.id || i} style={{ background: C.bg, padding: '36px 32px' }}>
                  <div style={{ width: 40, height: 40, background: C.dark, marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.cream, fontSize: 13, fontWeight: 600 , borderRadius: i % 3 === 0 ? '50%' : i % 3 === 1 ? '0px' : '10px', overflow: 'hidden' }}>
                    {m.avatar_url ? (
                      <img src={m.avatar_url} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : m.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}
                  </div>
                  <h3 style={{ fontSize: 17, fontWeight: 500, letterSpacing: '-0.01em', marginBottom: 2, color: C.dark }}>{m.name}</h3>
                  {m.role && <p style={{ fontSize: 12, color: C.muted, fontWeight: 400, marginBottom: 16 }}>{m.role}</p>}
                  {m.bio && <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.8, fontWeight: 300 }}>{m.bio}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* REVIEWS */}
      {(data.reviews || []).length > 0 && (
        <section id="reviews" style={{ padding: '80px 40px', maxWidth: 1100, margin: '0 auto' }}>
          <p style={{ fontSize: 11, letterSpacing: '0.12em', color: C.muted, textTransform: 'uppercase', fontWeight: 500, marginBottom: 8 }}>Client words</p>
          <h2 style={{ fontSize: 40, fontWeight: 300, letterSpacing: '-0.03em', color: C.dark, marginBottom: 48 }}>Reviews</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
            {(data.reviews || []).slice(0, 3).map((r, i) => (
              <div key={i} style={{ padding: '32px', border: `1px solid ${C.border}`, borderRadius: 4 }}>
                <div style={{ display: 'flex', gap: 2, marginBottom: 16 }}>
                  {[1,2,3,4,5].map(s => <span key={s} style={{ color: s <= (r.rating || 5) ? C.accent : C.border, fontSize: 12 }}>★</span>)}
                </div>
                <p style={{ fontSize: 15, lineHeight: 1.8, color: C.dark, marginBottom: 20, fontWeight: 300 }}>"{r.comment}"</p>
                <p style={{ fontSize: 12, color: C.muted, fontWeight: 500 }}>— {r.customer_name}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* CONTACT */}
      <section id="contact" style={{ padding: '80px 40px', background: C.bg2 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64 }}>
          <div>
            <p style={{ fontSize: 11, letterSpacing: '0.12em', color: C.muted, textTransform: 'uppercase', fontWeight: 500, marginBottom: 8 }}>Location</p>
            <h2 style={{ fontSize: 40, fontWeight: 300, letterSpacing: '-0.03em', color: C.dark, marginBottom: 32 }}>{name}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 36 }}>
              {addr && <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7, fontWeight: 300 }}>{addr}</p>}
              {b.phone && <a href={`tel:${b.phone}`} style={{ fontSize: 20, fontWeight: 300, color: C.dark, letterSpacing: '-0.02em', transition: 'color 0.2s' }} onMouseEnter={e => (e.currentTarget.style.color = C.accent)} onMouseLeave={e => (e.currentTarget.style.color = C.dark)}>{fmtPhone(b.phone)}</a>}
              {b.email && <a href={`mailto:${b.email}`} style={{ color: C.muted, fontSize: 13, transition: 'color 0.2s' }} onMouseEnter={e => (e.currentTarget.style.color = C.dark)} onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>{b.email}</a>}
            </div>
            <button onClick={() => setOpen(true)} style={{ background: C.dark, color: C.cream, border: 'none', padding: '13px 36px', fontSize: 14, fontWeight: 500, cursor: 'pointer', borderRadius: 3, transition: 'background 0.2s' }} onMouseEnter={e => (e.currentTarget.style.background = C.accent)} onMouseLeave={e => (e.currentTarget.style.background = C.dark)}>Book Appointment</button>
          </div>
          <div>
            <p style={{ fontSize: 11, letterSpacing: '0.12em', color: C.muted, textTransform: 'uppercase', fontWeight: 500, marginBottom: 32 }}>Hours</p>
            {hours.map((h, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0', borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 13, color: h.is_closed ? C.border : C.dark, fontWeight: 400 }}>{h.label}</span>
                <span style={{ fontSize: 13, color: h.is_closed ? C.border : C.muted, fontWeight: 300 }}>{h.hours}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer style={{ padding: '24px 40px', borderTop: `1px solid ${C.border}`, background: C.bg, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ fontSize: 13, fontWeight: 500, letterSpacing: '-0.01em', color: C.dark }}>{name}</p>
        <p style={{ color: C.muted, fontSize: 12, fontWeight: 300 }}>© {new Date().getFullYear()}</p>
      </footer>

        <div style={{ textAlign: 'center', padding: '8px 24px 12px', borderTop: '1px solid rgba(128,128,128,0.1)' }}>
          <p style={{ fontSize: 11, color: 'rgba(128,128,128,0.38)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, margin: 0 }}>
            Powered by <img src="/certxa-logo.png" alt="Certxa" style={{ height: 13, objectFit: 'contain', opacity: 0.45 }} />
          </p>
        </div>

      <Panel open={open} onClose={() => setOpen(false)} slug={slug} />
    </div>
  );
}
