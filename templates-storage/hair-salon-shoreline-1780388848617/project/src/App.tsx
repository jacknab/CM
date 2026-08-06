import { useState, useEffect } from 'react';
import { MapPin, Phone, Mail, Clock, Instagram, Facebook, Menu, X, Wind } from 'lucide-react';

const OCEAN = '#3B7CB8';
const SAND = '#E8D5B0';
const SKY = '#EAF4FB';
const DRIFTWOOD = '#A0856A';
const DARK = '#1C3045';

const services = [
  { name: 'Coastal Cut', price: '$80', desc: 'Relaxed, effortless shape' },
  { name: 'Sun & Salt Balayage', price: '$195', desc: 'Natural, beachy dimension' },
  { name: 'Sea Mineral Treatment', price: '$85', desc: 'Deep hydration ritual' },
  { name: 'Highlight Toning', price: '$90', desc: 'Neutralise & perfect' },
  { name: 'Braids & Updos', price: '$75+', desc: 'Special occasion styling' },
  { name: 'Scalp & Root Care', price: '$70', desc: 'Nourishing scalp treatment' },
];

const heroImages = [
  'https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=1920&q=85',
  'https://images.pexels.com/photos/1570807/pexels-photo-1570807.jpeg?auto=compress&cs=tinysrgb&w=1920&q=85',
  'https://images.pexels.com/photos/3998429/pexels-photo-3998429.jpeg?auto=compress&cs=tinysrgb&w=1920&q=85',
];

const gallery = [
  'https://images.pexels.com/photos/1813346/pexels-photo-1813346.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/3065170/pexels-photo-3065170.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/3182742/pexels-photo-3182742.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/3997379/pexels-photo-3997379.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/2009901/pexels-photo-2009901.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/3190601/pexels-photo-3190601.jpeg?auto=compress&cs=tinysrgb&w=500',
];

export default function App() {
  const [slide, setSlide] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setSlide(s => (s + 1) % heroImages.length), 5500);
    return () => clearInterval(t);
  }, []);

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
    <div style={{ background: SKY, color: DARK }} className="overflow-x-hidden">

      {/* NAV */}
      <nav style={{ background: scrolled ? 'rgba(234,244,251,0.95)' : 'transparent', backdropFilter: scrolled ? 'blur(12px)' : 'none', boxShadow: scrolled ? '0 1px 20px rgba(59,124,184,0.1)' : 'none' }}
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-500 py-5 px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button onClick={() => scrollTo('hero')} className="flex items-center gap-2">
            <Wind size={20} style={{ color: OCEAN }} strokeWidth={1.5} />
            <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, color: DARK }}>Shoreline</span>
          </button>
          <div className="hidden md:flex items-center gap-8">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)}
                style={{ color: '#6A8AA8', fontSize: 14, fontWeight: 500 }}
                className="capitalize hover:text-blue-700 transition-colors duration-300">{s}</button>
            ))}
            <button onClick={() => scrollTo('contact')}
              style={{ background: OCEAN, color: 'white', borderRadius: 50 }}
              className="px-7 py-2.5 text-sm font-medium hover:bg-blue-700 transition-colors duration-300 shadow-sm">
              Book Now
            </button>
          </div>
          <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)} style={{ color: DARK }}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menuOpen && (
          <div style={{ background: SKY, borderTop: `1px solid #D0E8F4` }} className="md:hidden px-8 py-4 space-y-4">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)} className="block capitalize" style={{ color: '#6A8AA8' }}>{s}</button>
            ))}
          </div>
        )}
      </nav>

      {/* HERO */}
      <section id="hero" className="relative h-screen overflow-hidden">
        {heroImages.map((src, i) => (
          <div key={i} className="absolute inset-0 transition-opacity duration-2000"
            style={{ opacity: i === slide ? 1 : 0, transitionDuration: '2000ms' }}>
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${src})` }} />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(28,48,69,0.4) 0%, rgba(28,48,69,0.5) 100%)' }} />
          </div>
        ))}
        <div className="relative z-10 h-full flex flex-col items-start justify-center px-8 md:px-20 max-w-4xl">
          <div className="flex items-center gap-3 mb-6">
            <div style={{ width: 40, height: 2, background: 'rgba(255,255,255,0.6)', borderRadius: 2 }} />
            <p style={{ color: 'rgba(234,244,251,0.8)', letterSpacing: 4, fontSize: 11 }} className="uppercase">California Hair Co.</p>
          </div>
          <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 'clamp(48px, 8vw, 100px)', color: 'white', lineHeight: 0.95 }} className="mb-8">
            Hair that<br />moves with<br /><em>the breeze.</em>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.75)', lineHeight: 1.8, fontSize: 16, maxWidth: 440 }} className="mb-10">
            Effortless colour, lived-in cuts, and treatments that work with your natural texture. This is coastal hair care, elevated.
          </p>
          <div className="flex gap-4">
            <button onClick={() => scrollTo('contact')}
              style={{ background: OCEAN, color: 'white' }}
              className="px-8 py-3.5 rounded-full text-sm font-medium hover:bg-blue-600 transition-colors duration-300 shadow-lg">
              Book an Appointment
            </button>
            <button onClick={() => scrollTo('services')}
              style={{ border: `1.5px solid rgba(255,255,255,0.5)`, color: 'white' }}
              className="px-8 py-3.5 rounded-full text-sm font-medium hover:bg-white/10 transition-colors duration-300">
              Our Services
            </button>
          </div>
        </div>
        <div className="absolute bottom-8 right-10 z-10 flex gap-2">
          {heroImages.map((_, i) => (
            <button key={i} onClick={() => setSlide(i)}
              style={{ width: 8, height: 8, borderRadius: 50, background: i === slide ? 'white' : 'rgba(255,255,255,0.4)' }}
              className="transition-all duration-500" />
          ))}
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" style={{ background: 'white' }} className="py-24 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <img src="https://images.pexels.com/photos/3804040/pexels-photo-3804040.jpeg?auto=compress&cs=tinysrgb&w=800&q=85"
            className="rounded-3xl w-full object-cover shadow-lg" style={{ aspectRatio: '4/3' }} alt="" />
          <div>
            <p style={{ color: OCEAN, letterSpacing: 4, fontSize: 11 }} className="uppercase mb-4">Our Story</p>
            <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 'clamp(30px, 4vw, 50px)', color: DARK }} className="leading-tight mb-6">
              Born at the<br />water's edge
            </h2>
            <p style={{ color: '#5A7A98', lineHeight: 1.8, fontSize: 15 }} className="mb-5">
              Shoreline was created for people who love hair that feels like it belongs outdoors. Natural movement, effortless colour, and cuts designed for how you actually live your life.
            </p>
            <p style={{ color: '#5A7A98', lineHeight: 1.8, fontSize: 15 }} className="mb-10">
              Our team of seven stylists are all trained in California's leading salons, bringing sun-drenched colour expertise and a relaxed, welcoming vibe to every appointment.
            </p>
            <div className="flex gap-10">
              {[['7+', 'Stylists'], ['1,800+', 'Clients'], ['4.9★', 'Rating']].map(([n, l]) => (
                <div key={l}>
                  <p style={{ fontFamily: "'DM Serif Display', serif", fontSize: 36, color: OCEAN }}>{n}</p>
                  <p style={{ color: '#8AAABF', fontSize: 12, letterSpacing: 1 }} className="uppercase mt-1">{l}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" style={{ background: SKY }} className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p style={{ color: OCEAN, letterSpacing: 4, fontSize: 11 }} className="uppercase mb-3">Menu</p>
            <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 44, color: DARK }}>Services</h2>
            <div style={{ width: 40, height: 2, background: OCEAN, borderRadius: 2 }} className="mx-auto mt-4" />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {services.map(({ name, price, desc }) => (
              <div key={name} style={{ background: 'white', borderRadius: 16, border: `1px solid #D0E8F4` }}
                className="p-6 flex justify-between items-center hover:shadow-md hover:border-blue-200 transition-all duration-300 group">
                <div>
                  <h3 style={{ fontSize: 16, color: DARK, fontWeight: 600 }} className="mb-1">{name}</h3>
                  <p style={{ color: '#8AAABF', fontSize: 13 }}>{desc}</p>
                </div>
                <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, color: OCEAN }} className="ml-4 flex-shrink-0">{price}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* GALLERY */}
      <section id="gallery" style={{ background: '#E8F4FC' }} className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <p style={{ color: OCEAN, letterSpacing: 4, fontSize: 11 }} className="uppercase text-center mb-3">Portfolio</p>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 44, color: DARK }} className="text-center mb-12">Our Work</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {gallery.map((src, i) => (
              <div key={i} className="overflow-hidden rounded-2xl group shadow-sm hover:shadow-lg transition-shadow duration-300" style={{ aspectRatio: '1/1' }}>
                <img src={src} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" style={{ background: DARK }} className="py-24 px-6 text-white">
        <div className="max-w-5xl mx-auto">
          <p style={{ color: '#6A9DC4', letterSpacing: 4, fontSize: 11 }} className="uppercase text-center mb-3">Find Us</p>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 44 }} className="text-center mb-14">Contact</h2>
          <div className="grid md:grid-cols-2 gap-16">
            <div className="space-y-8">
              {[
                { icon: <MapPin size={16} />, lines: ['4 Shoreline Drive', 'Santa Cruz, CA 95060'] },
                { icon: <Phone size={16} />, lines: ['(831) 555-0218'] },
                { icon: <Mail size={16} />, lines: ['hello@shorelinehair.co'] },
                { icon: <Clock size={16} />, lines: ['Mon–Sat: 9am – 7pm', 'Sun: 10am – 5pm'] },
              ].map(({ icon, lines }, i) => (
                <div key={i} className="flex gap-4">
                  <div style={{ color: '#4A8AB8', marginTop: 2 }}>{icon}</div>
                  <div>{lines.map(l => <p key={l} style={{ color: '#6A8AA8', fontSize: 15 }}>{l}</p>)}</div>
                </div>
              ))}
              <div className="flex gap-3">
                {[<Instagram size={16} />, <Facebook size={16} />].map((ic, i) => (
                  <a key={i} href="#" style={{ border: `1px solid #2A4060`, color: '#4A7090' }}
                    className="w-10 h-10 flex items-center justify-center rounded-xl hover:border-blue-400 hover:text-blue-400 transition-colors duration-300">{ic}</a>
                ))}
              </div>
            </div>
            <div style={{ background: '#162638', borderRadius: 16, border: `1px solid #243A54` }} className="p-8">
              {['Name', 'Email', 'Phone'].map(p => (
                <input key={p} placeholder={p}
                  style={{ background: '#1C3045', border: '1px solid #2A4060', color: 'white', borderRadius: 10, display: 'block', width: '100%', padding: '12px 16px', marginBottom: 12, outline: 'none', fontSize: 14 }}
                  className="placeholder:text-slate-700 focus:border-blue-500 transition-colors duration-300" />
              ))}
              <textarea placeholder="Service you're interested in..."
                style={{ background: '#1C3045', border: '1px solid #2A4060', color: 'white', borderRadius: 10, display: 'block', width: '100%', padding: '12px 16px', marginBottom: 16, outline: 'none', fontSize: 14, resize: 'none', height: 90 }}
                className="placeholder:text-slate-700 focus:border-blue-500 transition-colors duration-300" />
              <button style={{ background: OCEAN, color: 'white', borderRadius: 10, width: '100%', padding: '14px 0', fontSize: 14 }}
                className="font-medium hover:bg-blue-600 transition-colors duration-300">
                Book an Appointment
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer style={{ background: '#0E1E30', borderTop: `1px solid #1C3045` }} className="py-8 px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Wind size={16} style={{ color: '#4A7090' }} strokeWidth={1.5} />
            <span style={{ fontFamily: "'DM Serif Display', serif", color: '#4A7090', fontSize: 15 }}>Shoreline</span>
          </div>
          <p style={{ color: '#2A4060', fontSize: 12 }}>&copy; {new Date().getFullYear()} Shoreline Hair Co.</p>
        </div>
      </footer>
    </div>
  );
}
