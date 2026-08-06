import { useState, useEffect } from 'react';
import { useSiteData, groupHours, fmtPhone, fmtPrice, SLUG } from './lib/data';

const C = { bg: '#FAFAF8', bg2: '#F3F0EC', accent: '#C4818B', accentLight: '#E8B4BC', dark: '#2A2020', muted: '#9A8E8E', border: '#E8E0DE' };

function BookingPanel({ open, onClose, slug }: { open: boolean; onClose: () => void; slug: string | null }) {
  const url = slug ? `https://certxa.com/book/${slug}` : null;
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(42,32,32,0.4)', zIndex: 9998, opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity 0.4s', backdropFilter: 'blur(6px)' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px,100vw)', background: C.bg, zIndex: 9999, display: 'flex', flexDirection: 'column', transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.4s cubic-bezier(0.22,1,0.36,1)', borderLeft: `1px solid ${C.border}` }}>
        <div style={{ padding: '40px 36px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontFamily: 'Noto Serif JP', fontSize: 22, color: C.dark, fontWeight: 300 }}>ご予約</p>
          <button onClick={onClose} style={{ color: C.muted, fontSize: 16, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: url ? 'stretch' : 'center', justifyContent: url ? 'stretch' : 'center', padding: url ? 0 : 48 }}>
          {url ? <iframe src={url} style={{ width: '100%', height: '100%', border: 'none' }} title="Book" /> : (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontFamily: 'Noto Serif JP', fontSize: 16, color: C.dark, marginBottom: 16, fontWeight: 300 }}>お問い合わせください</p>
              <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.8 }}>Please contact us to schedule your appointment.</p>
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
    <div style={{ fontFamily: 'Noto Serif JP, serif', background: C.bg, color: C.dark, minHeight: '100vh' }}>
      {/* NAV */}
      <header style={{ position: 'sticky', top: 0, zIndex: 100, background: scrolled ? 'rgba(250,250,248,0.95)' : C.bg, borderBottom: `1px solid ${C.border}`, transition: 'all 0.4s', backdropFilter: scrolled ? 'blur(12px)' : 'none' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 72, padding: '0 48px' }}>
          <p style={{ fontFamily: 'Noto Serif JP', fontSize: 16, fontWeight: 300, letterSpacing: '0.12em', color: C.dark }}>{name}</p>
          <nav style={{ display: 'flex', gap: 36, alignItems: 'center' }}>
            {['Services', 'Team', 'Reviews', 'Contact'].map(item => (
              <a key={item} href={`#${item.toLowerCase()}`} style={{ color: C.muted, fontSize: 12, letterSpacing: '0.05em', transition: 'color 0.2s', fontWeight: 400 }} onMouseEnter={e => (e.currentTarget.style.color = C.accent)} onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>{item}</a>
            ))}
            <button onClick={() => setOpen(true)} style={{ background: C.accent, color: '#fff', border: 'none', padding: '10px 28px', fontSize: 12, fontFamily: 'Noto Serif JP', letterSpacing: '0.05em', transition: 'background 0.3s', cursor: 'pointer' }} onMouseEnter={e => (e.currentTarget.style.background = C.accentLight)} onMouseLeave={e => (e.currentTarget.style.background = C.accent)}>予約する</button>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section style={{ position: 'relative', minHeight: '95vh', display: 'grid', gridTemplateColumns: '1fr 1fr', overflow: 'hidden' }}>
        <div style={{ padding: '80px 60px 80px 80px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <p style={{ fontSize: 11, letterSpacing: '0.3em', color: C.accent, textTransform: 'uppercase', marginBottom: 32, fontFamily: 'Noto Serif JP', fontWeight: 300 }}>爪の芸術</p>
          <h1 style={{ fontFamily: 'Noto Serif JP', fontSize: 'clamp(44px,5vw,72px)', fontWeight: 300, lineHeight: 1.3, marginBottom: 32, letterSpacing: '0.04em' }}>
            静寂の中に<br />宿る美しさ
          </h1>
          <p style={{ fontSize: 13, color: C.muted, lineHeight: 2, marginBottom: 48, maxWidth: 400, fontWeight: 300 }}>
            Beauty found in stillness. Where each nail becomes a canvas, and each visit becomes a moment of pure, quiet luxury.
          </p>
          <div style={{ display: 'flex', gap: 16 }}>
            <button onClick={() => setOpen(true)} style={{ background: C.dark, color: C.bg, border: 'none', padding: '16px 40px', fontSize: 12, fontFamily: 'Noto Serif JP', letterSpacing: '0.1em', cursor: 'pointer', transition: 'background 0.3s' }} onMouseEnter={e => (e.currentTarget.style.background = C.accent)} onMouseLeave={e => (e.currentTarget.style.background = C.dark)}>Book Now</button>
            <a href="#services" style={{ border: `1px solid ${C.border}`, color: C.muted, padding: '16px 32px', fontSize: 12, letterSpacing: '0.05em', transition: 'all 0.3s', display: 'inline-block' }} onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.accent; (e.currentTarget as HTMLElement).style.color = C.accent; }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.color = C.muted; }}>Services</a>
          </div>
        </div>
        <div style={{ position: 'relative', overflow: 'hidden' }}>
          <img src="https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=900&q=85" alt="Nail art" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to left, transparent 70%, rgba(250,250,248,0.8))' }} />
          <div style={{ position: 'absolute', bottom: 48, left: 40, background: C.bg, padding: '20px 28px', borderLeft: `2px solid ${C.accent}` }}>
            <p style={{ fontFamily: 'Noto Serif JP', fontSize: 11, color: C.muted, fontWeight: 300 }}>All services by appointment</p>
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" style={{ padding: '100px 80px', background: C.bg2 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <p style={{ fontSize: 10, letterSpacing: '0.25em', color: C.accent, textTransform: 'uppercase', marginBottom: 16, fontFamily: 'Noto Serif JP', fontWeight: 300 }}>Services</p>
          <h2 style={{ fontFamily: 'Noto Serif JP', fontSize: 40, fontWeight: 300, marginBottom: 60, letterSpacing: '0.05em' }}>サービス</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 1, background: C.border }}>
            {(data.services || []).map((svc, i) => (
              <div key={svc.id || i} style={{ background: C.bg, padding: '40px 32px', transition: 'background 0.3s' }} onMouseEnter={e => (e.currentTarget.style.background = '#FFFDFB')} onMouseLeave={e => (e.currentTarget.style.background = C.bg)}>
                <p style={{ fontFamily: 'Noto Serif JP', fontSize: 9, letterSpacing: '0.2em', color: C.muted, textTransform: 'uppercase', marginBottom: 20, fontWeight: 300 }}>{String(i + 1).padStart(2, '0')}</p>
                <h3 style={{ fontFamily: 'Noto Serif JP', fontSize: 20, fontWeight: 300, marginBottom: 12, letterSpacing: '0.04em' }}>{svc.name}</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 }}>
                  <span style={{ fontSize: 22, color: C.accent, fontWeight: 300 }}>{fmtPrice(svc.price)}</span>
                  {svc.duration && <span style={{ fontSize: 11, color: C.muted }}>{svc.duration} min</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TEAM */}
      {(data.staff || []).length > 0 && (
        <section id="team" style={{ padding: '100px 80px', background: C.bg }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <p style={{ fontSize: 10, letterSpacing: '0.25em', color: C.accent, textTransform: 'uppercase', marginBottom: 16, fontFamily: 'Noto Serif JP', fontWeight: 300 }}>Artisans</p>
            <h2 style={{ fontFamily: 'Noto Serif JP', fontSize: 40, fontWeight: 300, marginBottom: 60, letterSpacing: '0.05em' }}>職人たち</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 32 }}>
              {(data.staff || []).map((m, i) => (
                <div key={m.id || i} style={{ padding: '40px', border: `1px solid ${C.border}`, transition: 'border-color 0.3s' }} onMouseEnter={e => (e.currentTarget.style.borderColor = C.accent + '80')} onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}>
                  <div style={{ width: 48, height: 48, background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, color: '#fff', fontFamily: 'Noto Serif JP', fontSize: 16, fontWeight: 300 , borderRadius: i % 3 === 0 ? '50%' : i % 3 === 1 ? '0px' : '10px', overflow: 'hidden' }}>
                    {m.avatar_url ? (
                      <img src={m.avatar_url} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : m.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}
                  </div>
                  <h3 style={{ fontFamily: 'Noto Serif JP', fontSize: 20, fontWeight: 300, marginBottom: 6 }}>{m.name}</h3>
                  {m.role && <p style={{ fontSize: 11, color: C.accent, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16, fontWeight: 300 }}>{m.role}</p>}
                  {m.bio && <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.9, fontWeight: 300 }}>{m.bio}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* REVIEWS */}
      {(data.reviews || []).length > 0 && (
        <section id="reviews" style={{ padding: '100px 80px', background: C.bg2 }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <p style={{ fontSize: 10, letterSpacing: '0.25em', color: C.accent, textTransform: 'uppercase', marginBottom: 16, fontFamily: 'Noto Serif JP', fontWeight: 300 }}>Reviews</p>
            <h2 style={{ fontFamily: 'Noto Serif JP', fontSize: 40, fontWeight: 300, marginBottom: 60, letterSpacing: '0.05em' }}>お客様の声</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 32 }}>
              {(data.reviews || []).slice(0, 3).map((r, i) => (
                <div key={i} style={{ padding: '40px', background: C.bg, borderTop: `2px solid ${C.accent}` }}>
                  <div style={{ display: 'flex', gap: 3, marginBottom: 24 }}>
                    {[1,2,3,4,5].map(s => <span key={s} style={{ color: s <= (r.rating || 5) ? C.accent : C.border, fontSize: 12 }}>★</span>)}
                  </div>
                  <p style={{ fontSize: 15, lineHeight: 1.9, color: C.dark, marginBottom: 28, fontWeight: 300, fontStyle: 'italic' }}>"{r.comment}"</p>
                  <p style={{ fontSize: 11, color: C.muted, letterSpacing: '0.1em' }}>— {r.customer_name}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CONTACT */}
      <section id="contact" style={{ padding: '100px 80px', background: C.bg }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80 }}>
          <div>
            <p style={{ fontSize: 10, letterSpacing: '0.25em', color: C.accent, textTransform: 'uppercase', marginBottom: 16, fontFamily: 'Noto Serif JP', fontWeight: 300 }}>Visit Us</p>
            <h2 style={{ fontFamily: 'Noto Serif JP', fontSize: 40, fontWeight: 300, marginBottom: 40, letterSpacing: '0.04em' }}>{name}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 40 }}>
              {addr && <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.8, fontWeight: 300 }}>{addr}</p>}
              {b.phone && <a href={`tel:${b.phone}`} style={{ color: C.accent, fontSize: 18, fontWeight: 300, transition: 'opacity 0.2s' }} onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')} onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>{fmtPhone(b.phone)}</a>}
              {b.email && <a href={`mailto:${b.email}`} style={{ color: C.muted, fontSize: 13, transition: 'color 0.2s' }} onMouseEnter={e => (e.currentTarget.style.color = C.dark)} onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>{b.email}</a>}
            </div>
            <button onClick={() => setOpen(true)} style={{ background: C.accent, color: '#fff', border: 'none', padding: '14px 40px', fontSize: 12, fontFamily: 'Noto Serif JP', letterSpacing: '0.05em', cursor: 'pointer' }}>Book Appointment</button>
          </div>
          <div>
            <p style={{ fontSize: 10, letterSpacing: '0.25em', color: C.accent, textTransform: 'uppercase', marginBottom: 32, fontFamily: 'Noto Serif JP', fontWeight: 300 }}>Hours / 営業時間</p>
            <div>
              {hours.map((h, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0', borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ fontSize: 13, color: h.is_closed ? C.border : C.muted, fontWeight: 300 }}>{h.label}</span>
                  <span style={{ fontSize: 13, color: h.is_closed ? C.border : C.dark, fontWeight: 300 }}>{h.hours}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <footer style={{ padding: '24px 80px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ fontFamily: 'Noto Serif JP', fontSize: 12, color: C.muted, fontWeight: 300 }}>{name}</p>
        <p style={{ color: C.border, fontSize: 11 }}>© {new Date().getFullYear()}</p>
      </footer>

        <div style={{ textAlign: 'center', padding: '8px 24px 12px', borderTop: '1px solid rgba(128,128,128,0.1)' }}>
          <p style={{ fontSize: 11, color: 'rgba(128,128,128,0.38)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, margin: 0 }}>
            Powered by <img src="/certxa-logo.png" alt="Certxa" style={{ height: 13, objectFit: 'contain', opacity: 0.45 }} />
          </p>
        </div>

      <BookingPanel open={open} onClose={() => setOpen(false)} slug={slug} />
    </div>
  );
}
