import { useState, useEffect } from 'react';
import { useSiteData, groupHours, fmtPhone, fmtPrice, SLUG } from './lib/data';

const C = { bg: '#FBF5EE', bg2: '#F5EDE0', accent: '#C4673C', accentLight: '#D98055', dark: '#2A1A10', muted: '#A08060', border: '#E8D8C0', cream: '#FFF9F3' };

function Panel({ open, onClose, slug }: { open: boolean; onClose: () => void; slug: string | null }) {
  const url = slug ? `https://certxa.com/book/${slug}` : null;
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(42,26,16,0.5)', zIndex: 9998, opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity 0.4s', backdropFilter: 'blur(8px)' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px,100vw)', background: C.cream, zIndex: 9999, display: 'flex', flexDirection: 'column', transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.4s cubic-bezier(0.22,1,0.36,1)', borderLeft: `2px solid ${C.accent}` }}>
        <div style={{ padding: '36px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontFamily: 'Fraunces', fontSize: 26, color: C.dark, fontStyle: 'italic', fontWeight: 300 }}>Book a Visit</p>
          <button onClick={onClose} style={{ color: C.muted, fontSize: 18, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: url ? 'stretch' : 'center', justifyContent: url ? 'stretch' : 'center', padding: url ? 0 : 48, flexDirection: 'column' }}>
          {url ? <iframe src={url} style={{ width: '100%', height: '100%', border: 'none' }} title="Book" /> : (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontFamily: 'Fraunces', fontSize: 22, color: C.dark, marginBottom: 16, fontStyle: 'italic' }}>Come find us</p>
              <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.8 }}>Call or email to reserve your appointment.</p>
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
    <div style={{ fontFamily: 'Inter, sans-serif', background: C.bg, color: C.dark, minHeight: '100vh' }}>
      {/* NAV */}
      <header style={{ position: 'sticky', top: 0, zIndex: 100, background: scrolled ? 'rgba(251,245,238,0.96)' : C.bg, borderBottom: `1px solid ${C.border}`, transition: 'all 0.4s', backdropFilter: scrolled ? 'blur(12px)' : 'none' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 72, padding: '0 48px' }}>
          <p style={{ fontFamily: 'Fraunces', fontSize: 22, fontWeight: 300, fontStyle: 'italic', color: C.dark }}>{name}</p>
          <nav style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
            {['Services', 'Team', 'Reviews', 'Contact'].map(item => (
              <a key={item} href={`#${item.toLowerCase()}`} style={{ color: C.muted, fontSize: 13, fontWeight: 400, transition: 'color 0.2s' }} onMouseEnter={e => (e.currentTarget.style.color = C.accent)} onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>{item}</a>
            ))}
            <button onClick={() => setOpen(true)} style={{ background: C.accent, color: '#fff', border: 'none', padding: '10px 28px', fontSize: 13, fontWeight: 500, cursor: 'pointer', borderRadius: 2, transition: 'background 0.3s' }} onMouseEnter={e => (e.currentTarget.style.background = C.accentLight)} onMouseLeave={e => (e.currentTarget.style.background = C.accent)}>Reserve</button>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section style={{ position: 'relative', minHeight: '95vh', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <img src="https://images.unsplash.com/photo-1610992015732-2449b76344bc?auto=format&fit=crop&w=1800&q=80" alt="Salon" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(42,26,16,0.85) 45%, rgba(42,26,16,0.2))' }} />
        </div>
        <div style={{ position: 'relative', maxWidth: 1200, margin: '0 auto', padding: '0 48px', height: '95vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ maxWidth: 560 }}>
            <p style={{ fontSize: 11, letterSpacing: '0.2em', color: C.accent, textTransform: 'uppercase', fontWeight: 600, marginBottom: 28 }}>Mediterranean Luxury</p>
            <h1 style={{ fontFamily: 'Fraunces', fontSize: 'clamp(52px,6vw,88px)', fontWeight: 300, lineHeight: 1.1, marginBottom: 28, color: '#FFF9F3', letterSpacing: '-0.01em' }}>
              Sun-warmed<br />beauty, <em>sculpted</em><br />by hand
            </h1>
            <p style={{ fontSize: 16, color: 'rgba(255,249,243,0.65)', lineHeight: 1.85, marginBottom: 48, fontWeight: 300 }}>
              Inspired by the warmth of southern Europe, our nail studio brings the golden hour indoors — a slow, intentional ritual of care.
            </p>
            <div style={{ display: 'flex', gap: 16 }}>
              <button onClick={() => setOpen(true)} style={{ background: C.accent, color: '#fff', border: 'none', padding: '16px 48px', fontSize: 14, fontWeight: 600, cursor: 'pointer', borderRadius: 2, transition: 'background 0.3s' }} onMouseEnter={e => (e.currentTarget.style.background = C.accentLight)} onMouseLeave={e => (e.currentTarget.style.background = C.accent)}>Book Now</button>
              <a href="#services" style={{ border: '1px solid rgba(255,249,243,0.3)', color: 'rgba(255,249,243,0.7)', padding: '16px 32px', fontSize: 14, fontWeight: 400, display: 'inline-block', borderRadius: 2, transition: 'all 0.3s' }} onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,249,243,0.7)'; (e.currentTarget as HTMLElement).style.color = '#FFF9F3'; }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,249,243,0.3)'; (e.currentTarget as HTMLElement).style.color = 'rgba(255,249,243,0.7)'; }}>Services</a>
            </div>
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" style={{ padding: '100px 48px', background: C.cream }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>
            <div style={{ height: 2, width: 32, background: C.accent }} />
            <p style={{ fontSize: 11, letterSpacing: '0.15em', color: C.accent, textTransform: 'uppercase', fontWeight: 600 }}>Our Menu</p>
          </div>
          <h2 style={{ fontFamily: 'Fraunces', fontSize: 52, fontWeight: 300, marginBottom: 56, color: C.dark, fontStyle: 'italic' }}>Services</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
            {(data.services || []).map((svc, i) => (
              <div key={svc.id || i} style={{ background: C.bg, padding: '36px 32px', border: `1px solid ${C.border}`, borderRadius: 4, transition: 'transform 0.2s, border-color 0.2s' }} onMouseEnter={e => { (e.currentTarget).style.transform = 'translateY(-2px)'; (e.currentTarget).style.borderColor = C.accent + '60'; }} onMouseLeave={e => { (e.currentTarget).style.transform = 'translateY(0)'; (e.currentTarget).style.borderColor = C.border; }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <span style={{ fontSize: 10, color: C.muted, fontWeight: 600, letterSpacing: '0.1em' }}>№ {i + 1}</span>
                  <span style={{ fontFamily: 'Fraunces', fontSize: 28, color: C.accent, fontStyle: 'italic', fontWeight: 300 }}>{fmtPrice(svc.price)}</span>
                </div>
                <h3 style={{ fontFamily: 'Fraunces', fontSize: 24, fontWeight: 300, fontStyle: 'italic', marginBottom: 8, color: C.dark }}>{svc.name}</h3>
                {svc.duration && <p style={{ color: C.muted, fontSize: 12, fontWeight: 500, marginBottom: 24 }}>{svc.duration} minutes</p>}
                <button onClick={() => setOpen(true)} style={{ background: 'transparent', border: `1px solid ${C.accent}50`, color: C.accent, padding: '9px 20px', fontSize: 12, fontWeight: 500, cursor: 'pointer', borderRadius: 2, width: '100%', transition: 'all 0.2s' }} onMouseEnter={e => { (e.currentTarget).style.background = C.accent; (e.currentTarget).style.color = '#fff'; }} onMouseLeave={e => { (e.currentTarget).style.background = 'transparent'; (e.currentTarget).style.color = C.accent; }}>Reserve</button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TEAM */}
      {(data.staff || []).length > 0 && (
        <section id="team" style={{ padding: '100px 48px', background: C.bg2 }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>
              <div style={{ height: 2, width: 32, background: C.accent }} />
              <p style={{ fontSize: 11, letterSpacing: '0.15em', color: C.accent, textTransform: 'uppercase', fontWeight: 600 }}>Our Artisans</p>
            </div>
            <h2 style={{ fontFamily: 'Fraunces', fontSize: 52, fontWeight: 300, marginBottom: 56, color: C.dark, fontStyle: 'italic' }}>The Team</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 24 }}>
              {(data.staff || []).map((m, i) => (
                <div key={m.id || i} style={{ background: C.cream, padding: '40px 32px', border: `1px solid ${C.border}`, borderRadius: 4, borderTop: `3px solid ${C.accent}` }}>
                  <div style={{ width: 56, height: 56, background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, fontFamily: 'Fraunces', fontSize: 20, color: '#fff', fontStyle: 'italic', fontWeight: 300 , borderRadius: i % 3 === 0 ? '50%' : i % 3 === 1 ? '0px' : '10px', overflow: 'hidden' }}>
                    {m.avatar_url ? (
                      <img src={m.avatar_url} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : m.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}
                  </div>
                  <h3 style={{ fontFamily: 'Fraunces', fontSize: 22, fontWeight: 300, fontStyle: 'italic', marginBottom: 4, color: C.dark }}>{m.name}</h3>
                  {m.role && <p style={{ fontSize: 11, color: C.accent, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>{m.role}</p>}
                  {m.bio && <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.85 }}>{m.bio}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* REVIEWS */}
      {(data.reviews || []).length > 0 && (
        <section id="reviews" style={{ padding: '100px 48px', background: C.bg }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>
              <div style={{ height: 2, width: 32, background: C.accent }} />
              <p style={{ fontSize: 11, letterSpacing: '0.15em', color: C.accent, textTransform: 'uppercase', fontWeight: 600 }}>Client Words</p>
            </div>
            <h2 style={{ fontFamily: 'Fraunces', fontSize: 52, fontWeight: 300, marginBottom: 56, color: C.dark, fontStyle: 'italic' }}>Reviews</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
              {(data.reviews || []).slice(0, 3).map((r, i) => (
                <div key={i} style={{ background: C.cream, padding: '36px', border: `1px solid ${C.border}`, borderRadius: 4 }}>
                  <div style={{ display: 'flex', gap: 3, marginBottom: 20 }}>
                    {[1,2,3,4,5].map(s => <span key={s} style={{ color: s <= (r.rating || 5) ? C.accent : C.border, fontSize: 14 }}>★</span>)}
                  </div>
                  <p style={{ fontFamily: 'Fraunces', fontSize: 16, lineHeight: 1.85, color: C.dark, marginBottom: 24, fontStyle: 'italic', fontWeight: 300 }}>"{r.comment}"</p>
                  <p style={{ fontSize: 12, color: C.muted, fontWeight: 500 }}>— {r.customer_name}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CONTACT */}
      <section id="contact" style={{ padding: '100px 48px', background: C.cream }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>
              <div style={{ height: 2, width: 32, background: C.accent }} />
              <p style={{ fontSize: 11, letterSpacing: '0.15em', color: C.accent, textTransform: 'uppercase', fontWeight: 600 }}>Find Us</p>
            </div>
            <h2 style={{ fontFamily: 'Fraunces', fontSize: 44, fontWeight: 300, fontStyle: 'italic', marginBottom: 32, color: C.dark }}>{name}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 40 }}>
              {addr && <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.8 }}>{addr}</p>}
              {b.phone && <a href={`tel:${b.phone}`} style={{ fontFamily: 'Fraunces', fontSize: 22, color: C.accent, fontStyle: 'italic', fontWeight: 300, transition: 'opacity 0.2s' }} onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')} onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>{fmtPhone(b.phone)}</a>}
              {b.email && <a href={`mailto:${b.email}`} style={{ color: C.muted, fontSize: 13, transition: 'color 0.2s' }} onMouseEnter={e => (e.currentTarget.style.color = C.dark)} onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>{b.email}</a>}
            </div>
            <button onClick={() => setOpen(true)} style={{ background: C.accent, color: '#fff', border: 'none', padding: '15px 40px', fontSize: 14, fontWeight: 600, cursor: 'pointer', borderRadius: 2, transition: 'background 0.3s' }} onMouseEnter={e => (e.currentTarget.style.background = C.accentLight)} onMouseLeave={e => (e.currentTarget.style.background = C.accent)}>Book Your Visit</button>
          </div>
          <div>
            <p style={{ fontSize: 11, letterSpacing: '0.15em', color: C.accent, textTransform: 'uppercase', fontWeight: 600, marginBottom: 32 }}>Hours</p>
            {hours.map((h, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0', borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 14, color: h.is_closed ? C.border : C.dark, fontWeight: 400 }}>{h.label}</span>
                <span style={{ fontFamily: 'Fraunces', fontSize: 15, color: h.is_closed ? C.border : C.accent, fontStyle: 'italic', fontWeight: 300 }}>{h.hours}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer style={{ padding: '28px 48px', background: C.dark, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ fontFamily: 'Fraunces', fontSize: 18, color: C.accent, fontStyle: 'italic', fontWeight: 300 }}>{name}</p>
        <p style={{ color: 'rgba(255,249,243,0.3)', fontSize: 12 }}>© {new Date().getFullYear()}</p>
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
