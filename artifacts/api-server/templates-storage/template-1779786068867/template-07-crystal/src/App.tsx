import { useState, useEffect } from 'react';
import { useSiteData, groupHours, fmtPhone, fmtPrice, SLUG } from './lib/data';

const prism = 'linear-gradient(135deg, #FFD6F0, #E8E0FF, #D0F4FF, #FFF0D6, #D6FFE8)';
const prism2 = 'linear-gradient(90deg, #FF9ED8, #C4A8FF, #80D8FF, #FFD080, #80FFB4)';
const C = { bg: '#FFFFFF', bg2: '#FAFAFA', text: '#111111', muted: '#888', border: '#EBEBEB', accent: '#8B5CF6' };

function Panel({ open, onClose, slug }: { open: boolean; onClose: () => void; slug: string | null }) {
  const url = slug ? `https://certxa.com/book/${slug}` : null;
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 9998, opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity 0.4s', backdropFilter: 'blur(12px)' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px,100vw)', background: '#fff', zIndex: 9999, display: 'flex', flexDirection: 'column', transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.4s cubic-bezier(0.22,1,0.36,1)', borderLeft: `3px solid transparent`, backgroundClip: 'padding-box' }}>
        <div style={{ height: 3, background: prism2, flexShrink: 0 }} />
        <div style={{ padding: '36px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontFamily: 'Montserrat', fontSize: 20, fontWeight: 700, color: C.text }}>Book Now</p>
          <button onClick={onClose} style={{ color: C.muted, fontSize: 18, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: url ? 'stretch' : 'center', justifyContent: url ? 'stretch' : 'center', padding: url ? 0 : 48, flexDirection: 'column' }}>
          {url ? <iframe src={url} style={{ width: '100%', height: '100%', border: 'none' }} title="Book" /> : (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontFamily: 'Montserrat', fontSize: 18, fontWeight: 600, color: C.text, marginBottom: 12 }}>Contact us to book</p>
              <p style={{ color: C.muted, fontSize: 14 }}>We'd love to see you.</p>
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
    <div style={{ fontFamily: 'Montserrat, sans-serif', background: C.bg, color: C.text, minHeight: '100vh' }}>
      <div style={{ height: 3, background: prism2 }} />

      {/* NAV */}
      <header style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(255,255,255,0.92)', borderBottom: `1px solid ${C.border}`, backdropFilter: 'blur(16px)', transition: 'all 0.3s' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 70, padding: '0 48px' }}>
          <p style={{ fontWeight: 800, fontSize: 18, letterSpacing: '-0.03em', background: prism2, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{name}</p>
          <nav style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
            {['Services', 'Team', 'Reviews', 'Contact'].map(item => (
              <a key={item} href={`#${item.toLowerCase()}`} style={{ color: C.muted, fontSize: 13, fontWeight: 600, transition: 'color 0.2s' }} onMouseEnter={e => (e.currentTarget.style.color = C.text)} onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>{item}</a>
            ))}
            <button onClick={() => setOpen(true)} style={{ background: prism2, color: '#fff', border: 'none', padding: '10px 28px', fontSize: 13, fontWeight: 700, cursor: 'pointer', borderRadius: 100, boxShadow: '0 4px 20px rgba(139,92,246,0.3)' }}>Book Now</button>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section style={{ minHeight: '95vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '80px 48px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -200, left: '50%', transform: 'translateX(-50%)', width: 900, height: 900, background: prism, borderRadius: '50%', filter: 'blur(80px)', opacity: 0.5, pointerEvents: 'none' }} />
        <div style={{ position: 'relative', maxWidth: 800 }}>
          <div style={{ display: 'inline-block', background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)', borderRadius: 100, padding: '7px 24px', marginBottom: 32 }}>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: C.accent }}>LUXURY NAIL STUDIO</p>
          </div>
          <h1 style={{ fontWeight: 800, fontSize: 'clamp(56px,8vw,104px)', lineHeight: 1.05, letterSpacing: '-0.04em', marginBottom: 24 }}>
            Nails that<br />
            <span style={{ background: prism2, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>refract light</span>
          </h1>
          <p style={{ color: C.muted, fontSize: 18, lineHeight: 1.7, marginBottom: 48, maxWidth: 560, margin: '0 auto 48px' }}>
            Where every set catches the light differently. Pure, precise, prismatic nail artistry for those who believe beauty should shimmer.
          </p>
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
            <button onClick={() => setOpen(true)} style={{ background: prism2, color: '#fff', border: 'none', padding: '16px 48px', fontSize: 15, fontWeight: 700, cursor: 'pointer', borderRadius: 100, boxShadow: '0 8px 40px rgba(139,92,246,0.4)', transition: 'transform 0.2s' }} onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.03)')} onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>Book Now</button>
            <a href="#services" style={{ border: `1.5px solid ${C.border}`, color: C.muted, padding: '16px 36px', fontSize: 15, fontWeight: 600, display: 'inline-block', borderRadius: 100, transition: 'all 0.3s' }} onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.accent; (e.currentTarget as HTMLElement).style.color = C.accent; }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.color = C.muted; }}>Our Services</a>
          </div>
        </div>
        <div style={{ position: 'relative', marginTop: 80, borderRadius: 24, overflow: 'hidden', width: '100%', maxWidth: 900, height: 400, boxShadow: '0 40px 120px rgba(0,0,0,0.1)' }}>
          <img src="https://images.unsplash.com/photo-1610992015732-2449b76344bc?auto=format&fit=crop&w=1200&q=85" alt="Nail art" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', inset: 0, background: prism, opacity: 0.2, mixBlendMode: 'screen' }} />
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" style={{ padding: '100px 48px', background: C.bg2 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ marginBottom: 56 }}>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: C.accent, textTransform: 'uppercase', marginBottom: 12 }}>What We Offer</p>
            <h2 style={{ fontWeight: 800, fontSize: 52, letterSpacing: '-0.03em' }}>Services</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
            {(data.services || []).map((svc, i) => {
              const colors = ['#FFD6F0', '#E8E0FF', '#D0F4FF', '#FFF0D6', '#D6FFE8', '#FFE0D0'];
              const bg = colors[i % colors.length];
              return (
                <div key={svc.id || i} style={{ background: bg, borderRadius: 20, padding: '32px', transition: 'transform 0.2s' }} onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-4px)')} onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(0,0,0,0.4)', letterSpacing: '0.1em' }}>{String(i + 1).padStart(2, '0')}</span>
                    <span style={{ fontWeight: 800, fontSize: 26, color: '#111', letterSpacing: '-0.02em' }}>{fmtPrice(svc.price)}</span>
                  </div>
                  <h3 style={{ fontWeight: 700, fontSize: 20, marginBottom: 8, color: '#111' }}>{svc.name}</h3>
                  {svc.duration && <p style={{ fontSize: 12, color: 'rgba(0,0,0,0.5)', fontWeight: 600, marginBottom: 24 }}>{svc.duration} minutes</p>}
                  <button onClick={() => setOpen(true)} style={{ background: 'rgba(0,0,0,0.08)', border: 'none', color: '#111', padding: '10px 24px', fontSize: 13, fontWeight: 700, cursor: 'pointer', borderRadius: 100, width: '100%', transition: 'background 0.2s' }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.15)')} onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.08)')}>Book</button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* TEAM */}
      {(data.staff || []).length > 0 && (
        <section id="team" style={{ padding: '100px 48px', background: C.bg }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ marginBottom: 56 }}>
              <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: C.accent, textTransform: 'uppercase', marginBottom: 12 }}>Our Artists</p>
              <h2 style={{ fontWeight: 800, fontSize: 52, letterSpacing: '-0.03em' }}>Meet the Team</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 24 }}>
              {(data.staff || []).map((m, i) => {
                const colors = ['#FFD6F0', '#E8E0FF', '#D0F4FF'];
                return (
                  <div key={m.id || i} style={{ background: colors[i % colors.length], borderRadius: 20, padding: '40px 32px', textAlign: 'center' }}>
                    <div style={{ width: 64, height: 64, background: 'rgba(0,0,0,0.1)', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20, color: '#111' , borderRadius: i % 3 === 0 ? '50%' : i % 3 === 1 ? '0px' : '10px', overflow: 'hidden' }}>
                      {m.avatar_url ? (
                      <img src={m.avatar_url} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : m.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}
                    </div>
                    <h3 style={{ fontWeight: 700, fontSize: 20, marginBottom: 4 }}>{m.name}</h3>
                    {m.role && <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(0,0,0,0.5)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>{m.role}</p>}
                    {m.bio && <p style={{ fontSize: 13, color: 'rgba(0,0,0,0.6)', lineHeight: 1.8 }}>{m.bio}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* REVIEWS */}
      {(data.reviews || []).length > 0 && (
        <section id="reviews" style={{ padding: '100px 48px', background: C.bg2 }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ marginBottom: 56 }}>
              <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: C.accent, textTransform: 'uppercase', marginBottom: 12 }}>Happy Clients</p>
              <h2 style={{ fontWeight: 800, fontSize: 52, letterSpacing: '-0.03em' }}>Reviews</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
              {(data.reviews || []).slice(0, 3).map((r, i) => (
                <div key={i} style={{ background: '#fff', borderRadius: 16, padding: '32px', boxShadow: '0 4px 24px rgba(0,0,0,0.06)', borderTop: `3px solid transparent`, backgroundImage: `linear-gradient(white, white), ${prism2}`, backgroundOrigin: 'border-box', backgroundClip: 'padding-box, border-box' }}>
                  <div style={{ display: 'flex', gap: 3, marginBottom: 20 }}>
                    {[1,2,3,4,5].map(s => <span key={s} style={{ fontSize: 14, color: s <= (r.rating || 5) ? '#F59E0B' : C.border }}>★</span>)}
                  </div>
                  <p style={{ fontSize: 15, lineHeight: 1.8, color: C.text, marginBottom: 20, fontWeight: 500 }}>"{r.comment}"</p>
                  <p style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>— {r.customer_name}</p>
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
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: C.accent, textTransform: 'uppercase', marginBottom: 16 }}>Find Us</p>
            <h2 style={{ fontWeight: 800, fontSize: 48, letterSpacing: '-0.03em', marginBottom: 32 }}>{name}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 40 }}>
              {addr && <p style={{ color: C.muted, fontSize: 15 }}>{addr}</p>}
              {b.phone && <a href={`tel:${b.phone}`} style={{ fontSize: 24, fontWeight: 800, background: prism2, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', letterSpacing: '-0.02em' }}>{fmtPhone(b.phone)}</a>}
              {b.email && <a href={`mailto:${b.email}`} style={{ color: C.muted, fontSize: 14, transition: 'color 0.2s' }} onMouseEnter={e => (e.currentTarget.style.color = C.text)} onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>{b.email}</a>}
            </div>
            <button onClick={() => setOpen(true)} style={{ background: prism2, color: '#fff', border: 'none', padding: '15px 48px', fontSize: 15, fontWeight: 700, cursor: 'pointer', borderRadius: 100 }}>Book Your Visit</button>
          </div>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: C.accent, textTransform: 'uppercase', marginBottom: 32 }}>Hours</p>
            {hours.map((h, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0', borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 14, color: h.is_closed ? C.border : C.text, fontWeight: 600 }}>{h.label}</span>
                <span style={{ fontSize: 14, color: h.is_closed ? C.border : C.accent, fontWeight: 700 }}>{h.hours}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div style={{ height: 3, background: prism2 }} />
      <footer style={{ padding: '28px 48px', background: C.bg2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ fontWeight: 800, fontSize: 16, background: prism2, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', letterSpacing: '-0.02em' }}>{name}</p>
        <p style={{ color: C.muted, fontSize: 12 }}>© {new Date().getFullYear()}</p>
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
