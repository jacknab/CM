import { useState, useEffect } from 'react';
import { useSiteData, groupHours, fmtPhone, fmtPrice, fmtTime, SLUG } from './lib/data';

const C = {
  bg: '#050505',
  bg2: '#0E0E0E',
  gold: '#C9A84C',
  goldLight: '#E5C97A',
  goldDark: '#8A6A20',
  text: '#F5F0E8',
  muted: '#888880',
  border: 'rgba(201,168,76,0.18)',
};

function BookingPanel({ open, onClose, slug }: { open: boolean; onClose: () => void; slug: string | null }) {
  const url = slug ? `/book/${slug}` : null;
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9998, opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity 0.3s', backdropFilter: 'blur(8px)' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(480px,100vw)', background: C.bg2, zIndex: 9999, display: 'flex', flexDirection: 'column', transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform 0.4s cubic-bezier(0.22,1,0.36,1)', borderLeft: `1px solid ${C.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '32px', borderBottom: `1px solid ${C.border}` }}>
          <div>
            <p style={{ color: C.gold, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontFamily: 'Cinzel', marginBottom: 8 }}>Reserve Your Visit</p>
            <p style={{ fontFamily: 'Cormorant Garamond', fontSize: 28, color: C.text, fontWeight: 400 }}>Book an Appointment</p>
          </div>
          <button onClick={onClose} style={{ color: C.muted, fontSize: 20, fontFamily: 'Cinzel', transition: 'color 0.2s' }} onMouseEnter={e => (e.currentTarget.style.color = C.text)} onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>✕</button>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: url ? 'stretch' : 'center', padding: url ? 0 : 48 }}>
          {url ? <iframe src={url} style={{ width: '100%', height: '100%', border: 'none' }} title="Book" /> : (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 60, height: 1, background: `linear-gradient(90deg, transparent, ${C.gold}, transparent)`, margin: '0 auto 32px' }} />
              <p style={{ fontFamily: 'Cormorant Garamond', fontSize: 22, color: C.text, marginBottom: 16, fontStyle: 'italic' }}>Contact us to reserve your time</p>
              <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.7 }}>Call or email us to schedule your bespoke nail appointment at your convenience.</p>
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
    <div style={{ fontFamily: 'Cormorant Garamond, serif', background: C.bg, color: C.text, minHeight: '100vh' }}>
      {/* NAV */}
      <header style={{ position: 'sticky', top: 0, zIndex: 100, background: scrolled ? 'rgba(5,5,5,0.96)' : 'transparent', borderBottom: scrolled ? `1px solid ${C.border}` : '1px solid transparent', transition: 'all 0.4s', backdropFilter: scrolled ? 'blur(12px)' : 'none' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 80, padding: '0 48px' }}>
          <div>
            <p style={{ fontFamily: 'Cinzel', fontSize: 11, letterSpacing: '0.25em', color: C.gold, textTransform: 'uppercase' }}>{name}</p>
          </div>
          <nav style={{ display: 'flex', gap: 36, alignItems: 'center' }}>
            {['Services', 'Artisans', 'Reviews', 'Contact'].map(item => (
              <a key={item} href={`#${item.toLowerCase()}`} style={{ color: C.muted, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', fontFamily: 'Cinzel', transition: 'color 0.2s' }} onMouseEnter={e => (e.currentTarget.style.color = C.gold)} onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>{item}</a>
            ))}
            <button onClick={() => setOpen(true)} style={{ background: 'transparent', border: `1px solid ${C.gold}`, color: C.gold, padding: '10px 28px', fontSize: 10, fontFamily: 'Cinzel', letterSpacing: '0.18em', textTransform: 'uppercase', transition: 'all 0.3s' }} onMouseEnter={e => { (e.currentTarget).style.background = C.gold; (e.currentTarget).style.color = C.bg; }} onMouseLeave={e => { (e.currentTarget).style.background = 'transparent'; (e.currentTarget).style.color = C.gold; }}>Reserve</button>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <img src="https://images.unsplash.com/photo-1604654894610-df63bc536371?auto=format&fit=crop&w=1600&q=80" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.25)' }} />
        </div>
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, rgba(5,5,5,0.95) 40%, rgba(5,5,5,0.3))' }} />
        <div style={{ position: 'relative', maxWidth: 1200, margin: '0 auto', padding: '0 48px', width: '100%' }}>
          <div style={{ maxWidth: 600 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 40 }}>
              <div style={{ height: 1, width: 48, background: C.gold }} />
              <p style={{ fontFamily: 'Cinzel', fontSize: 10, letterSpacing: '0.25em', color: C.gold, textTransform: 'uppercase' }}>Established in Excellence</p>
            </div>
            <h1 style={{ fontFamily: 'Cormorant Garamond', fontSize: 'clamp(56px,7vw,96px)', fontWeight: 300, lineHeight: 1.05, marginBottom: 32, letterSpacing: '-0.01em' }}>
              Where Nails<br />Become <em style={{ fontStyle: 'italic', color: C.gold }}>Art</em>
            </h1>
            <p style={{ color: C.muted, fontSize: 18, lineHeight: 1.8, marginBottom: 48, fontWeight: 300 }}>
              A sanctuary of refined beauty where every detail is considered, every treatment elevated. The finest nail artistry, exclusively for those who expect the exceptional.
            </p>
            <div style={{ display: 'flex', gap: 20 }}>
              <button onClick={() => setOpen(true)} style={{ background: C.gold, color: C.bg, border: 'none', padding: '16px 48px', fontFamily: 'Cinzel', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', transition: 'background 0.3s' }} onMouseEnter={e => (e.currentTarget.style.background = C.goldLight)} onMouseLeave={e => (e.currentTarget.style.background = C.gold)}>Reserve Now</button>
              <a href="#services" style={{ border: `1px solid rgba(201,168,76,0.3)`, color: C.muted, padding: '16px 40px', fontFamily: 'Cinzel', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', transition: 'all 0.3s' }} onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = C.gold; (e.currentTarget as HTMLElement).style.borderColor = C.gold; }} onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = C.muted; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(201,168,76,0.3)'; }}>Our Services</a>
            </div>
          </div>
        </div>
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, transparent, ${C.gold}40, transparent)` }} />
      </section>

      {/* SERVICES */}
      <section id="services" style={{ padding: '120px 48px', background: C.bg }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>
            <div style={{ height: 1, width: 40, background: C.gold }} />
            <p style={{ fontFamily: 'Cinzel', fontSize: 10, letterSpacing: '0.2em', color: C.gold, textTransform: 'uppercase' }}>Curated Services</p>
          </div>
          <h2 style={{ fontFamily: 'Cormorant Garamond', fontSize: 'clamp(40px,5vw,72px)', fontWeight: 300, marginBottom: 64, letterSpacing: '-0.01em' }}>The Collection</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 1, border: `1px solid ${C.border}` }}>
            {(data.services || []).map((svc, i) => (
              <div key={svc.id || i} style={{ padding: '40px 36px', borderRight: i % 3 !== 2 ? `1px solid ${C.border}` : 'none', borderBottom: `1px solid ${C.border}`, transition: 'background 0.3s' }} onMouseEnter={e => (e.currentTarget.style.background = C.bg2)} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                  <p style={{ fontFamily: 'Cinzel', fontSize: 9, letterSpacing: '0.15em', color: C.gold, textTransform: 'uppercase' }}>{String(i + 1).padStart(2, '0')}</p>
                  <p style={{ fontFamily: 'Cormorant Garamond', fontSize: 28, color: C.gold, fontWeight: 300 }}>{fmtPrice(svc.price)}</p>
                </div>
                <h3 style={{ fontFamily: 'Cormorant Garamond', fontSize: 24, fontWeight: 400, marginBottom: 10 }}>{svc.name}</h3>
                {svc.duration && <p style={{ color: C.muted, fontSize: 12, fontFamily: 'Cinzel', letterSpacing: '0.1em' }}>{svc.duration} minutes</p>}
                <button onClick={() => setOpen(true)} style={{ marginTop: 28, color: C.gold, background: 'transparent', border: 'none', fontFamily: 'Cinzel', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', transition: 'color 0.2s', cursor: 'pointer' }} onMouseEnter={e => (e.currentTarget.style.color = C.goldLight)} onMouseLeave={e => (e.currentTarget.style.color = C.gold)}>Reserve →</button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TEAM */}
      {(data.staff || []).length > 0 && (
        <section id="artisans" style={{ padding: '120px 48px', background: C.bg2 }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>
              <div style={{ height: 1, width: 40, background: C.gold }} />
              <p style={{ fontFamily: 'Cinzel', fontSize: 10, letterSpacing: '0.2em', color: C.gold, textTransform: 'uppercase' }}>Our Artisans</p>
            </div>
            <h2 style={{ fontFamily: 'Cormorant Garamond', fontSize: 'clamp(40px,5vw,72px)', fontWeight: 300, marginBottom: 64 }}>The Team</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 2 }}>
              {(data.staff || []).map((m, i) => (
                <div key={m.id || i} style={{ padding: '48px 40px', border: `1px solid ${C.border}`, transition: 'border-color 0.3s' }} onMouseEnter={e => (e.currentTarget.style.borderColor = C.gold + '60')} onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}>
                  <div style={{ width: 56, height: 56, border: `1px solid ${C.gold}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, fontFamily: 'Cinzel', fontSize: 18, color: C.gold }}>
                    {m.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                  </div>
                  <h3 style={{ fontFamily: 'Cormorant Garamond', fontSize: 26, fontWeight: 400, marginBottom: 6 }}>{m.name}</h3>
                  {m.role && <p style={{ fontFamily: 'Cinzel', fontSize: 9, letterSpacing: '0.15em', color: C.gold, textTransform: 'uppercase', marginBottom: 20 }}>{m.role}</p>}
                  {m.bio && <p style={{ color: C.muted, fontSize: 15, lineHeight: 1.8, fontStyle: 'italic' }}>{m.bio}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* REVIEWS */}
      {(data.reviews || []).length > 0 && (
        <section id="reviews" style={{ padding: '120px 48px', background: C.bg }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>
              <div style={{ height: 1, width: 40, background: C.gold }} />
              <p style={{ fontFamily: 'Cinzel', fontSize: 10, letterSpacing: '0.2em', color: C.gold, textTransform: 'uppercase' }}>Testimonials</p>
            </div>
            <h2 style={{ fontFamily: 'Cormorant Garamond', fontSize: 'clamp(40px,5vw,72px)', fontWeight: 300, marginBottom: 64 }}>Client Words</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 40 }}>
              {(data.reviews || []).slice(0, 3).map((r, i) => (
                <div key={i} style={{ padding: '48px 40px', borderTop: `1px solid ${C.gold}40` }}>
                  <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
                    {[1,2,3,4,5].map(s => <span key={s} style={{ color: s <= (r.rating || 5) ? C.gold : C.muted, fontSize: 12 }}>★</span>)}
                  </div>
                  <p style={{ fontSize: 20, lineHeight: 1.75, marginBottom: 32, fontStyle: 'italic', fontWeight: 300, color: C.text }}>"{r.comment}"</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ height: 1, width: 24, background: C.gold }} />
                    <p style={{ fontFamily: 'Cinzel', fontSize: 10, letterSpacing: '0.15em', color: C.gold, textTransform: 'uppercase' }}>{r.customer_name}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CONTACT */}
      <section id="contact" style={{ padding: '120px 48px', background: C.bg2, borderTop: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>
              <div style={{ height: 1, width: 40, background: C.gold }} />
              <p style={{ fontFamily: 'Cinzel', fontSize: 10, letterSpacing: '0.2em', color: C.gold, textTransform: 'uppercase' }}>Find Us</p>
            </div>
            <h2 style={{ fontFamily: 'Cormorant Garamond', fontSize: 52, fontWeight: 300, marginBottom: 40 }}>{name}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 48 }}>
              {addr && <p style={{ color: C.muted, fontSize: 15, fontStyle: 'italic' }}>{addr}</p>}
              {b.phone && <a href={`tel:${b.phone}`} style={{ color: C.gold, fontSize: 18, fontFamily: 'Cormorant Garamond', fontStyle: 'italic', transition: 'color 0.2s' }} onMouseEnter={e => (e.currentTarget.style.color = C.goldLight)} onMouseLeave={e => (e.currentTarget.style.color = C.gold)}>{fmtPhone(b.phone)}</a>}
              {b.email && <a href={`mailto:${b.email}`} style={{ color: C.muted, fontSize: 14, transition: 'color 0.2s' }} onMouseEnter={e => (e.currentTarget.style.color = C.text)} onMouseLeave={e => (e.currentTarget.style.color = C.muted)}>{b.email}</a>}
            </div>
            <button onClick={() => setOpen(true)} style={{ background: C.gold, color: C.bg, border: 'none', padding: '16px 48px', fontFamily: 'Cinzel', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', transition: 'background 0.3s', cursor: 'pointer' }} onMouseEnter={e => (e.currentTarget.style.background = C.goldLight)} onMouseLeave={e => (e.currentTarget.style.background = C.gold)}>Reserve Your Time</button>
          </div>
          <div>
            <p style={{ fontFamily: 'Cinzel', fontSize: 10, letterSpacing: '0.2em', color: C.gold, textTransform: 'uppercase', marginBottom: 32 }}>Hours of Service</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {hours.map((h, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 0', borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ color: h.is_closed ? C.muted + '60' : C.muted, fontSize: 14, fontStyle: 'italic' }}>{h.label}</span>
                  <span style={{ color: h.is_closed ? C.muted + '40' : C.gold, fontSize: 14, fontFamily: 'Cormorant Garamond' }}>{h.hours}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <footer style={{ padding: '32px 48px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ fontFamily: 'Cinzel', fontSize: 9, letterSpacing: '0.2em', color: C.muted, textTransform: 'uppercase' }}>{name}</p>
        <p style={{ color: C.muted + '60', fontSize: 12, fontStyle: 'italic' }}>© {new Date().getFullYear()}</p>
      </footer>

      <BookingPanel open={open} onClose={() => setOpen(false)} slug={slug} />
    </div>
  );
}
