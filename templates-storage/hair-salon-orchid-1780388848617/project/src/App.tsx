import { useState, useEffect } from 'react';
import { MapPin, Phone, Mail, Clock, Instagram, Menu, X } from 'lucide-react';

const PURPLE = '#4A1A6A';
const VIOLET = '#7A3A9A';
const LAVENDER = '#C8A0E8';
const BLUSH = '#EFE0F8';
const CREAM = '#FAF6FE';
const DEEP = '#2A0E3E';

const services = [
  { name: 'Orchid Cut', price: '$105', bloom: true },
  { name: 'Violet Colour', price: '$195+', bloom: false },
  { name: 'Amethyst Balayage', price: '$255+', bloom: true },
  { name: 'Lavender Toning', price: '$130', bloom: false },
  { name: 'Silk Repair Treatment', price: '$98', bloom: false },
  { name: 'Orchid Highlights', price: '$175+', bloom: false },
  { name: 'Blowout & Finish', price: '$70', bloom: false },
  { name: 'Scalp Ritual', price: '$85', bloom: false },
];

const gallery = [
  'https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/1570807/pexels-photo-1570807.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/3182742/pexels-photo-3182742.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/3804040/pexels-photo-3804040.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/1813346/pexels-photo-1813346.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/3997379/pexels-photo-3997379.jpeg?auto=compress&cs=tinysrgb&w=500',
];

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [slide, setSlide] = useState(0);

  const heroImages = [
    'https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=1920&q=85',
    'https://images.pexels.com/photos/3182742/pexels-photo-3182742.jpeg?auto=compress&cs=tinysrgb&w=1920&q=85',
  ];

  useEffect(() => {
    const t = setInterval(() => setSlide(s => (s + 1) % heroImages.length), 6000);
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
    <div style={{ background: CREAM, color: DEEP }} className="overflow-x-hidden">

      <nav style={{ background: scrolled ? 'rgba(250,246,254,0.97)' : 'transparent', backdropFilter: scrolled ? 'blur(12px)' : 'none', boxShadow: scrolled ? '0 1px 20px rgba(74,26,106,0.08)' : 'none' }}
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-500 py-5 px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button onClick={() => scrollTo('hero')}>
            <span style={{ fontFamily: "'Bodoni Moda', serif", fontSize: 22, color: DEEP, letterSpacing: 3, fontStyle: 'italic' }}>Orchid</span>
          </button>
          <div className="hidden md:flex items-center gap-8">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)} style={{ color: VIOLET, fontSize: 13 }}
                className="capitalize hover:text-purple-800 transition-colors duration-300">{s}</button>
            ))}
            <button onClick={() => scrollTo('contact')} style={{ background: PURPLE, color: 'white', borderRadius: 50 }}
              className="px-7 py-2.5 text-sm hover:opacity-90 transition-opacity duration-300 shadow-sm">Book Now</button>
          </div>
          <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)} style={{ color: DEEP }}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menuOpen && (
          <div style={{ background: CREAM, borderTop: `1px solid ${BLUSH}` }} className="md:hidden px-8 py-4 space-y-4">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)} className="block capitalize" style={{ color: VIOLET }}>{s}</button>
            ))}
          </div>
        )}
      </nav>

      {/* HERO */}
      <section id="hero" className="relative h-screen overflow-hidden">
        {heroImages.map((src, i) => (
          <div key={i} className="absolute inset-0 transition-opacity duration-3000"
            style={{ opacity: i === slide ? 1 : 0, transitionDuration: '3000ms' }}>
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${src})`, filter: 'hue-rotate(240deg) saturate(0.6)' }} />
            <div className="absolute inset-0" style={{ background: `linear-gradient(160deg, rgba(74,26,106,0.88) 0%, rgba(42,14,62,0.75) 100%)` }} />
          </div>
        ))}
        {/* Orchid petal shapes */}
        <div className="absolute top-20 right-16 pointer-events-none opacity-10" style={{ width: 200, height: 200, borderRadius: '60% 40% 60% 40%', border: `1px solid ${LAVENDER}` }} />
        <div className="absolute bottom-20 left-10 pointer-events-none opacity-8" style={{ width: 120, height: 120, borderRadius: '40% 60% 40% 60%', border: `1px solid ${LAVENDER}` }} />
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-6">
          <p className="text-4xl mb-5 opacity-60">🌸</p>
          <p style={{ color: LAVENDER, letterSpacing: 6, fontSize: 11 }} className="uppercase mb-5">Luxury Hair Atelier</p>
          <h1 style={{ fontFamily: "'Bodoni Moda', serif", fontSize: 'clamp(56px, 10vw, 120px)', color: CREAM, lineHeight: 0.9, fontStyle: 'italic' }}
            className="mb-6">Orchid</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
            <div style={{ width: 50, height: 1, background: `linear-gradient(to right, transparent, ${LAVENDER})` }} />
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: LAVENDER }} />
            <div style={{ width: 50, height: 1, background: `linear-gradient(to left, transparent, ${LAVENDER})` }} />
          </div>
          <p style={{ color: 'rgba(239,224,248,0.85)', lineHeight: 1.9, fontSize: 16, maxWidth: 440 }} className="mb-12">
            For those who see hair as a statement of self. Dramatic, considered, and deeply feminine — hair that makes you feel extraordinary.
          </p>
          <div className="flex gap-5">
            <button onClick={() => scrollTo('contact')} style={{ background: LAVENDER, color: DEEP, borderRadius: 50 }}
              className="px-8 py-3.5 text-sm font-medium hover:opacity-90 transition-opacity duration-300 shadow-lg">Book Now</button>
            <button onClick={() => scrollTo('services')} style={{ border: `1.5px solid rgba(200,160,232,0.4)`, color: LAVENDER, borderRadius: 50 }}
              className="px-8 py-3.5 text-sm hover:bg-white/10 transition-colors duration-300">Services</button>
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" style={{ background: BLUSH }} className="py-24 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <div className="relative">
            <img src="https://images.pexels.com/photos/3190601/pexels-photo-3190601.jpeg?auto=compress&cs=tinysrgb&w=800&q=85"
              className="w-full object-cover rounded-2xl" style={{ aspectRatio: '4/5', filter: 'hue-rotate(240deg) saturate(0.6)' }} alt="" />
            <div style={{ position: 'absolute', bottom: -10, right: -10, width: 80, height: 80, borderRadius: '60% 40% 60% 40%', background: `linear-gradient(135deg, ${VIOLET}, ${LAVENDER})`, opacity: 0.4 }} />
          </div>
          <div>
            <p style={{ color: VIOLET, letterSpacing: 5, fontSize: 11 }} className="uppercase mb-5">Our Vision</p>
            <h2 style={{ fontFamily: "'Bodoni Moda', serif", fontSize: 'clamp(30px, 5vw, 54px)', color: DEEP, fontStyle: 'italic' }} className="leading-tight mb-8">
              Where drama<br />meets delicacy
            </h2>
            <div style={{ width: 40, height: 2, background: `linear-gradient(to right, ${VIOLET}, ${LAVENDER})`, borderRadius: 2 }} className="mb-8" />
            <p style={{ color: VIOLET, lineHeight: 1.9, fontSize: 15 }} className="mb-5">
              Orchid was built for those who believe beauty should be extraordinary. Our six colourists specialise in the rich, complex tones of violets, plums, mauves, and lavenders — as well as the full spectrum of classic colour work.
            </p>
            <p style={{ color: VIOLET, lineHeight: 1.9, fontSize: 15 }} className="mb-10">
              Every appointment is an experience. Champagne on arrival, unhurried consultations, and hair that lives in your memory long after you leave.
            </p>
            <div className="flex gap-10">
              {[['6', 'Colourists'], ['5+', 'Years'], ['★5.0', 'Google']].map(([n, l]) => (
                <div key={l}>
                  <p style={{ fontFamily: "'Bodoni Moda', serif", fontSize: 38, color: VIOLET, fontStyle: 'italic' }}>{n}</p>
                  <p style={{ color: '#9A70BA', fontSize: 11, letterSpacing: 2 }} className="uppercase mt-1">{l}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" style={{ background: CREAM }} className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p style={{ color: VIOLET, letterSpacing: 5, fontSize: 11 }} className="uppercase mb-3">Menu</p>
            <h2 style={{ fontFamily: "'Bodoni Moda', serif", fontSize: 44, color: DEEP, fontStyle: 'italic' }}>Services</h2>
            <div style={{ width: 40, height: 2, background: `linear-gradient(to right, ${VIOLET}, ${LAVENDER})`, borderRadius: 2 }} className="mx-auto mt-4" />
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {services.map(({ name, price, bloom }) => (
              <div key={name} style={{ background: bloom ? BLUSH : 'white', border: bloom ? `1.5px solid ${LAVENDER}` : `1px solid ${BLUSH}`, borderRadius: 16 }}
                className="px-6 py-5 flex justify-between items-center hover:shadow-md hover:border-purple-300 transition-all duration-300">
                <div className="flex items-center gap-2">
                  {bloom && <span style={{ fontSize: 14 }}>🌸</span>}
                  <span style={{ fontFamily: "'Bodoni Moda', serif", fontSize: 16, color: DEEP, fontStyle: 'italic' }}>{name}</span>
                </div>
                <span style={{ fontFamily: "'Bodoni Moda', serif", fontSize: 22, color: VIOLET, fontStyle: 'italic' }} className="ml-4 flex-shrink-0">{price}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* GALLERY */}
      <section id="gallery" style={{ background: BLUSH }} className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <p style={{ color: VIOLET, letterSpacing: 5, fontSize: 11 }} className="uppercase text-center mb-3">Portfolio</p>
          <h2 style={{ fontFamily: "'Bodoni Moda', serif", fontSize: 44, color: DEEP, fontStyle: 'italic' }} className="text-center mb-12">Gallery</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {gallery.map((src, i) => (
              <div key={i} className="overflow-hidden rounded-3xl group" style={{ aspectRatio: '4/5' }}>
                <img src={src} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  style={{ filter: 'hue-rotate(240deg) saturate(0.5)' }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" style={{ background: DEEP }} className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <p className="text-3xl text-center mb-4 opacity-40">🌸</p>
          <p style={{ color: LAVENDER, letterSpacing: 5, fontSize: 11 }} className="uppercase text-center mb-3">Reserve</p>
          <h2 style={{ fontFamily: "'Bodoni Moda', serif", fontSize: 44, color: CREAM, fontStyle: 'italic' }} className="text-center mb-14">Contact</h2>
          <div className="grid md:grid-cols-2 gap-16">
            <div className="space-y-7">
              {[
                { icon: <MapPin size={16} />, lines: ['24 Beauchamp Place', 'London, SW3 1NJ'] },
                { icon: <Phone size={16} />, lines: ['+44 20 7584 0196'] },
                { icon: <Mail size={16} />, lines: ['reserve@orchid.studio'] },
                { icon: <Clock size={16} />, lines: ['Tue–Sat: 10am – 8pm', 'Sun: Noon – 6pm'] },
              ].map(({ icon, lines }, i) => (
                <div key={i} className="flex gap-4">
                  <div style={{ color: LAVENDER, marginTop: 2 }}>{icon}</div>
                  <div>{lines.map(l => <p key={l} style={{ color: '#8A60AA', fontSize: 15 }}>{l}</p>)}</div>
                </div>
              ))}
              <a href="#" style={{ border: `1px solid #4A2A6A`, color: '#8A60AA' }}
                className="w-10 h-10 inline-flex items-center justify-center rounded-xl hover:border-purple-400 hover:text-purple-300 transition-colors duration-300">
                <Instagram size={15} />
              </a>
            </div>
            <div style={{ background: '#3A1858', borderRadius: 20, border: `1px solid #4A2A6A` }} className="p-8">
              {['Name', 'Email', 'Phone'].map(p => (
                <input key={p} placeholder={p}
                  style={{ background: '#2A0E3E', border: '1px solid #4A2A6A', color: CREAM, borderRadius: 12, display: 'block', width: '100%', padding: '12px 16px', marginBottom: 12, outline: 'none', fontSize: 14 }}
                  className="placeholder:text-purple-950 focus:border-purple-400 transition-colors duration-300" />
              ))}
              <textarea placeholder="Service you'd like..."
                style={{ background: '#2A0E3E', border: '1px solid #4A2A6A', color: CREAM, borderRadius: 12, display: 'block', width: '100%', padding: '12px 16px', marginBottom: 16, outline: 'none', fontSize: 14, resize: 'none', height: 80 }}
                className="placeholder:text-purple-950 focus:border-purple-400 transition-colors duration-300" />
              <button style={{ background: `linear-gradient(135deg, ${VIOLET}, ${LAVENDER})`, color: 'white', borderRadius: 12, width: '100%', padding: '14px 0', fontSize: 14 }}
                className="font-medium hover:opacity-90 transition-opacity duration-300">Reserve Appointment</button>
            </div>
          </div>
        </div>
      </section>

      <footer style={{ background: '#1A0828', borderTop: `1px solid #2A0E3E` }} className="py-8 px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <span style={{ fontFamily: "'Bodoni Moda', serif", color: '#4A2A6A', fontSize: 18, fontStyle: 'italic' }}>Orchid</span>
          <p style={{ color: '#2A0E3E', fontSize: 12 }}>&copy; {new Date().getFullYear()} Orchid Atelier</p>
        </div>
      </footer>
    </div>
  );
}
