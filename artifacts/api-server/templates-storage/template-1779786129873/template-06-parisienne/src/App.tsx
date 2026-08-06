import { useState, useEffect } from 'react';
import { useSiteData, groupHours, fmtPhone, fmtPrice, SLUG } from './lib/data';

const C = { bg: '#F9F0F3', bg2: '#F2E5EA', accent: '#7B2D3E', accentLight: '#A04A5C', dark: '#1A0A0E', muted: '#9A7A84', border: '#E5CDD4', cream: '#FDF8F9' };

function Panel({ open, onClose, slug }: { open: boolean; onClose: () => void; slug: string | null }) {
  const url = slug ? `https://certxa.com/book/${slug}` : null;
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(26,10,14,0.5)', zIndex: 9998, opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity 0.4s', backdropFilter: 'blur(8px)' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px,100vw)', background: C.cream, zIndex: 9999, display: 'flex', flexDirection: 'column', transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.4s cubic-bezier(0.22,1,0.36,1)', borderLeft: `1px solid ${C.border}` }}>
        <div style={{ padding: '36px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontFamily: 'Italiana', fontSize: 28, color: C.dark }}>Réservation</p>
          <button onClick={onClose} style={{ color: C.muted, fontSize: 18, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: url ? 'stretch' : 'center', justifyContent: url ? 'stretch' : 'center', padding: url ? 0 : 48, flexDirection: 'column' }}>
          {url ? <iframe src={url} style={{ width: '100%', height: '100%', border: 'none' }} title="Book" /> : (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontFamily: 'Italiana', fontSize: 22, color: C.dark, marginBottom: 16 }}>Contactez-nous</p>
              <p style={{ fontFamily: 'Cormorant Garamond', color: C.muted, fontSize: 15, lineHeight: 1.8, fontStyle: 'italic' }}>Please call or email to schedule your appointment.</p>
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
    <div style={{ fontFamily: 'Cormorant Garamond, serif', background: C.bg, color: C.dark, minHeight: '100vh' }}>
      {/* NAV */}
      <header style={{ position: 'sticky', top: 0, zIndex: 100, background: scrolled ? 'rgba(249,240,243,0.96)' : C.bg, borderBottom: `1px solid ${C.border}`, transition: 'all 0.4s', backdropFilter: scrolled ? 'blur(12px)' : 'none' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 76, padding: '0 48px' }}>
          <p style={{ fontFamily: 'Italiana', fontSize: 26, color: C.dark, letterSpacing: '0.04em' }}>{name}</p>
          <nav style={{ display: 'flex', gap: 36, alignItems: 'center' }}>
            {['Services', 'Équipe', 'Avis', 'Contact'].map(item => (
              <a key={item} href={`#${item.toLowerCase().replace('é', 'e')}`} style={{ color: C.muted, fontSize: 13, letterSpacing: '0.06em', transition: 'color 0.2s', fontStyle: 'italic' }} onMouseEnter={e => (e.currentTarget.style.color = C.accent)} onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>{item}</a>
            ))}
            <button onClick={() => setOpen(true)} style={{ background: C.accent, color: C.cream, border: 'none', padding: '10px 28px', fontSize: 12, fontFamily: 'Cormorant Garamond', letterSpacing: '0.1em', fontStyle: 'italic', cursor: 'pointer', transition: 'background 0.3s' }} onMouseEnter={e => (e.currentTarget.style.background = C.accentLight)} onMouseLeave={e => (e.currentTarget.style.background = C.accent)}>Réserver</button>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section style={{ position: 'relative', minHeight: '95vh', display: 'grid', gridTemplateColumns: '5fr 7fr', overflow: 'hidden' }}>
        <div style={{ background: C.bg, padding: '80px 60px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <p style={{ fontSize: 11, letterSpacing: '0.25em', color: C.muted, textTransform: 'uppercase', marginBottom: 28, fontStyle: 'italic' }}>Paris · New York · Beverly Hills</p>
          <h1 style={{ fontFamily: 'Italiana', fontSize: 'clamp(52px,5vw,80px)', fontWeight: 400, lineHeight: 1.15, marginBottom: 28, color: C.dark }}>
            L'art de la<br />beauté des<br /><em style={{ color: C.accent }}>mains</em>
          </h1>
          <p style={{ fontSize: 17, color: C.muted, lineHeight: 1.85, marginBottom: 40, fontStyle: 'italic', maxWidth: 360 }}>
            Where Parisian refinement meets the artistry of hand care. Every appointment, a moment of grace.
          </p>
          <div style={{ display: 'flex', gap: 16 }}>
            <button onClick={() => setOpen(true)} style={{ background: C.accent, color: C.cream, border: 'none', padding: '14px 40px', fontSize: 14, fontFamily: 'Cormorant Garamond', letterSpacing: '0.08em', fontStyle: 'italic', cursor: 'pointer', transition: 'background 0.3s' }} onMouseEnter={e => (e.currentTarget.style.background = C.accentLight)} onMouseLeave={e => (e.currentTarget.style.background = C.accent)}>Prendre rendez-vous</button>
          </div>
          <div style={{ marginTop: 56 }}>
            {[['500+', 'Happy Clients'], ['10+', 'Years of Excellence'], ['100%', 'Artisan Crafted']].map(([val, label]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16 }}>
                <span style={{ fontFamily: 'Italiana', fontSize: 28, color: C.accent }}>{val}</span>
                <span style={{ fontSize: 13, color: C.muted, fontStyle: 'italic' }}>{label}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ position: 'relative', overflow: 'hidden' }}>
          <img src="https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=1000&q=85" alt="Salon" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,10,14,0.15)' }} />
          <div style={{ position: 'absolute', bottom: 48, right: 48, background: C.cream, padding: '20px 28px', maxWidth: 200 }}>
            <p style={{ fontFamily: 'Italiana', fontSize: 14, color: C.dark, marginBottom: 4 }}>Appointment Only</p>
            <p style={{ fontSize: 11, color: C.muted, fontStyle: 'italic' }}>An experience reserved for you alone</p>
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" style={{ padding: '100px 48px', background: C.cream }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <p style={{ fontSize: 11, letterSpacing: '0.2em', color: C.muted, textTransform: 'uppercase', fontStyle: 'italic', marginBottom: 16 }}>Nos Prestations</p>
            <h2 style={{ fontFamily: 'Italiana', fontSize: 52, color: C.dark }}>Nos Services</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
            {(data.services || []).map((svc, i) => (
              <div key={svc.id || i} style={{ background: C.bg, padding: '36px 32px', border: `1px solid ${C.border}`, transition: 'border-color 0.3s, background 0.3s' }} onMouseEnter={e => { (e.currentTarget).style.background = C.bg2; (e.currentTarget).style.borderColor = C.accent + '40'; }} onMouseLeave={e => { (e.currentTarget).style.background = C.bg; (e.currentTarget).style.borderColor = C.border; }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                  <p style={{ fontSize: 10, color: C.muted, letterSpacing: '0.15em', fontStyle: 'italic' }}>{String(i + 1).padStart(2, '0')}</p>
                  <p style={{ fontFamily: 'Italiana', fontSize: 26, color: C.accent }}>{fmtPrice(svc.price)}</p>
                </div>
                <h3 style={{ fontFamily: 'Italiana', fontSize: 24, color: C.dark, marginBottom: 8 }}>{svc.name}</h3>
                {svc.duration && <p style={{ fontSize: 12, color: C.muted, fontStyle: 'italic', marginBottom: 24 }}>{svc.duration} minutes</p>}
                <button onClick={() => setOpen(true)} style={{ background: 'transparent', border: `1px solid ${C.accent}50`, color: C.accent, padding: '9px 20px', fontSize: 12, fontFamily: 'Cormorant Garamond', fontStyle: 'italic', cursor: 'pointer', transition: 'all 0.2s', width: '100%', letterSpacing: '0.05em' }} onMouseEnter={e => { (e.currentTarget).style.background = C.accent; (e.currentTarget).style.color = C.cream; }} onMouseLeave={e => { (e.currentTarget).style.background = 'transparent'; (e.currentTarget).style.color = C.accent; }}>Réserver</button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TEAM */}
      {(data.staff || []).length > 0 && (
        <section id="equipe" style={{ padding: '100px 48px', background: C.bg }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 64 }}>
              <p style={{ fontSize: 11, letterSpacing: '0.2em', color: C.muted, textTransform: 'uppercase', fontStyle: 'italic', marginBottom: 16 }}>Nos Artisans</p>
              <h2 style={{ fontFamily: 'Italiana', fontSize: 52, color: C.dark }}>Notre Équipe</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
              {(data.staff || []).map((m, i) => (
                <div key={m.id || i} style={{ background: C.cream, padding: '40px 32px', border: `1px solid ${C.border}`, textAlign: 'center' }}>
                  <div style={{ width: 64, height: 64, background: C.accent, margin: '0 auto 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Italiana', fontSize: 22, color: C.cream , borderRadius: i % 3 === 0 ? '50%' : i % 3 === 1 ? '0px' : '10px', overflow: 'hidden' }}>
                    {m.avatar_url ? (
                      <img src={m.avatar_url} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : m.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}
                  </div>
                  <h3 style={{ fontFamily: 'Italiana', fontSize: 24, color: C.dark, marginBottom: 4 }}>{m.name}</h3>
                  {m.role && <p style={{ fontSize: 11, color: C.accent, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16, fontStyle: 'italic' }}>{m.role}</p>}
                  {m.bio && <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.85, fontStyle: 'italic' }}>{m.bio}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* REVIEWS */}
      {(data.reviews || []).length > 0 && (
        <section id="avis" style={{ padding: '100px 48px', background: C.bg2 }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 64 }}>
              <p style={{ fontSize: 11, letterSpacing: '0.2em', color: C.muted, textTransform: 'uppercase', fontStyle: 'italic', marginBottom: 16 }}>Témoignages</p>
              <h2 style={{ fontFamily: 'Italiana', fontSize: 52, color: C.dark }}>Nos Clientes</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
              {(data.reviews || []).slice(0, 3).map((r, i) => (
                <div key={i} style={{ background: C.cream, padding: '36px', borderTop: `2px solid ${C.accent}` }}>
                  <div style={{ display: 'flex', gap: 3, marginBottom: 20 }}>
                    {[1,2,3,4,5].map(s => <span key={s} style={{ color: s <= (r.rating || 5) ? C.accent : C.border, fontSize: 14 }}>★</span>)}
                  </div>
                  <p style={{ fontFamily: 'Cormorant Garamond', fontSize: 17, lineHeight: 1.85, color: C.dark, fontStyle: 'italic', marginBottom: 24 }}>"{r.comment}"</p>
                  <p style={{ fontSize: 12, color: C.muted, fontStyle: 'italic' }}>— {r.customer_name}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CONTACT */}
      <section id="contact" style={{ padding: '100px 48px', background: C.bg }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80 }}>
          <div>
            <p style={{ fontSize: 11, letterSpacing: '0.2em', color: C.muted, textTransform: 'uppercase', fontStyle: 'italic', marginBottom: 20 }}>Nous Trouver</p>
            <h2 style={{ fontFamily: 'Italiana', fontSize: 44, color: C.dark, marginBottom: 32 }}>{name}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 40 }}>
              {addr && <p style={{ fontSize: 15, color: C.muted, fontStyle: 'italic', lineHeight: 1.8 }}>{addr}</p>}
              {b.phone && <a href={`tel:${b.phone}`} style={{ fontFamily: 'Italiana', fontSize: 22, color: C.accent, transition: 'opacity 0.2s' }} onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')} onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>{fmtPhone(b.phone)}</a>}
              {b.email && <a href={`mailto:${b.email}`} style={{ fontSize: 13, color: C.muted, fontStyle: 'italic', transition: 'color 0.2s' }} onMouseEnter={e => (e.currentTarget.style.color = C.dark)} onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>{b.email}</a>}
            </div>
            <button onClick={() => setOpen(true)} style={{ background: C.accent, color: C.cream, border: 'none', padding: '14px 40px', fontSize: 14, fontFamily: 'Cormorant Garamond', fontStyle: 'italic', letterSpacing: '0.08em', cursor: 'pointer' }}>Prendre rendez-vous</button>
          </div>
          <div>
            <p style={{ fontSize: 11, letterSpacing: '0.2em', color: C.muted, textTransform: 'uppercase', fontStyle: 'italic', marginBottom: 32 }}>Horaires</p>
            {hours.map((h, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0', borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 15, color: h.is_closed ? C.border : C.dark, fontStyle: 'italic' }}>{h.label}</span>
                <span style={{ fontSize: 15, color: h.is_closed ? C.border : C.accent, fontStyle: 'italic' }}>{h.hours}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer style={{ padding: '28px 48px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: C.bg2 }}>
        <p style={{ fontFamily: 'Italiana', fontSize: 18, color: C.dark }}>{name}</p>
        <p style={{ color: C.muted, fontSize: 12, fontStyle: 'italic' }}>© {new Date().getFullYear()}</p>
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
