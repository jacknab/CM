import { useState, useEffect } from 'react';
import { MapPin, Phone, Mail, Clock, Instagram, Menu, X } from 'lucide-react';

const PETAL = '#F2C4CE';
const ROSE = '#D4789A';
const BLUSH = '#FBF0F3';
const DEEP = '#3D1E2A';
const MAUVE = '#9B6B7A';

const services = [
  { jp: 'カット', en: 'Signature Cut', price: '¥8,800 / $85' },
  { jp: 'カラー', en: 'Full Colour', price: '¥18,000 / $175+' },
  { jp: 'ハイライト', en: 'Highlight Weave', price: '¥22,000 / $210+' },
  { jp: 'トリートメント', en: 'Silk Treatment', price: '¥9,500 / $90' },
  { jp: 'パーマ', en: 'Soft Wave Perm', price: '¥16,000 / $155' },
  { jp: 'スタイリング', en: 'Blowout & Style', price: '¥6,500 / $65' },
];

const gallery = [
  'https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/1813346/pexels-photo-1813346.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/3182742/pexels-photo-3182742.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/1570807/pexels-photo-1570807.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/3997379/pexels-photo-3997379.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/3804040/pexels-photo-3804040.jpeg?auto=compress&cs=tinysrgb&w=500',
];

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', h);
    return () => window.removeEventListener('scroll', h);
  }, []);

  const scrollTo = (id: string) => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div style={{ background: BLUSH, color: DEEP }} className="overflow-x-hidden">

      {/* NAV */}
      <nav style={{ background: scrolled ? 'rgba(251,240,243,0.95)' : 'transparent', backdropFilter: scrolled ? 'blur(12px)' : 'none', boxShadow: scrolled ? '0 1px 20px rgba(212,120,154,0.08)' : 'none' }}
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-500 py-5 px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button onClick={() => scrollTo('hero')}>
            <span style={{ fontFamily: "'Noto Serif', serif", fontSize: 22, color: DEEP, letterSpacing: 3 }}>桜 Sakura</span>
          </button>
          <div className="hidden md:flex items-center gap-8">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)}
                style={{ color: MAUVE, fontSize: 13 }}
                className="capitalize hover:text-pink-600 transition-colors duration-300">{s}</button>
            ))}
            <button onClick={() => scrollTo('contact')}
              style={{ background: ROSE, color: 'white', borderRadius: 50 }}
              className="px-7 py-2.5 text-sm hover:opacity-90 transition-opacity duration-300 shadow-sm">
              Book Now
            </button>
          </div>
          <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)} style={{ color: DEEP }}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menuOpen && (
          <div style={{ background: BLUSH, borderTop: `1px solid ${PETAL}` }} className="md:hidden px-8 py-4 space-y-4">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)} className="block capitalize" style={{ color: MAUVE }}>{s}</button>
            ))}
          </div>
        )}
      </nav>

      {/* HERO — split with soft imagery */}
      <section id="hero" className="min-h-screen grid md:grid-cols-5">
        <div className="md:col-span-3 relative overflow-hidden" style={{ minHeight: 500 }}>
          <img src="https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=1200&q=85"
            className="w-full h-full object-cover" style={{ minHeight: 500, filter: 'saturate(0.9)' }} alt="Sakura" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(242,196,206,0.3) 0%, transparent 60%)' }} />
          {/* Floating cherry blossom petal motif */}
          <div className="absolute top-1/3 right-8 text-6xl opacity-20 pointer-events-none select-none">🌸</div>
          <div className="absolute bottom-1/4 left-12 text-4xl opacity-15 pointer-events-none select-none">🌸</div>
        </div>
        <div className="md:col-span-2 flex flex-col justify-center px-10 md:px-14 py-24 md:py-0" style={{ background: BLUSH }}>
          <p style={{ color: ROSE, letterSpacing: 5, fontSize: 11 }} className="uppercase mb-4">東京スタイル · Tokyo Style</p>
          <h1 style={{ fontFamily: "'Noto Serif', serif", fontSize: 'clamp(36px, 5vw, 62px)', color: DEEP, lineHeight: 1.1 }} className="mb-4">
            Hair as<br />delicate as a<br /><em>petal.</em>
          </h1>
          <p style={{ color: MAUVE, lineHeight: 1.9, fontSize: 14, maxWidth: 340 }} className="mb-8">
            Japanese-inspired hair artistry in the heart of the city. Precision, softness, and a ritual approach to every appointment.
          </p>
          <div className="space-y-3">
            <button onClick={() => scrollTo('contact')}
              style={{ background: ROSE, color: 'white', width: '100%', borderRadius: 50, padding: '14px 0', fontSize: 14 }}
              className="hover:opacity-90 transition-opacity duration-300">
              Book an Appointment
            </button>
            <button onClick={() => scrollTo('services')}
              style={{ border: `1.5px solid ${PETAL}`, color: MAUVE, width: '100%', borderRadius: 50, padding: '13px 0', fontSize: 14 }}
              className="hover:border-pink-300 transition-colors duration-300">
              View Services
            </button>
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" style={{ background: 'white' }} className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-4xl mb-6 opacity-30">🌸</p>
          <p style={{ color: ROSE, letterSpacing: 4, fontSize: 11 }} className="uppercase mb-4">Our Philosophy</p>
          <h2 style={{ fontFamily: "'Noto Serif', serif", fontSize: 'clamp(28px, 4vw, 46px)', color: DEEP }} className="mb-6 leading-tight">
            美 — The Art of Beauty
          </h2>
          <p style={{ color: MAUVE, lineHeight: 1.9, fontSize: 15, maxWidth: 560, margin: '0 auto 48px' }}>
            Rooted in the Japanese philosophy of "ma" — the art of considered space — every appointment at Sakura is unhurried and deeply intentional. We believe the ritual of hair care is as nourishing as the result.
          </p>
          <div className="grid grid-cols-3 gap-6">
            {[
              { label: '精度', sub: 'Precision', desc: 'Millimetre-perfect technique, every time.' },
              { label: '穏やか', sub: 'Gentle', desc: 'Only the softest formulas on your hair.' },
              { label: '美しさ', sub: 'Beauty', desc: 'Artistry in every strand, every appointment.' },
            ].map(({ label, sub, desc }) => (
              <div key={sub} style={{ background: BLUSH, borderRadius: 20, border: `1px solid ${PETAL}` }} className="p-6">
                <p style={{ fontFamily: "'Noto Serif', serif", fontSize: 28, color: ROSE }} className="mb-1">{label}</p>
                <p style={{ color: DEEP, fontWeight: 600, fontSize: 14 }} className="mb-2">{sub}</p>
                <p style={{ color: MAUVE, fontSize: 13, lineHeight: 1.6 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" style={{ background: BLUSH }} className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <p style={{ color: ROSE, letterSpacing: 4, fontSize: 11 }} className="uppercase mb-3">メニュー · Menu</p>
            <h2 style={{ fontFamily: "'Noto Serif', serif", fontSize: 44, color: DEEP }}>Services</h2>
            <div style={{ width: 40, height: 2, background: PETAL, borderRadius: 2 }} className="mx-auto mt-4" />
          </div>
          <div className="space-y-3">
            {services.map(({ jp, en, price }) => (
              <div key={en} style={{ background: 'white', borderRadius: 16, border: `1px solid ${PETAL}` }}
                className="px-6 py-5 flex items-center justify-between hover:border-pink-300 hover:shadow-sm transition-all duration-300">
                <div className="flex items-center gap-4">
                  <span style={{ fontFamily: "'Noto Serif', serif", fontSize: 14, color: ROSE, minWidth: 80 }}>{jp}</span>
                  <div style={{ width: 1, height: 24, background: PETAL }} />
                  <span style={{ fontSize: 15, color: DEEP }}>{en}</span>
                </div>
                <span style={{ fontFamily: "'Noto Serif', serif", fontSize: 16, color: ROSE, flexShrink: 0, marginLeft: 16 }}>{price}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* GALLERY */}
      <section id="gallery" style={{ background: 'white' }} className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <p style={{ color: ROSE, letterSpacing: 4, fontSize: 11 }} className="uppercase text-center mb-3">ギャラリー</p>
          <h2 style={{ fontFamily: "'Noto Serif', serif", fontSize: 44, color: DEEP }} className="text-center mb-12">Gallery</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {gallery.map((src, i) => (
              <div key={i} className="overflow-hidden rounded-2xl group" style={{ aspectRatio: '4/5' }}>
                <img src={src} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  style={{ filter: 'saturate(0.95)' }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" style={{ background: DEEP }} className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <p style={{ color: PETAL, letterSpacing: 4, fontSize: 11 }} className="uppercase text-center mb-3">お問い合わせ</p>
          <h2 style={{ fontFamily: "'Noto Serif', serif", fontSize: 44, color: BLUSH }} className="text-center mb-14">Contact</h2>
          <div className="grid md:grid-cols-2 gap-16">
            <div className="space-y-7">
              {[
                { icon: <MapPin size={16} />, lines: ['15 Carnaby Street', 'London, W1F 9PL'] },
                { icon: <Phone size={16} />, lines: ['+44 20 7437 0118'] },
                { icon: <Mail size={16} />, lines: ['hello@sakura.studio'] },
                { icon: <Clock size={16} />, lines: ['Wed–Sun: 10am – 7pm', 'By appointment only'] },
              ].map(({ icon, lines }, i) => (
                <div key={i} className="flex gap-4">
                  <div style={{ color: ROSE, marginTop: 2 }}>{icon}</div>
                  <div>{lines.map(l => <p key={l} style={{ color: '#B09098', fontSize: 15 }}>{l}</p>)}</div>
                </div>
              ))}
              <a href="#" style={{ border: `1px solid #5D3444`, color: MAUVE }}
                className="w-10 h-10 inline-flex items-center justify-center rounded-xl hover:border-pink-400 hover:text-pink-300 transition-colors duration-300">
                <Instagram size={16} />
              </a>
            </div>
            <div style={{ background: '#4A2834', borderRadius: 20, border: `1px solid #5D3444` }} className="p-8">
              {['お名前 / Name', 'Email', 'Phone'].map(p => (
                <input key={p} placeholder={p}
                  style={{ background: '#3D1E2A', border: '1px solid #5D3444', color: BLUSH, borderRadius: 12, display: 'block', width: '100%', padding: '12px 16px', marginBottom: 12, outline: 'none', fontSize: 14 }}
                  className="placeholder:text-pink-950 focus:border-pink-400 transition-colors duration-300" />
              ))}
              <textarea placeholder="ご希望のサービス / Desired service"
                style={{ background: '#3D1E2A', border: '1px solid #5D3444', color: BLUSH, borderRadius: 12, display: 'block', width: '100%', padding: '12px 16px', marginBottom: 16, outline: 'none', fontSize: 14, resize: 'none', height: 85 }}
                className="placeholder:text-pink-950 focus:border-pink-400 transition-colors duration-300" />
              <button style={{ background: ROSE, color: 'white', borderRadius: 12, width: '100%', padding: '14px 0', fontSize: 14 }}
                className="hover:opacity-90 transition-opacity duration-300">
                ご予約をリクエスト / Request Booking
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer style={{ background: '#2A1018', borderTop: `1px solid #3D1E2A` }} className="py-8 px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <span style={{ fontFamily: "'Noto Serif', serif", color: ROSE, fontSize: 15 }}>桜 Sakura Studio</span>
          <p style={{ color: '#5D3444', fontSize: 12 }}>&copy; {new Date().getFullYear()} Sakura Hair Studio</p>
        </div>
      </footer>
    </div>
  );
}
