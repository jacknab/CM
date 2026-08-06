import { useState, useEffect } from 'react';
import { useSiteData, groupHours, fmtPhone, fmtPrice, SLUG } from './lib/data';

const C = { bg: '#FAFAFA', dark: '#111', muted: '#999', border: '#E8E8E8', accent: '#333', bg2: '#F5F5F3', cream: '#FFFFFF' };

function Panel({ open, onClose, slug }: { open: boolean; onClose: () => void; slug: string | null }) {
  const url = slug ? `https://certxa.com/book/${slug}` : null;
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 9998, opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity 0.4s', backdropFilter: 'blur(16px)' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px,100vw)', background: '#fff', zIndex: 9999, display: 'flex', flexDirection: 'column', transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.5s cubic-bezier(0.22,1,0.36,1)', borderLeft: `1px solid ${C.border}` }}>
        <div style={{ padding: '40px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontFamily: 'Libre Baskerville', fontSize: 20, color: C.dark }}>Book</p>
          <button onClick={onClose} style={{ color: C.muted, fontSize: 18, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 300 }}>×</button>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: url ? 'stretch' : 'center', justifyContent: url ? 'stretch' : 'center', padding: url ? 0 : 48, flexDirection: 'column' }}>
          {url ? <iframe src={url} style={{ width: '100%', height: '100%', border: 'none' }} title="Book" /> : (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontFamily: 'Libre Baskerville', fontSize: 18, color: C.dark, marginBottom: 12 }}>Contact us</p>
              <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.8 }}>We look forward to your visit.</p>
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
      <header style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(250,250,250,0.92)', borderBottom: `1px solid ${C.border}`, backdropFilter: 'blur(20px)', transition: 'all 0.3s' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64, padding: '0 48px' }}>
          <p style={{ fontFamily: 'Libre Baskerville', fontSize: 15, color: C.dark, fontStyle: 'italic' }}>{name}</p>
          <nav style={{ display: 'flex', gap: 32, alignItems: 'center' }}>
            {['Services', 'Team', 'Reviews', 'Contact'].map(item => (
              <a key={item} href={`#${item.toLowerCase()}`} style={{ color: C.muted, fontSize: 12, fontWeight: 400, transition: 'color 0.2s' }} onMouseEnter={e => (e.currentTarget.style.color = C.dark)} onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>{item}</a>
            ))}
            <button onClick={() => setOpen(true)} style={{ background: C.dark, color: '#fff', border: 'none', padding: '8px 22px', fontSize: 12, fontWeight: 400, cursor: 'pointer', fontFamily: 'Libre Baskerville', transition: 'background 0.2s' }} onMouseEnter={e => (e.currentTarget.style.background = C.accent)} onMouseLeave={e => (e.currentTarget.style.background = C.dark)}>Book</button>
          </nav>
        </div>
      </header>

      {/* HERO — Gallery-style, full height */}
      <section style={{ padding: '0', minHeight: '95vh', display: 'grid', gridTemplateColumns: '3fr 2fr', overflow: 'hidden' }}>
        <div style={{ position: 'relative', overflow: 'hidden', background: '#E8E4DF' }}>
          <img src="https://images.unsplash.com/photo-1610992015732-2449b76344bc?auto=format&fit=crop&w=1000&q=85" alt="Nail art" style={{ width: '100%', height: '100%', objectFit: 'cover', mixBlendMode: 'multiply', opacity: 0.85 }} />
          {/* Exhibition label */}
          <div style={{ position: 'absolute', bottom: 40, left: 40, background: '#fff', padding: '16px 24px', borderLeft: '2px solid #111' }}>
            <p style={{ fontFamily: 'Libre Baskerville', fontSize: 11, color: C.muted, marginBottom: 4, fontStyle: 'italic' }}>Collection 2025</p>
            <p style={{ fontFamily: 'Libre Baskerville', fontSize: 14, color: C.dark }}>Bespoke Nail Artistry</p>
          </div>
        </div>
        <div style={{ padding: '80px 56px', display: 'flex', flexDirection: 'column', justifyContent: 'center', background: '#fff', borderLeft: `1px solid ${C.border}` }}>
          <p style={{ fontSize: 10, letterSpacing: '0.25em', color: C.muted, textTransform: 'uppercase', fontWeight: 500, marginBottom: 32 }}>Nail Studio / Atelier</p>
          <h1 style={{ fontFamily: 'Libre Baskerville', fontSize: 'clamp(40px,4.5vw,64px)', fontWeight: 400, lineHeight: 1.2, marginBottom: 32, color: C.dark, letterSpacing: '-0.01em' }}>
            The quiet<br />art of<br /><em>beautiful nails</em>
          </h1>
          <p style={{ color: C.muted, fontSize: 15, lineHeight: 1.85, marginBottom: 48, fontWeight: 300 }}>
            An atelier where nothing competes for your attention. Just the craft, the silence, and the result — nails that hold their own in any room.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button onClick={() => setOpen(true)} style={{ background: C.dark, color: '#fff', border: 'none', padding: '14px 36px', fontSize: 13, fontFamily: 'Libre Baskerville', cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background 0.2s' }} onMouseEnter={e => (e.currentTarget.style.background = C.accent)} onMouseLeave={e => (e.currentTarget.style.background = C.dark)}>
              <span>Book Appointment</span><span>→</span>
            </button>
            <a href="#services" style={{ border: `1px solid ${C.border}`, color: C.muted, padding: '14px 36px', fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all 0.2s' }} onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.dark; (e.currentTarget as HTMLElement).style.color = C.dark; }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.color = C.muted; }}>
              <span>View Services</span><span>↓</span>
            </a>
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" style={{ padding: '80px 48px', background: C.bg2 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 48, paddingBottom: 24, borderBottom: `1px solid ${C.border}` }}>
            <div>
              <p style={{ fontSize: 10, letterSpacing: '0.2em', color: C.muted, textTransform: 'uppercase', marginBottom: 8 }}>Collection</p>
              <h2 style={{ fontFamily: 'Libre Baskerville', fontSize: 40, fontWeight: 400, color: C.dark }}>Services</h2>
            </div>
            <p style={{ color: C.muted, fontSize: 13, fontStyle: 'italic' }}>{(data.services || []).length} services offered</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 1, background: C.border }}>
            {(data.services || []).map((svc, i) => (
              <div key={svc.id || i} style={{ background: C.bg, padding: '36px 32px', cursor: 'pointer', transition: 'background 0.2s' }} onClick={() => setOpen(true)} onMouseEnter={e => (e.currentTarget.style.background = '#fff')} onMouseLeave={e => (e.currentTarget.style.background = C.bg)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                  <span style={{ fontFamily: 'Libre Baskerville', fontSize: 10, color: C.muted, fontStyle: 'italic' }}>{String(i + 1).padStart(2, '0')}</span>
                  <span style={{ fontFamily: 'Libre Baskerville', fontSize: 22, color: C.dark, fontStyle: 'italic' }}>{fmtPrice(svc.price)}</span>
                </div>
                <h3 style={{ fontFamily: 'Libre Baskerville', fontSize: 20, fontWeight: 400, color: C.dark, marginBottom: 8 }}>{svc.name}</h3>
                {svc.duration && <p style={{ fontSize: 12, color: C.muted, marginBottom: 24 }}>{svc.duration} min</p>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.muted, fontSize: 12 }}>
                  <div style={{ height: 1, flex: 1, background: C.border }} />
                  <span>Reserve →</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TEAM */}
      {(data.staff || []).length > 0 && (
        <section id="team" style={{ padding: '80px 48px', background: C.bg }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ paddingBottom: 24, borderBottom: `1px solid ${C.border}`, marginBottom: 48 }}>
              <p style={{ fontSize: 10, letterSpacing: '0.2em', color: C.muted, textTransform: 'uppercase', marginBottom: 8 }}>Artists</p>
              <h2 style={{ fontFamily: 'Libre Baskerville', fontSize: 40, fontWeight: 400 }}>The Team</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 32 }}>
              {(data.staff || []).map((m, i) => (
                <div key={m.id || i} style={{ borderTop: `2px solid ${C.dark}` }}>
                  <div style={{ paddingTop: 24 }}>
                    {m.avatar_url && <img src={m.avatar_url} alt={m.name} style={{ width: 64, height: 64, objectFit: 'cover', display: 'block', borderRadius: i % 3 === 0 ? '50%' : i % 3 === 1 ? '0px' : '10px', marginBottom: 20 }} />}
                    <p style={{ fontSize: 10, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>{String(i + 1).padStart(2, '0')}</p>
                    <h3 style={{ fontFamily: 'Libre Baskerville', fontSize: 22, fontWeight: 400, marginBottom: 4, color: C.dark }}>{m.name}</h3>
                    {m.role && <p style={{ fontSize: 11, color: C.muted, fontStyle: 'italic', marginBottom: 16 }}>{m.role}</p>}
                    {m.bio && <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.85 }}>{m.bio}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* REVIEWS */}
      {(data.reviews || []).length > 0 && (
        <section id="reviews" style={{ padding: '80px 48px', background: C.bg2 }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ paddingBottom: 24, borderBottom: `1px solid ${C.border}`, marginBottom: 48 }}>
              <p style={{ fontSize: 10, letterSpacing: '0.2em', color: C.muted, textTransform: 'uppercase', marginBottom: 8 }}>Reception</p>
              <h2 style={{ fontFamily: 'Libre Baskerville', fontSize: 40, fontWeight: 400 }}>Reviews</h2>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 32 }}>
              {(data.reviews || []).slice(0, 3).map((r, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', gap: 3, marginBottom: 20 }}>
                    {[1,2,3,4,5].map(s => <span key={s} style={{ color: s <= (r.rating || 5) ? '#333' : C.border, fontSize: 12 }}>★</span>)}
                  </div>
                  <p style={{ fontFamily: 'Libre Baskerville', fontSize: 15, lineHeight: 1.85, color: C.dark, marginBottom: 20, fontStyle: 'italic', fontWeight: 400 }}>"{r.comment}"</p>
                  <p style={{ fontSize: 11, color: C.muted }}>— {r.customer_name}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CONTACT */}
      <section id="contact" style={{ padding: '80px 48px', background: C.bg }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80 }}>
          <div>
            <div style={{ paddingBottom: 24, borderBottom: `1px solid ${C.border}`, marginBottom: 36 }}>
              <p style={{ fontSize: 10, letterSpacing: '0.2em', color: C.muted, textTransform: 'uppercase', marginBottom: 8 }}>Location</p>
              <h2 style={{ fontFamily: 'Libre Baskerville', fontSize: 36, fontWeight: 400 }}>{name}</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 36 }}>
              {addr && <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.8 }}>{addr}</p>}
              {b.phone && <a href={`tel:${b.phone}`} style={{ fontFamily: 'Libre Baskerville', fontSize: 22, color: C.dark, fontStyle: 'italic', transition: 'color 0.2s' }} onMouseEnter={e => (e.currentTarget.style.color = C.accent)} onMouseLeave={e => (e.currentTarget.style.color = C.dark)}>{fmtPhone(b.phone)}</a>}
              {b.email && <a href={`mailto:${b.email}`} style={{ color: C.muted, fontSize: 13, transition: 'color 0.2s' }} onMouseEnter={e => (e.currentTarget.style.color = C.dark)} onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>{b.email}</a>}
            </div>
            <button onClick={() => setOpen(true)} style={{ background: C.dark, color: '#fff', border: 'none', padding: '14px 40px', fontSize: 13, fontFamily: 'Libre Baskerville', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24, transition: 'background 0.2s', minWidth: 200 }} onMouseEnter={e => (e.currentTarget.style.background = C.accent)} onMouseLeave={e => (e.currentTarget.style.background = C.dark)}>
              <span>Book</span><span>→</span>
            </button>
          </div>
          <div>
            <div style={{ paddingBottom: 24, borderBottom: `1px solid ${C.border}`, marginBottom: 32 }}>
              <p style={{ fontSize: 10, letterSpacing: '0.2em', color: C.muted, textTransform: 'uppercase' }}>Hours</p>
            </div>
            {hours.map((h, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0', borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 13, color: h.is_closed ? C.border : C.dark }}>{h.label}</span>
                <span style={{ fontFamily: 'Libre Baskerville', fontSize: 13, color: h.is_closed ? C.border : C.muted, fontStyle: 'italic' }}>{h.hours}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer style={{ padding: '24px 48px', borderTop: `2px solid ${C.dark}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: C.bg2 }}>
        <p style={{ fontFamily: 'Libre Baskerville', fontSize: 14, color: C.dark, fontStyle: 'italic' }}>{name}</p>
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
