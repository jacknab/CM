import { useState, useEffect } from 'react';
import { MapPin, Phone, Mail, Clock, Instagram, Menu, X, Heart } from 'lucide-react';

const MAUVE = '#9B6B8A';
const PETAL = '#E8C4D4';
const BLUSH = '#F5E4EC';
const CREAM = '#FBF7F9';
const DEEP = '#3D1A2E';
const ROSE = '#C48AA0';

const services = [
  { name: 'The Petal Cut', price: '$92', love: true },
  { name: 'Romantic Colour', price: '$175+', love: false },
  { name: 'Rosy Balayage', price: '$220+', love: true },
  { name: 'Silk Gloss Treatment', price: '$88', love: false },
  { name: 'Soft Highlights', price: '$165+', love: false },
  { name: 'Bridal Styling', price: '$150+', love: true },
  { name: 'Curl Romance', price: '$110', love: false },
  { name: 'Colour Refresh', price: '$95', love: false },
];

const gallery = [
  'https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/3182742/pexels-photo-3182742.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/1813346/pexels-photo-1813346.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/1570807/pexels-photo-1570807.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/3804040/pexels-photo-3804040.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/1327218/pexels-photo-1327218.jpeg?auto=compress&cs=tinysrgb&w=500',
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
    <div style={{ background: CREAM, color: DEEP }} className="overflow-x-hidden">

      {/* NAV */}
      <nav style={{ background: scrolled ? 'rgba(251,247,249,0.96)' : 'transparent', backdropFilter: scrolled ? 'blur(12px)' : 'none', boxShadow: scrolled ? '0 1px 20px rgba(155,107,138,0.08)' : 'none' }}
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-500 py-5 px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button onClick={() => scrollTo('hero')} className="flex items-center gap-2">
            <Heart size={18} style={{ color: ROSE }} fill={ROSE} />
            <span style={{ fontFamily: "'Bodoni Moda', serif", fontSize: 20, color: DEEP, letterSpacing: 2 }}>Petal</span>
          </button>
          <div className="hidden md:flex items-center gap-8">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)}
                style={{ color: MAUVE, fontSize: 13 }}
                className="capitalize hover:text-pink-600 transition-colors duration-300">{s}</button>
            ))}
            <button onClick={() => scrollTo('contact')}
              style={{ background: MAUVE, color: 'white', borderRadius: 50 }}
              className="px-7 py-2.5 text-sm hover:opacity-90 transition-opacity duration-300">
              Book
            </button>
          </div>
          <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)} style={{ color: DEEP }}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menuOpen && (
          <div style={{ background: CREAM, borderTop: `1px solid ${PETAL}` }} className="md:hidden px-8 py-4 space-y-4">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)} className="block capitalize" style={{ color: MAUVE }}>{s}</button>
            ))}
          </div>
        )}
      </nav>

      {/* HERO — centered, romantic, full-bleed */}
      <section id="hero" className="relative h-screen overflow-hidden">
        <img src="https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=1920&q=85"
          className="absolute inset-0 w-full h-full object-cover" alt="" style={{ filter: 'saturate(0.7) hue-rotate(330deg)' }} />
        <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, rgba(61,26,46,0.7) 0%, rgba(61,26,46,0.6) 100%)` }} />
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-6">
          <Heart size={24} style={{ color: PETAL, marginBottom: 20 }} fill={PETAL} />
          <p style={{ color: PETAL, letterSpacing: 6, fontSize: 11 }} className="uppercase mb-5">For the Romantic Soul</p>
          <h1 style={{ fontFamily: "'Bodoni Moda', serif", fontSize: 'clamp(56px, 10vw, 120px)', color: CREAM, lineHeight: 0.9 }} className="mb-6">
            Petal
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
            <div style={{ width: 50, height: 1, background: `rgba(232,196,212,0.5)` }} />
            <Heart size={12} style={{ color: ROSE }} fill={ROSE} />
            <div style={{ width: 50, height: 1, background: `rgba(232,196,212,0.5)` }} />
          </div>
          <p style={{ color: 'rgba(245,228,236,0.8)', lineHeight: 1.9, fontSize: 16, maxWidth: 420 }} className="mb-10">
            Soft colour, delicate cuts, and a salon experience designed to make you feel like the most beautiful version of yourself.
          </p>
          <div className="flex gap-4">
            <button onClick={() => scrollTo('contact')}
              style={{ background: ROSE, color: 'white', borderRadius: 50 }}
              className="px-8 py-3.5 text-sm hover:opacity-90 transition-opacity duration-300 shadow-lg">
              Book Now
            </button>
            <button onClick={() => scrollTo('services')}
              style={{ border: `1.5px solid rgba(232,196,212,0.5)`, color: PETAL, borderRadius: 50 }}
              className="px-8 py-3.5 text-sm hover:bg-white/10 transition-colors duration-300">
              Services
            </button>
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" style={{ background: BLUSH }} className="py-24 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <Heart size={28} style={{ color: ROSE, margin: '0 auto 20px' }} fill={ROSE} />
          <p style={{ color: ROSE, letterSpacing: 5, fontSize: 11 }} className="uppercase mb-4">Our Story</p>
          <h2 style={{ fontFamily: "'Bodoni Moda', serif", fontSize: 'clamp(30px, 5vw, 56px)', color: DEEP }} className="mb-6 leading-tight">
            Beauty is an act<br />of <em>self-love</em>
          </h2>
          <p style={{ color: MAUVE, lineHeight: 1.9, fontSize: 15, maxWidth: 560, margin: '0 auto 48px' }}>
            Petal was created for the woman who believes in taking care of herself — properly, lovingly, without rushing. Our boutique studio offers an unhurried, immersive experience with a team who genuinely love what they do.
          </p>
          <div className="grid md:grid-cols-3 gap-5 max-w-3xl mx-auto">
            {[
              { icon: '🌸', title: 'Bespoke Service', desc: 'Every appointment is tailored entirely to you.' },
              { icon: '✨', title: 'Premium Products', desc: 'Only the most luxurious, professional-grade ranges.' },
              { icon: '💕', title: 'Loving Craft', desc: 'We care deeply about every client who sits in our chair.' },
            ].map(({ icon, title, desc }) => (
              <div key={title} style={{ background: 'white', borderRadius: 20, border: `1px solid ${PETAL}` }} className="p-6">
                <p className="text-2xl mb-3">{icon}</p>
                <h3 style={{ fontFamily: "'Bodoni Moda', serif", fontSize: 18, color: DEEP }} className="mb-2">{title}</h3>
                <p style={{ color: MAUVE, fontSize: 13, lineHeight: 1.6 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" style={{ background: CREAM }} className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p style={{ color: ROSE, letterSpacing: 5, fontSize: 11 }} className="uppercase mb-3">Menu</p>
            <h2 style={{ fontFamily: "'Bodoni Moda', serif", fontSize: 44, color: DEEP }}>Services</h2>
            <div style={{ width: 40, height: 2, background: PETAL, borderRadius: 2 }} className="mx-auto mt-4" />
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            {services.map(({ name, price, love }) => (
              <div key={name} style={{ background: love ? BLUSH : 'white', border: love ? `1.5px solid ${PETAL}` : `1px solid ${PETAL}`, borderRadius: 16 }}
                className="px-6 py-5 flex justify-between items-center hover:shadow-sm transition-shadow duration-300">
                <div className="flex items-center gap-3">
                  {love && <Heart size={14} style={{ color: ROSE }} fill={ROSE} />}
                  <span style={{ fontFamily: "'Bodoni Moda', serif", fontSize: 16, color: DEEP }}>{name}</span>
                </div>
                <span style={{ fontFamily: "'Bodoni Moda', serif", fontSize: 22, color: MAUVE }} className="flex-shrink-0 ml-4">{price}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* GALLERY */}
      <section id="gallery" style={{ background: BLUSH }} className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <p style={{ color: ROSE, letterSpacing: 5, fontSize: 11 }} className="uppercase text-center mb-3">Portfolio</p>
          <h2 style={{ fontFamily: "'Bodoni Moda', serif", fontSize: 44, color: DEEP }} className="text-center mb-12">Gallery</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {gallery.map((src, i) => (
              <div key={i} className="overflow-hidden rounded-3xl group" style={{ aspectRatio: '4/5' }}>
                <img src={src} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  style={{ filter: 'saturate(0.85)' }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" style={{ background: DEEP }} className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <Heart size={22} style={{ color: ROSE, margin: '0 auto 16px' }} fill={ROSE} />
            <h2 style={{ fontFamily: "'Bodoni Moda', serif", fontSize: 44, color: CREAM }}>Book With Us</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-16">
            <div className="space-y-7">
              {[
                { icon: <MapPin size={16} />, lines: ['9 Sloane Street', 'London, SW1X 9LE'] },
                { icon: <Phone size={16} />, lines: ['+44 20 7235 0178'] },
                { icon: <Mail size={16} />, lines: ['hello@petalhair.co.uk'] },
                { icon: <Clock size={16} />, lines: ['Tue–Sat: 9am – 8pm', 'Sun: 10am – 5pm'] },
              ].map(({ icon, lines }, i) => (
                <div key={i} className="flex gap-4">
                  <div style={{ color: ROSE, marginTop: 2 }}>{icon}</div>
                  <div>{lines.map(l => <p key={l} style={{ color: '#A08090', fontSize: 15 }}>{l}</p>)}</div>
                </div>
              ))}
              <a href="#" style={{ border: `1px solid #5D3452`, color: MAUVE }}
                className="w-10 h-10 inline-flex items-center justify-center rounded-xl hover:border-pink-400 hover:text-pink-300 transition-colors duration-300">
                <Instagram size={15} />
              </a>
            </div>
            <div style={{ background: '#4A2038', borderRadius: 20, border: `1px solid #5D3452` }} className="p-8">
              {['Name', 'Email', 'Phone'].map(p => (
                <input key={p} placeholder={p}
                  style={{ background: '#3D1A2E', border: '1px solid #5D3452', color: CREAM, borderRadius: 12, display: 'block', width: '100%', padding: '12px 16px', marginBottom: 12, outline: 'none', fontSize: 14 }}
                  className="placeholder:text-purple-950 focus:border-pink-400 transition-colors duration-300" />
              ))}
              <textarea placeholder="Service you'd like..."
                style={{ background: '#3D1A2E', border: '1px solid #5D3452', color: CREAM, borderRadius: 12, display: 'block', width: '100%', padding: '12px 16px', marginBottom: 16, outline: 'none', fontSize: 14, resize: 'none', height: 80 }}
                className="placeholder:text-purple-950 focus:border-pink-400 transition-colors duration-300" />
              <button style={{ background: ROSE, color: 'white', borderRadius: 12, width: '100%', padding: '14px 0', fontSize: 14 }}
                className="hover:opacity-90 transition-opacity duration-300">
                Book Appointment
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer style={{ background: '#2A1020', borderTop: `1px solid #3D1A2E` }} className="py-8 px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Heart size={14} style={{ color: ROSE }} fill={ROSE} />
            <span style={{ fontFamily: "'Bodoni Moda', serif", color: MAUVE, fontSize: 16 }}>Petal</span>
          </div>
          <p style={{ color: '#4D2A3A', fontSize: 12 }}>&copy; {new Date().getFullYear()} Petal Hair Studio</p>
        </div>
      </footer>
    </div>
  );
}
