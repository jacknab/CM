import { useState, useEffect } from 'react';
import { useSiteData, groupHours, fmtPhone, fmtPrice, SLUG } from './lib/data';

const C = { bg: '#070D1E', bg2: '#0D1528', gold: '#D4AF37', goldLight: '#F0CC60', dark: '#070D1E', text: '#E8E0F0', muted: '#6A6888', border: 'rgba(212,175,55,0.15)' };

function Star({ x, y, size = 1 }: { x: number; y: number; size?: number }) {
  return <div style={{ position: 'absolute', top: `${y}%`, left: `${x}%`, width: size * 2, height: size * 2, borderRadius: '50%', background: '#D4AF37', opacity: Math.random() * 0.6 + 0.2, pointerEvents: 'none' }} />;
}

function Panel({ open, onClose, slug }: { open: boolean; onClose: () => void; slug: string | null }) {
  const url = slug ? `https://certxa.com/book/${slug}` : null;
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9998, opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity 0.4s', backdropFilter: 'blur(12px)' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px,100vw)', background: C.bg2, zIndex: 9999, display: 'flex', flexDirection: 'column', transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.4s cubic-bezier(0.22,1,0.36,1)', borderLeft: `1px solid ${C.border}` }}>
        <div style={{ padding: '36px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontFamily: 'Cinzel', fontSize: 18, color: C.gold, letterSpacing: '0.1em' }}>Reserve</p>
          <button onClick={onClose} style={{ color: C.muted, fontSize: 18, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: url ? 'stretch' : 'center', justifyContent: url ? 'stretch' : 'center', padding: url ? 0 : 48, flexDirection: 'column' }}>
          {url ? <iframe src={url} style={{ width: '100%', height: '100%', border: 'none' }} title="Book" /> : (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontFamily: 'Cinzel', fontSize: 16, color: C.gold, marginBottom: 16, letterSpacing: '0.05em' }}>Contact us to reserve</p>
              <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.8 }}>An experience awaits among the stars.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

const STARS = Array.from({ length: 40 }, (_, i) => ({ id: i, x: Math.random() * 100, y: Math.random() * 100, size: Math.random() * 2 + 0.5 }));

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
    <div style={{ fontFamily: 'Cormorant Garamond, serif', background: C.bg, color: C.text, minHeight: '100vh' }}>
      {/* NAV */}
      <header style={{ position: 'sticky', top: 0, zIndex: 100, background: scrolled ? 'rgba(7,13,30,0.96)' : 'transparent', borderBottom: scrolled ? `1px solid ${C.border}` : '1px solid transparent', transition: 'all 0.4s', backdropFilter: scrolled ? 'blur(20px)' : 'none' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 80, padding: '0 48px' }}>
          <p style={{ fontFamily: 'Cinzel', fontSize: 14, letterSpacing: '0.25em', color: C.gold, textTransform: 'uppercase' }}>{name}</p>
          <nav style={{ display: 'flex', gap: 36, alignItems: 'center' }}>
            {['Services', 'Team', 'Reviews', 'Contact'].map(item => (
              <a key={item} href={`#${item.toLowerCase()}`} style={{ color: C.muted, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', fontFamily: 'Cinzel', transition: 'color 0.2s' }} onMouseEnter={e => (e.currentTarget.style.color = C.gold)} onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>{item}</a>
            ))}
            <button onClick={() => setOpen(true)} style={{ background: 'transparent', border: `1px solid ${C.gold}80`, color: C.gold, padding: '10px 28px', fontSize: 9, fontFamily: 'Cinzel', letterSpacing: '0.22em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.3s' }} onMouseEnter={e => { (e.currentTarget).style.background = C.gold + '15'; }} onMouseLeave={e => { (e.currentTarget).style.background = 'transparent'; }}>Reserve</button>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', overflow: 'hidden', padding: '0 48px' }}>
        {/* Stars */}
        {STARS.map(s => <Star key={s.id} x={s.x} y={s.y} size={s.size} />)}
        {/* Nebula glow */}
        <div style={{ position: 'absolute', top: '30%', left: '20%', width: 500, height: 500, background: 'rgba(212,175,55,0.05)', borderRadius: '50%', filter: 'blur(80px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '20%', right: '15%', width: 400, height: 400, background: 'rgba(100,80,200,0.05)', borderRadius: '50%', filter: 'blur(100px)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: 700 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, marginBottom: 40 }}>
            <div style={{ height: 1, width: 60, background: `linear-gradient(to right, transparent, ${C.gold}80)` }} />
            <span style={{ fontFamily: 'Cinzel', fontSize: 9, letterSpacing: '0.4em', color: C.gold, textTransform: 'uppercase' }}>Celestial Beauty</span>
            <div style={{ height: 1, width: 60, background: `linear-gradient(to left, transparent, ${C.gold}80)` }} />
          </div>
          <h1 style={{ fontFamily: 'Cinzel', fontSize: 'clamp(48px,6vw,88px)', fontWeight: 400, lineHeight: 1.1, marginBottom: 32, letterSpacing: '0.06em' }}>
            Beauty<br />Aligned with the<br /><span style={{ color: C.gold }}>Stars</span>
          </h1>
          <p style={{ color: C.muted, fontSize: 17, lineHeight: 1.9, marginBottom: 56, maxWidth: 520, margin: '0 auto 56px', fontStyle: 'italic' }}>
            Nail artistry as precise as celestial motion. Each set is a constellation, each visit a journey through luxury that transcends the ordinary.
          </p>
          <div style={{ display: 'flex', gap: 20, justifyContent: 'center' }}>
            <button onClick={() => setOpen(true)} style={{ background: C.gold, color: C.bg, border: 'none', padding: '16px 48px', fontSize: 11, fontFamily: 'Cinzel', letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer', transition: 'background 0.3s' }} onMouseEnter={e => (e.currentTarget.style.background = C.goldLight)} onMouseLeave={e => (e.currentTarget.style.background = C.gold)}>Reserve Now</button>
            <a href="#services" style={{ border: `1px solid ${C.gold}40`, color: C.gold, padding: '16px 36px', fontSize: 11, fontFamily: 'Cinzel', letterSpacing: '0.15em', textTransform: 'uppercase', display: 'inline-block', transition: 'all 0.3s' }} onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.gold; }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.gold + '40'; }}>Explore</a>
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" style={{ padding: '100px 48px', background: C.bg2 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>
            <div style={{ height: 1, width: 40, background: `linear-gradient(to right, transparent, ${C.gold})` }} />
            <p style={{ fontFamily: 'Cinzel', fontSize: 10, letterSpacing: '0.2em', color: C.gold, textTransform: 'uppercase' }}>Our Offerings</p>
          </div>
          <h2 style={{ fontFamily: 'Cinzel', fontSize: 48, fontWeight: 400, marginBottom: 60, letterSpacing: '0.05em' }}>Services</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 2 }}>
            {(data.services || []).map((svc, i) => (
              <div key={svc.id || i} style={{ background: C.bg, padding: '40px 36px', border: `1px solid ${C.border}`, transition: 'border-color 0.3s, background 0.3s' }} onMouseEnter={e => { (e.currentTarget).style.borderColor = C.gold + '40'; (e.currentTarget).style.background = '#0D1528'; }} onMouseLeave={e => { (e.currentTarget).style.borderColor = C.border; (e.currentTarget).style.background = C.bg; }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                  <p style={{ fontFamily: 'Cinzel', fontSize: 9, color: C.gold + '60', letterSpacing: '0.2em' }}>{String(i + 1).padStart(2, '0')}</p>
                  <p style={{ fontFamily: 'Cormorant Garamond', fontSize: 30, color: C.gold, fontStyle: 'italic', fontWeight: 300 }}>{fmtPrice(svc.price)}</p>
                </div>
                <h3 style={{ fontFamily: 'Cinzel', fontSize: 18, fontWeight: 400, marginBottom: 10, letterSpacing: '0.04em' }}>{svc.name}</h3>
                {svc.duration && <p style={{ color: C.muted, fontSize: 11, fontFamily: 'Cinzel', letterSpacing: '0.1em', marginBottom: 28 }}>{svc.duration} min</p>}
                <button onClick={() => setOpen(true)} style={{ background: 'transparent', border: `1px solid ${C.gold}30`, color: C.gold, padding: '9px 0', fontSize: 9, fontFamily: 'Cinzel', letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer', width: '100%', transition: 'all 0.2s' }} onMouseEnter={e => { (e.currentTarget).style.background = C.gold + '10'; (e.currentTarget).style.borderColor = C.gold; }} onMouseLeave={e => { (e.currentTarget).style.background = 'transparent'; (e.currentTarget).style.borderColor = C.gold + '30'; }}>Reserve →</button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TEAM */}
      {(data.staff || []).length > 0 && (
        <section id="team" style={{ padding: '100px 48px', background: C.bg }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>
              <div style={{ height: 1, width: 40, background: `linear-gradient(to right, transparent, ${C.gold})` }} />
              <p style={{ fontFamily: 'Cinzel', fontSize: 10, letterSpacing: '0.2em', color: C.gold, textTransform: 'uppercase' }}>Celestial Artists</p>
            </div>
            <h2 style={{ fontFamily: 'Cinzel', fontSize: 48, fontWeight: 400, marginBottom: 60 }}>Our Team</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
              {(data.staff || []).map((m, i) => (
                <div key={m.id || i} style={{ background: C.bg2, border: `1px solid ${C.border}`, padding: '40px 32px', transition: 'border-color 0.3s' }} onMouseEnter={e => (e.currentTarget.style.borderColor = C.gold + '40')} onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}>
                  <div style={{ width: 56, height: 56, border: `1px solid ${C.gold}60`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, fontFamily: 'Cinzel', fontSize: 18, color: C.gold , borderRadius: i % 3 === 0 ? '50%' : i % 3 === 1 ? '0px' : '10px', overflow: 'hidden' }}>
                    {m.avatar_url ? (
                      <img src={m.avatar_url} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : m.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}
                  </div>
                  <h3 style={{ fontFamily: 'Cinzel', fontSize: 18, fontWeight: 400, marginBottom: 4, letterSpacing: '0.04em' }}>{m.name}</h3>
                  {m.role && <p style={{ fontFamily: 'Cinzel', fontSize: 9, color: C.gold, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 16 }}>{m.role}</p>}
                  {m.bio && <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.85, fontStyle: 'italic' }}>{m.bio}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* REVIEWS */}
      {(data.reviews || []).length > 0 && (
        <section id="reviews" style={{ padding: '100px 48px', background: C.bg2 }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>
              <div style={{ height: 1, width: 40, background: `linear-gradient(to right, transparent, ${C.gold})` }} />
              <p style={{ fontFamily: 'Cinzel', fontSize: 10, letterSpacing: '0.2em', color: C.gold, textTransform: 'uppercase' }}>Testimonials</p>
            </div>
            <h2 style={{ fontFamily: 'Cinzel', fontSize: 48, fontWeight: 400, marginBottom: 60 }}>Client Words</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
              {(data.reviews || []).slice(0, 3).map((r, i) => (
                <div key={i} style={{ background: C.bg, padding: '36px', border: `1px solid ${C.border}` }}>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
                    {[1,2,3,4,5].map(s => <span key={s} style={{ color: s <= (r.rating || 5) ? C.gold : C.muted, fontSize: 12 }}>★</span>)}
                  </div>
                  <p style={{ fontFamily: 'Cormorant Garamond', fontSize: 17, lineHeight: 1.85, color: C.text, fontStyle: 'italic', marginBottom: 24 }}>"{r.comment}"</p>
                  <p style={{ fontFamily: 'Cinzel', fontSize: 9, color: C.gold, letterSpacing: '0.15em', textTransform: 'uppercase' }}>— {r.customer_name}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CONTACT */}
      <section id="contact" style={{ padding: '100px 48px', background: C.bg, borderTop: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>
              <div style={{ height: 1, width: 40, background: `linear-gradient(to right, transparent, ${C.gold})` }} />
              <p style={{ fontFamily: 'Cinzel', fontSize: 10, letterSpacing: '0.2em', color: C.gold, textTransform: 'uppercase' }}>Find Us</p>
            </div>
            <h2 style={{ fontFamily: 'Cinzel', fontSize: 40, fontWeight: 400, marginBottom: 32, letterSpacing: '0.04em' }}>{name}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 40 }}>
              {addr && <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.8, fontStyle: 'italic' }}>{addr}</p>}
              {b.phone && <a href={`tel:${b.phone}`} style={{ fontFamily: 'Cormorant Garamond', fontSize: 24, color: C.gold, fontStyle: 'italic', fontWeight: 300, transition: 'opacity 0.2s' }} onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')} onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>{fmtPhone(b.phone)}</a>}
              {b.email && <a href={`mailto:${b.email}`} style={{ color: C.muted, fontSize: 13, transition: 'color 0.2s' }} onMouseEnter={e => (e.currentTarget.style.color = C.text)} onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>{b.email}</a>}
            </div>
            <button onClick={() => setOpen(true)} style={{ background: C.gold, color: C.bg, border: 'none', padding: '14px 40px', fontSize: 10, fontFamily: 'Cinzel', letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer', transition: 'background 0.3s' }} onMouseEnter={e => (e.currentTarget.style.background = C.goldLight)} onMouseLeave={e => (e.currentTarget.style.background = C.gold)}>Reserve Your Time</button>
          </div>
          <div>
            <p style={{ fontFamily: 'Cinzel', fontSize: 10, letterSpacing: '0.2em', color: C.gold, textTransform: 'uppercase', marginBottom: 32 }}>Hours</p>
            {hours.map((h, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0', borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 14, color: h.is_closed ? C.muted + '40' : C.muted, fontStyle: 'italic' }}>{h.label}</span>
                <span style={{ fontFamily: 'Cormorant Garamond', fontSize: 15, color: h.is_closed ? C.muted + '30' : C.gold, fontStyle: 'italic' }}>{h.hours}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer style={{ padding: '28px 48px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: C.bg2 }}>
        <p style={{ fontFamily: 'Cinzel', fontSize: 12, color: C.gold, letterSpacing: '0.2em', textTransform: 'uppercase' }}>{name}</p>
        <p style={{ color: C.muted, fontSize: 11 }}>© {new Date().getFullYear()}</p>
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
