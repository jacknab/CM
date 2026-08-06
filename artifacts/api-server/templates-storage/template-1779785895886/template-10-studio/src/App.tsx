import { useState, useEffect } from 'react';
import { useSiteData, groupHours, fmtPhone, fmtPrice, SLUG } from './lib/data';

const C = { bg: '#FFFFFF', dark: '#000000', muted: '#777', border: '#E8E8E8', bg2: '#F5F5F5' };

function Panel({ open, onClose, slug }: { open: boolean; onClose: () => void; slug: string | null }) {
  const url = slug ? `https://certxa.com/book/${slug}` : null;
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9998, opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity 0.3s' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px,100vw)', background: '#fff', zIndex: 9999, display: 'flex', flexDirection: 'column', transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.4s cubic-bezier(0.22,1,0.36,1)', borderLeft: '2px solid #000' }}>
        <div style={{ padding: '40px', borderBottom: '1px solid #E8E8E8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontFamily: 'Big Shoulders Display', fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em' }}>BOOK</p>
          <button onClick={onClose} style={{ fontSize: 20, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>×</button>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: url ? 'stretch' : 'center', justifyContent: url ? 'stretch' : 'center', padding: url ? 0 : 48, flexDirection: 'column' }}>
          {url ? <iframe src={url} style={{ width: '100%', height: '100%', border: 'none' }} title="Book" /> : (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontFamily: 'Big Shoulders Display', fontSize: 26, fontWeight: 800 }}>CALL OR EMAIL US</p>
              <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.8, marginTop: 12 }}>Contact us directly to reserve your spot.</p>
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
      <header style={{ position: 'sticky', top: 0, zIndex: 100, background: scrolled ? 'rgba(255,255,255,0.95)' : C.bg, borderBottom: scrolled ? '1px solid #E8E8E8' : '1px solid transparent', transition: 'all 0.3s', backdropFilter: scrolled ? 'blur(12px)' : 'none' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 68, padding: '0 40px', borderBottom: '1px solid #000' }}>
          <p style={{ fontFamily: 'Big Shoulders Display', fontSize: 20, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{name}</p>
          <nav style={{ display: 'flex', gap: 28, alignItems: 'center' }}>
            {['Services', 'Team', 'Reviews', 'Contact'].map(item => (
              <a key={item} href={`#${item.toLowerCase()}`} style={{ color: C.muted, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', transition: 'color 0.15s' }} onMouseEnter={e => (e.currentTarget.style.color = '#000')} onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>{item}</a>
            ))}
            <button onClick={() => setOpen(true)} style={{ background: '#000', color: '#fff', border: 'none', padding: '10px 24px', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', transition: 'background 0.2s' }} onMouseEnter={e => (e.currentTarget.style.background = '#333')} onMouseLeave={e => (e.currentTarget.style.background = '#000')}>Book</button>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section style={{ padding: '0 40px', minHeight: '100vh', display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid #000', overflow: 'hidden' }}>
        <div style={{ padding: '80px 0 80px', display: 'flex', flexDirection: 'column', justifyContent: 'center', borderRight: '1px solid #000' }}>
          <p style={{ fontFamily: 'Big Shoulders Display', fontSize: 11, fontWeight: 700, letterSpacing: '0.25em', textTransform: 'uppercase', color: C.muted, marginBottom: 32 }}>Premium Nail Studio</p>
          <h1 style={{ fontFamily: 'Big Shoulders Display', fontSize: 'clamp(80px,10vw,144px)', fontWeight: 900, lineHeight: 0.9, letterSpacing: '-0.04em', textTransform: 'uppercase', marginBottom: 0 }}>
            NAILS
          </h1>
          <h1 style={{ fontFamily: 'Big Shoulders Display', fontSize: 'clamp(80px,10vw,144px)', fontWeight: 900, lineHeight: 0.9, letterSpacing: '-0.04em', textTransform: 'uppercase', color: '#FFF', WebkitTextStroke: '2px #000', marginBottom: 32 }}>
            THAT
          </h1>
          <h1 style={{ fontFamily: 'Big Shoulders Display', fontSize: 'clamp(80px,10vw,144px)', fontWeight: 900, lineHeight: 0.9, letterSpacing: '-0.04em', textTransform: 'uppercase', marginBottom: 48 }}>
            SPEAK
          </h1>
          <p style={{ color: C.muted, fontSize: 16, lineHeight: 1.7, marginBottom: 48, maxWidth: 400, fontWeight: 300 }}>
            Where editorial boldness meets expert craft. No templates. No compromise. Just nails that make a statement.
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => setOpen(true)} style={{ background: '#000', color: '#fff', border: 'none', padding: '16px 48px', fontSize: 12, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', cursor: 'pointer' }}>Book Now</button>
            <a href="#services" style={{ border: '1px solid #000', color: '#000', padding: '16px 36px', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'inline-block', transition: 'all 0.2s' }} onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#000'; (e.currentTarget as HTMLElement).style.color = '#fff'; }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#000'; }}>Services</a>
          </div>
        </div>
        <div style={{ position: 'relative', overflow: 'hidden', marginLeft: 40 }}>
          <img src="https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=900&q=85" alt="Nail art" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(20%)' }} />
          <div style={{ position: 'absolute', bottom: 32, left: 32, background: '#fff', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 8, height: 8, background: '#000', borderRadius: '50%' }} />
            <p style={{ fontFamily: 'Big Shoulders Display', fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Precision. Always.</p>
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" style={{ borderBottom: '1px solid #000' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 40px' }}>
          <div style={{ padding: '64px 0 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid #E8E8E8' }}>
            <h2 style={{ fontFamily: 'Big Shoulders Display', fontSize: 72, fontWeight: 900, letterSpacing: '-0.04em', textTransform: 'uppercase', lineHeight: 0.9 }}>Services</h2>
            <button onClick={() => setOpen(true)} style={{ background: 'transparent', border: '1px solid #000', color: '#000', padding: '12px 28px', fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', cursor: 'pointer', marginBottom: 8 }}>Book All →</button>
          </div>
          {(data.services || []).map((svc, i) => (
            <div key={svc.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '28px 0', borderBottom: '1px solid #E8E8E8', cursor: 'pointer', transition: 'background 0.15s' }} onClick={() => setOpen(true)} onMouseEnter={e => (e.currentTarget.style.marginLeft = '8px')} onMouseLeave={e => (e.currentTarget.style.marginLeft = '0')}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
                <span style={{ fontFamily: 'Big Shoulders Display', fontSize: 13, fontWeight: 700, color: C.muted, minWidth: 32 }}>{String(i + 1).padStart(2, '0')}</span>
                <span style={{ fontFamily: 'Big Shoulders Display', fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', textTransform: 'uppercase' }}>{svc.name}</span>
                {svc.duration && <span style={{ fontSize: 12, color: C.muted, fontWeight: 400 }}>{svc.duration} min</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                <span style={{ fontFamily: 'Big Shoulders Display', fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em' }}>{fmtPrice(svc.price)}</span>
                <span style={{ fontSize: 20, color: C.muted }}>→</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* TEAM */}
      {(data.staff || []).length > 0 && (
        <section id="team" style={{ borderBottom: '1px solid #000' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: '64px 40px' }}>
            <h2 style={{ fontFamily: 'Big Shoulders Display', fontSize: 72, fontWeight: 900, letterSpacing: '-0.04em', textTransform: 'uppercase', marginBottom: 48, lineHeight: 0.9 }}>Team</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 1, background: '#000' }}>
              {(data.staff || []).map((m, i) => (
                <div key={m.id || i} style={{ background: '#fff', padding: '40px 32px' }}>
                  {m.avatar_url && <img src={m.avatar_url} alt={m.name} style={{ width: 64, height: 64, objectFit: 'cover', display: 'block', borderRadius: i % 3 === 0 ? '50%' : i % 3 === 1 ? '0px' : '10px', marginBottom: 20 }} />}
                  <p style={{ fontFamily: 'Big Shoulders Display', fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.muted, marginBottom: 16 }}>{String(i + 1).padStart(2, '0')}</p>
                  <h3 style={{ fontFamily: 'Big Shoulders Display', fontSize: 32, fontWeight: 800, letterSpacing: '-0.02em', textTransform: 'uppercase', marginBottom: 4 }}>{m.name}</h3>
                  {m.role && <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 20 }}>{m.role}</p>}
                  {m.bio && <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.8, fontWeight: 300 }}>{m.bio}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* REVIEWS */}
      {(data.reviews || []).length > 0 && (
        <section id="reviews" style={{ background: C.bg2, borderBottom: '1px solid #000' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto', padding: '64px 40px' }}>
            <h2 style={{ fontFamily: 'Big Shoulders Display', fontSize: 72, fontWeight: 900, letterSpacing: '-0.04em', textTransform: 'uppercase', marginBottom: 48, lineHeight: 0.9 }}>Words</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
              {(data.reviews || []).slice(0, 3).map((r, i) => (
                <div key={i} style={{ background: '#fff', padding: '36px', border: '1px solid #000' }}>
                  <div style={{ display: 'flex', gap: 2, marginBottom: 20 }}>
                    {[1,2,3,4,5].map(s => <span key={s} style={{ color: s <= (r.rating || 5) ? '#000' : C.border, fontSize: 14, fontWeight: 700 }}>★</span>)}
                  </div>
                  <p style={{ fontSize: 16, lineHeight: 1.7, color: '#000', marginBottom: 24, fontWeight: 300 }}>"{r.comment}"</p>
                  <p style={{ fontFamily: 'Big Shoulders Display', fontSize: 14, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted }}>— {r.customer_name}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CONTACT */}
      <section id="contact" style={{ borderBottom: '1px solid #000' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '64px 40px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80, borderTop: '1px solid #000' }}>
          <div>
            <h2 style={{ fontFamily: 'Big Shoulders Display', fontSize: 72, fontWeight: 900, letterSpacing: '-0.04em', textTransform: 'uppercase', lineHeight: 0.9, marginBottom: 40 }}>Visit Us</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 40 }}>
              {addr && <p style={{ color: C.muted, fontSize: 15, lineHeight: 1.7 }}>{addr}</p>}
              {b.phone && <a href={`tel:${b.phone}`} style={{ fontFamily: 'Big Shoulders Display', fontSize: 32, fontWeight: 800, color: '#000', letterSpacing: '-0.02em', transition: 'color 0.2s' }} onMouseEnter={e => (e.currentTarget.style.color = C.muted)} onMouseLeave={e => (e.currentTarget.style.color = '#000')}>{fmtPhone(b.phone)}</a>}
              {b.email && <a href={`mailto:${b.email}`} style={{ color: C.muted, fontSize: 14, transition: 'color 0.2s' }} onMouseEnter={e => (e.currentTarget.style.color = '#000')} onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>{b.email}</a>}
            </div>
            <button onClick={() => setOpen(true)} style={{ background: '#000', color: '#fff', border: 'none', padding: '16px 48px', fontSize: 12, fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', cursor: 'pointer' }}>Reserve Now</button>
          </div>
          <div>
            <p style={{ fontFamily: 'Big Shoulders Display', fontSize: 11, fontWeight: 700, letterSpacing: '0.25em', textTransform: 'uppercase', color: C.muted, marginBottom: 32 }}>Hours</p>
            {hours.map((h, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0', borderBottom: '1px solid #E8E8E8' }}>
                <span style={{ fontFamily: 'Big Shoulders Display', fontSize: 18, fontWeight: 700, textTransform: 'uppercase', color: h.is_closed ? '#DDD' : '#000', letterSpacing: '0.02em' }}>{h.label}</span>
                <span style={{ fontFamily: 'Big Shoulders Display', fontSize: 18, fontWeight: 700, color: h.is_closed ? '#DDD' : C.muted, letterSpacing: '0.02em' }}>{h.hours}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer style={{ padding: '24px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '2px solid #000' }}>
        <p style={{ fontFamily: 'Big Shoulders Display', fontSize: 16, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{name}</p>
        <p style={{ color: C.muted, fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>© {new Date().getFullYear()}</p>
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
