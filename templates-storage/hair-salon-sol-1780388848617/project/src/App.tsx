import { useState, useEffect } from 'react';
import { MapPin, Phone, Mail, Clock, Instagram, Facebook, Menu, X, Sun } from 'lucide-react';

const AMBER = '#C8780A';
const GOLD = '#E8A820';
const WARM = '#FFF3DC';
const CREAM = '#FFFBF4';
const DARK = '#2A1A06';

const services = [
  { name: 'Sun-Kissed Balayage', price: '$230', popular: true },
  { name: 'Golden Hour Colour', price: '$180+', popular: false },
  { name: 'Signature Sol Cut', price: '$95', popular: true },
  { name: 'Gloss & Shine Treatment', price: '$90', popular: false },
  { name: 'Highlights & Lowlights', price: '$175+', popular: false },
  { name: 'Keratin Silk Ritual', price: '$240', popular: false },
  { name: 'Men\'s Precision Cut', price: '$70', popular: false },
  { name: 'Curl Enhancement', price: '$115', popular: false },
];

const gallery = [
  'https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=600&q=80',
  'https://images.pexels.com/photos/1570807/pexels-photo-1570807.jpeg?auto=compress&cs=tinysrgb&w=600&q=80',
  'https://images.pexels.com/photos/3182742/pexels-photo-3182742.jpeg?auto=compress&cs=tinysrgb&w=600&q=80',
  'https://images.pexels.com/photos/3804040/pexels-photo-3804040.jpeg?auto=compress&cs=tinysrgb&w=600&q=80',
  'https://images.pexels.com/photos/1327218/pexels-photo-1327218.jpeg?auto=compress&cs=tinysrgb&w=600&q=80',
  'https://images.pexels.com/photos/3997379/pexels-photo-3997379.jpeg?auto=compress&cs=tinysrgb&w=600&q=80',
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
    <div style={{ background: CREAM, color: DARK }} className="overflow-x-hidden">

      {/* NAV */}
      <nav style={{ background: scrolled ? 'rgba(255,251,244,0.96)' : 'transparent', backdropFilter: scrolled ? 'blur(12px)' : 'none', boxShadow: scrolled ? '0 1px 30px rgba(200,120,10,0.08)' : 'none' }}
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-500 py-5 px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button onClick={() => scrollTo('hero')} className="flex items-center gap-2">
            <Sun size={22} style={{ color: GOLD }} strokeWidth={1.5} />
            <span style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 20, color: DARK }}>Sol</span>
          </button>
          <div className="hidden md:flex items-center gap-8">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)}
                style={{ color: '#9A7040', fontSize: 13, letterSpacing: 1 }}
                className="capitalize hover:text-amber-700 transition-colors duration-300">{s}</button>
            ))}
            <button onClick={() => scrollTo('contact')}
              style={{ background: `linear-gradient(135deg, ${AMBER}, ${GOLD})`, color: 'white', fontSize: 13 }}
              className="px-6 py-2.5 rounded-full shadow-md hover:shadow-amber-200 hover:shadow-lg transition-all duration-300">
              Book Now
            </button>
          </div>
          <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)} style={{ color: DARK }}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menuOpen && (
          <div style={{ background: WARM, borderTop: `1px solid #F0E0C0` }} className="md:hidden px-8 py-4 space-y-4">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)} className="block capitalize text-sm" style={{ color: '#9A7040' }}>{s}</button>
            ))}
          </div>
        )}
      </nav>

      {/* HERO - Gradient Bold */}
      <section id="hero" className="min-h-screen relative overflow-hidden">
        <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${WARM} 0%, #FFE5A0 40%, #FFCC60 70%, ${GOLD} 100%)` }} />
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "url('https://images.pexels.com/photos/1570807/pexels-photo-1570807.jpeg?auto=compress&cs=tinysrgb&w=1920&q=60')", backgroundSize: 'cover', backgroundPosition: 'center', mixBlendMode: 'multiply' }} />
        <div className="relative z-10 h-screen flex items-center">
          <div className="max-w-7xl mx-auto px-8 w-full grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div style={{ width: 40, height: 2, background: AMBER }} />
                <p style={{ color: AMBER, letterSpacing: 4, fontSize: 11 }} className="uppercase">Colour Specialists</p>
              </div>
              <h1 style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 'clamp(52px, 8vw, 100px)', color: DARK, lineHeight: 0.9 }} className="mb-8">
                Golden<br /><em>hour</em><br />hair.
              </h1>
              <p style={{ color: '#7A5020', lineHeight: 1.8, fontSize: 16, maxWidth: 420 }} className="mb-10">
                Specialists in sun-kissed balayage, dimensional colour, and the kind of hair that looks like you've spent the summer somewhere beautiful.
              </p>
              <div className="flex gap-4">
                <button onClick={() => scrollTo('services')}
                  style={{ background: DARK, color: WARM }}
                  className="px-8 py-3.5 rounded-full text-sm hover:bg-amber-900 transition-colors duration-300">
                  Our Services
                </button>
                <button onClick={() => scrollTo('gallery')}
                  style={{ border: `2px solid rgba(200,120,10,0.3)`, color: AMBER }}
                  className="px-8 py-3.5 rounded-full text-sm hover:border-amber-600 transition-colors duration-300">
                  View Work
                </button>
              </div>
            </div>
            <div className="hidden md:block relative">
              <div className="rounded-2xl overflow-hidden shadow-2xl" style={{ aspectRatio: '4/5' }}>
                <img src="https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=900&q=85"
                  alt="Sol Salon" className="w-full h-full object-cover" />
              </div>
              <div style={{ position: 'absolute', bottom: -20, left: -20, background: GOLD, color: DARK, borderRadius: 12 }}
                className="px-5 py-4 shadow-xl">
                <p className="text-xl font-bold">4.9★</p>
                <p className="text-xs mt-0.5 font-medium">250+ Reviews</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" style={{ background: WARM }} className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8 mb-16">
            {[
              { n: '12+', l: 'Years of Excellence' },
              { n: '3,000+', l: 'Happy Clients' },
              { n: '99%', l: 'Would Recommend' },
            ].map(({ n, l }) => (
              <div key={l} style={{ background: CREAM, borderRadius: 16, border: `1px solid #F0DEBB` }} className="p-8 text-center">
                <p style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 48, color: AMBER }}>{n}</p>
                <p style={{ color: '#9A7040', fontSize: 14, letterSpacing: 1 }} className="mt-2">{l}</p>
              </div>
            ))}
          </div>
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <p style={{ color: AMBER, letterSpacing: 4, fontSize: 11 }} className="uppercase mb-4">About Sol</p>
              <h2 style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 'clamp(28px, 4vw, 44px)', color: DARK }} className="leading-tight mb-6">
                Capturing light in<br />every strand
              </h2>
              <p style={{ color: '#7A5020', lineHeight: 1.8, fontSize: 15 }} className="mb-5">
                Sol was born from a love of luminous colour — the kind that catches light, turns heads, and feels completely personal. Our team are masters of balayage and dimensional colouring techniques.
              </p>
              <p style={{ color: '#7A5020', lineHeight: 1.8, fontSize: 15 }}>
                Every appointment begins with an in-depth consultation to understand not just what you want, but how you live, style, and experience your hair day to day.
              </p>
            </div>
            <img src="https://images.pexels.com/photos/1813346/pexels-photo-1813346.jpeg?auto=compress&cs=tinysrgb&w=800&q=85"
              className="rounded-2xl w-full object-cover shadow-xl" style={{ aspectRatio: '4/3' }} alt="" />
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" style={{ background: CREAM }} className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p style={{ color: AMBER, letterSpacing: 4, fontSize: 11 }} className="uppercase mb-3">What We Offer</p>
            <h2 style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 44, color: DARK }}>Services</h2>
            <div style={{ width: 40, height: 2, background: GOLD }} className="mx-auto mt-4 rounded-full" />
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {services.map(({ name, price, popular }) => (
              <div key={name} style={{ background: popular ? `linear-gradient(135deg, ${WARM}, #FFE8B0)` : WARM, border: popular ? `1.5px solid ${GOLD}` : `1px solid #F0DEBB`, borderRadius: 12 }}
                className="p-5 flex justify-between items-center group hover:shadow-md transition-shadow duration-300">
                <div className="flex items-center gap-3">
                  {popular && <Sun size={14} style={{ color: GOLD }} />}
                  <span style={{ fontSize: 15, color: DARK, fontWeight: popular ? 500 : 400 }}>{name}</span>
                </div>
                <span style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 20, color: AMBER }}>{price}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* GALLERY */}
      <section id="gallery" style={{ background: WARM }} className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <p style={{ color: AMBER, letterSpacing: 4, fontSize: 11 }} className="uppercase text-center mb-3">Our Work</p>
          <h2 style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 44, color: DARK }} className="text-center mb-12">Portfolio</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {gallery.map((src, i) => (
              <div key={i} className="overflow-hidden rounded-2xl group shadow-sm hover:shadow-xl transition-shadow duration-300"
                style={{ aspectRatio: i % 3 === 1 ? '3/4' : '1/1' }}>
                <img src={src} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" style={{ background: DARK }} className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <p style={{ color: GOLD, letterSpacing: 4, fontSize: 11 }} className="uppercase text-center mb-3">Visit Us</p>
          <h2 style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 44, color: WARM }} className="text-center mb-14">Contact & Hours</h2>
          <div className="grid md:grid-cols-2 gap-16">
            <div className="space-y-8">
              {[
                { icon: <MapPin size={16} />, lines: ['220 Sunset Boulevard', 'West Hollywood, CA 90028'] },
                { icon: <Phone size={16} />, lines: ['(310) 555-0176'] },
                { icon: <Mail size={16} />, lines: ['glow@solhair.studio'] },
                { icon: <Clock size={16} />, lines: ['Tue–Fri: 10am – 8pm', 'Sat–Sun: 9am – 6pm'] },
              ].map(({ icon, lines }, i) => (
                <div key={i} className="flex gap-4">
                  <div style={{ color: GOLD, marginTop: 2 }}>{icon}</div>
                  <div>{lines.map(l => <p key={l} style={{ color: '#B09060', fontSize: 15 }}>{l}</p>)}</div>
                </div>
              ))}
              <div className="flex gap-3">
                {[<Instagram size={16} />, <Facebook size={16} />].map((ic, i) => (
                  <a key={i} href="#" style={{ border: `1px solid #3A2A10`, color: '#806040' }}
                    className="w-10 h-10 flex items-center justify-center hover:border-amber-700 hover:text-amber-500 transition-colors duration-300">{ic}</a>
                ))}
              </div>
            </div>
            <div style={{ background: '#1E1208', borderRadius: 16, border: `1px solid #3A2A10` }} className="p-8">
              <h3 style={{ fontFamily: "'Libre Baskerville', serif", fontSize: 24, color: WARM }} className="mb-6">Book an Appointment</h3>
              {['Name', 'Email', 'Phone'].map(p => (
                <input key={p} placeholder={p}
                  style={{ background: '#2A1A06', border: '1px solid #3A2A10', color: WARM, borderRadius: 8, display: 'block', width: '100%', padding: '12px 16px', marginBottom: 12, fontSize: 14, outline: 'none' }}
                  className="placeholder:text-amber-950 focus:border-amber-700 transition-colors duration-300" />
              ))}
              <textarea placeholder="Tell us about your hair goals..."
                style={{ background: '#2A1A06', border: '1px solid #3A2A10', color: WARM, borderRadius: 8, display: 'block', width: '100%', padding: '12px 16px', marginBottom: 16, fontSize: 14, outline: 'none', resize: 'none', height: 90 }}
                className="placeholder:text-amber-950 focus:border-amber-700 transition-colors duration-300" />
              <button style={{ background: `linear-gradient(135deg, ${AMBER}, ${GOLD})`, color: DARK, borderRadius: 8, width: '100%', padding: '14px 0', fontSize: 14 }}
                className="font-medium hover:opacity-90 transition-opacity duration-300">
                Request Appointment
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer style={{ background: '#1A0E04', borderTop: `1px solid #2A1A06` }} className="py-8 px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Sun size={16} style={{ color: GOLD }} strokeWidth={1.5} />
            <span style={{ fontFamily: "'Libre Baskerville', serif", color: '#806040', fontSize: 15 }}>Sol Studio</span>
          </div>
          <p style={{ color: '#3A2A10', fontSize: 12 }}>&copy; {new Date().getFullYear()} Sol Hair Studio. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
