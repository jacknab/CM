import { useState, useEffect } from 'react';
import { MapPin, Phone, Mail, Clock, Instagram, Facebook, Menu, X } from 'lucide-react';

const EMERALD = '#1A4A2E';
const JADE = '#2D7A4A';
const MINT = '#A8D5B0';
const CREAM = '#F8F4EC';
const WARM = '#EEE8DA';
const FERN = '#5A8A68';

const services = [
  { name: 'Verdant Cut', desc: 'Shape, texture, personality', price: '$92' },
  { name: 'Forest Colour', desc: 'Deep dimensional tones', price: '$175+' },
  { name: 'Botanical Balayage', desc: 'Natural, luminous finish', price: '$215+' },
  { name: 'Moss Treatment', desc: 'Algae & green clay mask', price: '$88' },
  { name: 'Root Regrowth', desc: 'Seamless colour blending', price: '$98' },
  { name: 'Curls & Texture', desc: 'Defined natural waves', price: '$115' },
];

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [openIdx, setOpenIdx] = useState<number | null>(null);

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
    <div style={{ background: CREAM, color: EMERALD }} className="overflow-x-hidden">

      {/* NAV */}
      <nav style={{ background: scrolled ? 'rgba(248,244,236,0.96)' : 'transparent', backdropFilter: scrolled ? 'blur(12px)' : 'none', boxShadow: scrolled ? '0 1px 20px rgba(26,74,46,0.08)' : 'none' }}
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-500 py-5 px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button onClick={() => scrollTo('hero')}>
            <span style={{ fontFamily: "'EB Garamond', serif", fontSize: 24, color: EMERALD, letterSpacing: 2 }}>Verdant</span>
          </button>
          <div className="hidden md:flex items-center gap-8">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)}
                style={{ color: FERN, fontSize: 13, letterSpacing: 1 }}
                className="capitalize hover:text-emerald-800 transition-colors duration-300">{s}</button>
            ))}
            <button onClick={() => scrollTo('contact')}
              style={{ background: EMERALD, color: CREAM, borderRadius: 50 }}
              className="px-7 py-2.5 text-sm hover:opacity-90 transition-opacity duration-300">
              Book
            </button>
          </div>
          <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)} style={{ color: EMERALD }}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menuOpen && (
          <div style={{ background: CREAM, borderTop: `1px solid ${WARM}` }} className="md:hidden px-8 py-4 space-y-4">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)} className="block capitalize" style={{ color: FERN }}>{s}</button>
            ))}
          </div>
        )}
      </nav>

      {/* HERO - fullscreen with botanical overlay */}
      <section id="hero" className="relative h-screen overflow-hidden">
        <img src="https://images.pexels.com/photos/1570807/pexels-photo-1570807.jpeg?auto=compress&cs=tinysrgb&w=1920&q=85"
          className="absolute inset-0 w-full h-full object-cover" alt="" />
        <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, rgba(26,74,46,0.8) 0%, rgba(26,74,46,0.5) 50%, rgba(26,74,46,0.3) 100%)` }} />
        <div className="relative z-10 h-full flex items-center px-8 md:px-20">
          <div>
            <div className="flex items-center gap-4 mb-6">
              <div style={{ width: 32, height: 2, background: MINT, borderRadius: 2 }} />
              <p style={{ color: MINT, letterSpacing: 5, fontSize: 11 }} className="uppercase">Hair & Colour Studio</p>
            </div>
            <h1 style={{ fontFamily: "'EB Garamond', serif", fontSize: 'clamp(52px, 9vw, 110px)', color: CREAM, lineHeight: 0.9 }} className="mb-8">
              Lush.<br />Luminous.<br /><em>Alive.</em>
            </h1>
            <p style={{ color: 'rgba(248,244,236,0.8)', lineHeight: 1.8, fontSize: 16, maxWidth: 440 }} className="mb-10">
              Verdant is a colour studio obsessed with depth, luminosity, and hair that looks like it's alive with light. Rich greens, deep forests, luminous golds — all handcrafted.
            </p>
            <div className="flex gap-4">
              <button onClick={() => scrollTo('contact')}
                style={{ background: MINT, color: EMERALD }}
                className="px-8 py-3.5 rounded-full text-sm font-medium hover:bg-green-200 transition-colors duration-300">
                Book Now
              </button>
              <button onClick={() => scrollTo('services')}
                style={{ border: `1.5px solid rgba(168,213,176,0.4)`, color: MINT }}
                className="px-8 py-3.5 rounded-full text-sm hover:bg-white/10 transition-colors duration-300">
                Services
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" style={{ background: WARM }} className="py-24 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <div>
            <p style={{ color: JADE, letterSpacing: 5, fontSize: 11 }} className="uppercase mb-5">About Verdant</p>
            <h2 style={{ fontFamily: "'EB Garamond', serif", fontSize: 'clamp(28px, 4vw, 50px)', color: EMERALD }} className="leading-tight mb-8">
              Hair as rich and<br />deep as a<br /><em>forest floor</em>
            </h2>
            <p style={{ color: '#4A7058', lineHeight: 1.9, fontSize: 15 }} className="mb-5">
              Verdant was founded on a single belief: that exceptional colour should look as natural and alive as a forest in spring. We don't use trend palettes — we use what's right for you.
            </p>
            <p style={{ color: '#4A7058', lineHeight: 1.9, fontSize: 15 }} className="mb-10">
              Our six stylists have each trained in botanical colour techniques and hold advanced qualifications in colour science.
            </p>
            <div className="flex gap-10">
              {[['6', 'Colour Artists'], ['7+', 'Years'], ['★4.9', 'Rating']].map(([n, l]) => (
                <div key={l} style={{ borderLeft: `3px solid ${MINT}`, paddingLeft: 16 }}>
                  <p style={{ fontFamily: "'EB Garamond', serif", fontSize: 36, color: EMERALD }}>{n}</p>
                  <p style={{ color: FERN, fontSize: 11, letterSpacing: 2 }} className="uppercase mt-1">{l}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <img src="https://images.pexels.com/photos/3804040/pexels-photo-3804040.jpeg?auto=compress&cs=tinysrgb&w=500&q=80"
              className="w-full object-cover rounded-2xl" style={{ aspectRatio: '4/5' }} alt="" />
            <div className="mt-10">
              <img src="https://images.pexels.com/photos/1327218/pexels-photo-1327218.jpeg?auto=compress&cs=tinysrgb&w=500&q=80"
                className="w-full object-cover rounded-2xl" style={{ aspectRatio: '4/5' }} alt="" />
            </div>
          </div>
        </div>
      </section>

      {/* SERVICES — accordion */}
      <section id="services" style={{ background: CREAM }} className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <p style={{ color: JADE, letterSpacing: 5, fontSize: 11 }} className="uppercase mb-3">Menu</p>
            <h2 style={{ fontFamily: "'EB Garamond', serif", fontSize: 44, color: EMERALD }}>Services</h2>
          </div>
          {services.map(({ name, desc, price }, i) => (
            <div key={name} style={{ borderBottom: `1px solid ${WARM}` }}>
              <button className="w-full flex items-center justify-between py-5 text-left"
                onClick={() => setOpenIdx(openIdx === i ? null : i)}>
                <div>
                  <span style={{ fontFamily: "'EB Garamond', serif", fontSize: 20, color: EMERALD }}>{name}</span>
                  {openIdx === i && <p style={{ color: FERN, fontSize: 13, marginTop: 4 }}>{desc}</p>}
                </div>
                <div className="flex items-center gap-5">
                  <span style={{ fontFamily: "'EB Garamond', serif", fontSize: 24, color: JADE }}>{price}</span>
                  <span style={{ color: MINT, fontSize: 20, transition: 'transform 0.3s', transform: openIdx === i ? 'rotate(45deg)' : 'none' }}>+</span>
                </div>
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* GALLERY */}
      <section id="gallery" style={{ background: WARM }} className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <p style={{ color: JADE, letterSpacing: 5, fontSize: 11 }} className="uppercase text-center mb-3">Portfolio</p>
          <h2 style={{ fontFamily: "'EB Garamond', serif", fontSize: 44, color: EMERALD }} className="text-center mb-12">Our Work</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              'https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/3182742/pexels-photo-3182742.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/3997379/pexels-photo-3997379.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/2009901/pexels-photo-2009901.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/3993306/pexels-photo-3993306.jpeg?auto=compress&cs=tinysrgb&w=500',
              'https://images.pexels.com/photos/3065170/pexels-photo-3065170.jpeg?auto=compress&cs=tinysrgb&w=500',
            ].map((src, i) => (
              <div key={i} className="overflow-hidden rounded-2xl group" style={{ aspectRatio: i % 2 === 0 ? '1/1' : '4/5' }}>
                <img src={src} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" style={{ background: EMERALD }} className="py-24 px-6 text-white">
        <div className="max-w-5xl mx-auto">
          <p style={{ color: MINT, letterSpacing: 5, fontSize: 11 }} className="uppercase text-center mb-3">Visit</p>
          <h2 style={{ fontFamily: "'EB Garamond', serif", fontSize: 44, color: CREAM }} className="text-center mb-14">Contact</h2>
          <div className="grid md:grid-cols-2 gap-16">
            <div className="space-y-7">
              {[
                { icon: <MapPin size={16} />, lines: ['22 Kensington Gardens', 'London, W2 3QA'] },
                { icon: <Phone size={16} />, lines: ['+44 20 7221 0164'] },
                { icon: <Mail size={16} />, lines: ['hello@verdant.studio'] },
                { icon: <Clock size={16} />, lines: ['Mon–Sat: 9am – 7pm', 'Sun: 10am – 5pm'] },
              ].map(({ icon, lines }, i) => (
                <div key={i} className="flex gap-4">
                  <div style={{ color: MINT, marginTop: 2 }}>{icon}</div>
                  <div>{lines.map(l => <p key={l} style={{ color: '#A8C8B4', fontSize: 15 }}>{l}</p>)}</div>
                </div>
              ))}
              <div className="flex gap-3">
                {[<Instagram size={15} />, <Facebook size={15} />].map((ic, i) => (
                  <a key={i} href="#" style={{ border: `1px solid #2D6040`, color: '#5A9070' }}
                    className="w-10 h-10 flex items-center justify-center rounded-xl hover:border-green-400 hover:text-green-300 transition-colors duration-300">{ic}</a>
                ))}
              </div>
            </div>
            <div style={{ background: '#163A22', borderRadius: 16, border: `1px solid #2D6040` }} className="p-8">
              {['Name', 'Email', 'Phone'].map(p => (
                <input key={p} placeholder={p}
                  style={{ background: '#0F2818', border: '1px solid #2D6040', color: CREAM, borderRadius: 10, display: 'block', width: '100%', padding: '12px 16px', marginBottom: 12, outline: 'none', fontSize: 14 }}
                  className="placeholder:text-emerald-950 focus:border-emerald-400 transition-colors duration-300" />
              ))}
              <textarea placeholder="Service you'd like..."
                style={{ background: '#0F2818', border: '1px solid #2D6040', color: CREAM, borderRadius: 10, display: 'block', width: '100%', padding: '12px 16px', marginBottom: 16, outline: 'none', fontSize: 14, resize: 'none', height: 85 }}
                className="placeholder:text-emerald-950 focus:border-emerald-400 transition-colors duration-300" />
              <button style={{ background: MINT, color: EMERALD, borderRadius: 10, width: '100%', padding: '14px 0', fontSize: 14 }}
                className="font-medium hover:opacity-90 transition-opacity duration-300">
                Book Appointment
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer style={{ background: '#0E2A1A', borderTop: `1px solid #1A3A24` }} className="py-8 px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <span style={{ fontFamily: "'EB Garamond', serif", color: FERN, fontSize: 18 }}>Verdant</span>
          <p style={{ color: '#2D5040', fontSize: 12 }}>&copy; {new Date().getFullYear()} Verdant Hair Studio</p>
        </div>
      </footer>
    </div>
  );
}
