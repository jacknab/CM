import { useState, useEffect } from 'react';
import { useSiteData, groupHours, fmtPhone, fmtPrice, SLUG } from './lib/data';

const C = { bg: '#08080F', bg2: '#0E0E1A', pink: '#FF006E', purple: '#B400FF', text: '#F0EEFF', muted: '#6A6880', border: 'rgba(255,0,110,0.15)', glow: 'rgba(255,0,110,0.3)' };

function Panel({ open, onClose, slug }: { open: boolean; onClose: () => void; slug: string | null }) {
  const url = slug ? `https://certxa.com/book/${slug}` : null;
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 9998, opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity 0.3s', backdropFilter: 'blur(12px)' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px,100vw)', background: C.bg2, zIndex: 9999, display: 'flex', flexDirection: 'column', transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.4s cubic-bezier(0.22,1,0.36,1)', borderLeft: `1px solid ${C.border}`, boxShadow: `-8px 0 48px ${C.glow}` }}>
        <div style={{ padding: '36px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontFamily: 'DM Serif Display', fontSize: 24, color: C.pink }}>Book Now</p>
          <button onClick={onClose} style={{ color: C.muted, fontSize: 18, background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: url ? 'stretch' : 'center', justifyContent: url ? 'stretch' : 'center', padding: url ? 0 : 48, flexDirection: 'column' }}>
          {url ? <iframe src={url} style={{ width: '100%', height: '100%', border: 'none' }} title="Book" /> : (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontFamily: 'DM Serif Display', fontSize: 22, color: C.pink, marginBottom: 16 }}>Reach out to book</p>
              <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.8 }}>Call or drop us a message.</p>
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
    <div style={{ fontFamily: 'Inter, sans-serif', background: C.bg, color: C.text, minHeight: '100vh' }}>
      {/* Top glow line */}
      <div style={{ height: 2, background: `linear-gradient(90deg, ${C.purple}, ${C.pink}, ${C.purple})` }} />

      {/* NAV */}
      <header style={{ position: 'sticky', top: 0, zIndex: 100, background: scrolled ? 'rgba(8,8,15,0.95)' : 'transparent', borderBottom: scrolled ? `1px solid ${C.border}` : '1px solid transparent', transition: 'all 0.4s', backdropFilter: scrolled ? 'blur(20px)' : 'none' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 76, padding: '0 48px' }}>
          <p style={{ fontFamily: 'DM Serif Display', fontSize: 22, background: `linear-gradient(135deg, ${C.pink}, ${C.purple})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{name}</p>
          <nav style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
            {['Services', 'Team', 'Reviews', 'Contact'].map(item => (
              <a key={item} href={`#${item.toLowerCase()}`} style={{ color: C.muted, fontSize: 13, fontWeight: 500, transition: 'color 0.2s' }} onMouseEnter={e => (e.currentTarget.style.color = C.pink)} onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>{item}</a>
            ))}
            <button onClick={() => setOpen(true)} style={{ background: `linear-gradient(135deg, ${C.pink}, ${C.purple})`, color: '#fff', border: 'none', padding: '10px 28px', fontSize: 13, fontWeight: 700, cursor: 'pointer', borderRadius: 4, boxShadow: `0 4px 24px ${C.glow}`, transition: 'box-shadow 0.3s' }} onMouseEnter={e => (e.currentTarget.style.boxShadow = `0 6px 32px ${C.glow}`)} onMouseLeave={e => (e.currentTarget.style.boxShadow = `0 4px 24px ${C.glow}`)}>Book Now</button>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', overflow: 'hidden', padding: '0 48px' }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <img src="https://images.unsplash.com/photo-1610992015732-2449b76344bc?auto=format&fit=crop&w=1800&q=80" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.15) saturate(1.5)', mixBlendMode: 'luminosity' }} />
          {/* Neon glow overlays */}
          <div style={{ position: 'absolute', top: '20%', right: '20%', width: 400, height: 400, background: C.pink, borderRadius: '50%', filter: 'blur(120px)', opacity: 0.08, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: '20%', right: '15%', width: 300, height: 300, background: C.purple, borderRadius: '50%', filter: 'blur(100px)', opacity: 0.08, pointerEvents: 'none' }} />
        </div>
        <div style={{ position: 'relative', maxWidth: 700 }}>
          <div style={{ display: 'inline-block', background: `${C.pink}15`, border: `1px solid ${C.pink}40`, color: C.pink, fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', padding: '6px 20px', borderRadius: 2, marginBottom: 32 }}>
            Premium Nail Artistry
          </div>
          <h1 style={{ fontFamily: 'DM Serif Display', fontSize: 'clamp(60px,8vw,112px)', fontWeight: 400, lineHeight: 1.0, marginBottom: 32, letterSpacing: '-0.02em' }}>
            Bold.<br />
            <span style={{ background: `linear-gradient(135deg, ${C.pink}, ${C.purple})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Fearless.</span><br />
            Nails.
          </h1>
          <p style={{ color: C.muted, fontSize: 17, lineHeight: 1.8, marginBottom: 48, maxWidth: 500 }}>
            Edge-forward nail art for those who refuse to blend in. Every set is a statement. Every visit, an experience.
          </p>
          <div style={{ display: 'flex', gap: 16 }}>
            <button onClick={() => setOpen(true)} style={{ background: `linear-gradient(135deg, ${C.pink}, ${C.purple})`, color: '#fff', border: 'none', padding: '16px 48px', fontSize: 15, fontWeight: 700, cursor: 'pointer', borderRadius: 4, boxShadow: `0 8px 40px ${C.glow}`, transition: 'transform 0.2s' }} onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')} onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}>Book Now</button>
            <a href="#services" style={{ border: `1px solid ${C.border}`, color: C.text, padding: '16px 36px', fontSize: 15, fontWeight: 500, display: 'inline-block', borderRadius: 4, transition: 'all 0.3s' }} onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.pink; (e.currentTarget as HTMLElement).style.color = C.pink; }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.color = C.text; }}>Our Work →</a>
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" style={{ padding: '100px 48px', background: C.bg2 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <p style={{ fontSize: 11, color: C.pink, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 16 }}>What We Do</p>
          <h2 style={{ fontFamily: 'DM Serif Display', fontSize: 52, marginBottom: 60, background: `linear-gradient(135deg, ${C.text}, ${C.muted})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Services</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {(data.services || []).map((svc, i) => (
              <div key={svc.id || i} style={{ background: C.bg, border: `1px solid ${C.border}`, padding: '32px', borderRadius: 8, transition: 'border-color 0.3s, box-shadow 0.3s' }} onMouseEnter={e => { (e.currentTarget).style.borderColor = C.pink + '60'; (e.currentTarget).style.boxShadow = `0 0 32px ${C.glow}`; }} onMouseLeave={e => { (e.currentTarget).style.borderColor = C.border; (e.currentTarget).style.boxShadow = 'none'; }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div style={{ width: 36, height: 36, background: `linear-gradient(135deg, ${C.pink}20, ${C.purple}20)`, border: `1px solid ${C.pink}30`, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: C.pink }}>
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <span style={{ fontFamily: 'DM Serif Display', fontSize: 28, background: `linear-gradient(135deg, ${C.pink}, ${C.purple})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{fmtPrice(svc.price)}</span>
                </div>
                <h3 style={{ fontFamily: 'DM Serif Display', fontSize: 22, color: C.text, marginBottom: 8 }}>{svc.name}</h3>
                {svc.duration && <p style={{ color: C.muted, fontSize: 12, fontWeight: 500, marginBottom: 24 }}>{svc.duration} min</p>}
                <button onClick={() => setOpen(true)} style={{ background: `linear-gradient(135deg, ${C.pink}15, ${C.purple}15)`, border: `1px solid ${C.pink}30`, color: C.pink, padding: '9px 0', fontSize: 12, fontWeight: 700, cursor: 'pointer', borderRadius: 4, width: '100%', transition: 'all 0.2s' }} onMouseEnter={e => { (e.currentTarget).style.background = `linear-gradient(135deg, ${C.pink}, ${C.purple})`; (e.currentTarget).style.color = '#fff'; }} onMouseLeave={e => { (e.currentTarget).style.background = `linear-gradient(135deg, ${C.pink}15, ${C.purple}15)`; (e.currentTarget).style.color = C.pink; }}>Book This</button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TEAM */}
      {(data.staff || []).length > 0 && (
        <section id="team" style={{ padding: '100px 48px', background: C.bg }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <p style={{ fontSize: 11, color: C.pink, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 16 }}>The Crew</p>
            <h2 style={{ fontFamily: 'DM Serif Display', fontSize: 52, marginBottom: 60, color: C.text }}>Our Artists</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {(data.staff || []).map((m, i) => (
                <div key={m.id || i} style={{ background: C.bg2, border: `1px solid ${C.border}`, padding: '40px 32px', borderRadius: 8, transition: 'border-color 0.3s' }} onMouseEnter={e => (e.currentTarget.style.borderColor = C.purple + '50')} onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}>
                  <div style={{ width: 56, height: 56, background: `linear-gradient(135deg, ${C.pink}, ${C.purple})`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, fontFamily: 'DM Serif Display', fontSize: 20, color: '#fff' , borderRadius: i % 3 === 0 ? '50%' : i % 3 === 1 ? '0px' : '10px', overflow: 'hidden' }}>
                    {m.avatar_url ? (
                      <img src={m.avatar_url} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    ) : m.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}
                  </div>
                  <h3 style={{ fontFamily: 'DM Serif Display', fontSize: 22, color: C.text, marginBottom: 4 }}>{m.name}</h3>
                  {m.role && <p style={{ fontSize: 11, color: C.pink, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>{m.role}</p>}
                  {m.bio && <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.8 }}>{m.bio}</p>}
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
            <p style={{ fontSize: 11, color: C.pink, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 16 }}>Reviews</p>
            <h2 style={{ fontFamily: 'DM Serif Display', fontSize: 52, marginBottom: 60, color: C.text }}>Client Love</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
              {(data.reviews || []).slice(0, 3).map((r, i) => (
                <div key={i} style={{ background: C.bg, border: `1px solid ${C.border}`, padding: '36px', borderRadius: 8, borderTop: `2px solid ${C.pink}` }}>
                  <div style={{ display: 'flex', gap: 3, marginBottom: 20 }}>
                    {[1,2,3,4,5].map(s => <span key={s} style={{ color: s <= (r.rating || 5) ? C.pink : C.muted, fontSize: 13 }}>★</span>)}
                  </div>
                  <p style={{ fontFamily: 'DM Serif Display', fontSize: 16, lineHeight: 1.8, color: C.text, marginBottom: 24, fontStyle: 'italic' }}>"{r.comment}"</p>
                  <p style={{ fontSize: 12, color: C.pink, fontWeight: 700 }}>— {r.customer_name}</p>
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
            <p style={{ fontSize: 11, color: C.pink, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 16 }}>Location</p>
            <h2 style={{ fontFamily: 'DM Serif Display', fontSize: 44, marginBottom: 32, color: C.text }}>{name}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 40 }}>
              {addr && <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.8 }}>{addr}</p>}
              {b.phone && <a href={`tel:${b.phone}`} style={{ color: C.pink, fontSize: 22, fontFamily: 'DM Serif Display', transition: 'opacity 0.2s' }} onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')} onMouseLeave={e => (e.currentTarget.style.opacity = '1')}>{fmtPhone(b.phone)}</a>}
              {b.email && <a href={`mailto:${b.email}`} style={{ color: C.muted, fontSize: 13, transition: 'color 0.2s' }} onMouseEnter={e => (e.currentTarget.style.color = C.text)} onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>{b.email}</a>}
            </div>
            <button onClick={() => setOpen(true)} style={{ background: `linear-gradient(135deg, ${C.pink}, ${C.purple})`, color: '#fff', border: 'none', padding: '15px 48px', fontSize: 15, fontWeight: 700, cursor: 'pointer', borderRadius: 4, boxShadow: `0 8px 40px ${C.glow}` }}>Book Now</button>
          </div>
          <div>
            <p style={{ fontSize: 11, color: C.pink, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 32 }}>Hours</p>
            {hours.map((h, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0', borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 14, color: h.is_closed ? C.muted + '50' : C.muted }}>{h.label}</span>
                <span style={{ fontSize: 14, color: h.is_closed ? C.muted + '40' : C.pink, fontWeight: 600 }}>{h.hours}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div style={{ height: 2, background: `linear-gradient(90deg, ${C.purple}, ${C.pink}, ${C.purple})` }} />
      <footer style={{ padding: '28px 48px', background: C.bg2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ fontFamily: 'DM Serif Display', fontSize: 18, background: `linear-gradient(135deg, ${C.pink}, ${C.purple})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{name}</p>
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
