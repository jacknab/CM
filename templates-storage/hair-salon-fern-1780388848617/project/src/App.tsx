import { useState, useEffect } from 'react';
import { MapPin, Phone, Mail, Clock, Instagram, Facebook, Menu, X } from 'lucide-react';

const SAGE = '#7A9A7A';
const FOREST = '#3A5A3A';
const WARM_GREY = '#9A9A90';
const LIGHT = '#F4F2EE';
const WARM = '#EAE6E0';
const DARK = '#2A2E2A';

const services = [
  { name: 'The Fern Cut', price: '$86' },
  { name: 'Natural Colour', price: '$158+' },
  { name: 'Forest Balayage', price: '$205+' },
  { name: 'Botanical Treatment', price: '$82' },
  { name: 'Soft Highlights', price: '$155+' },
  { name: 'Men\'s Natural Cut', price: '$70' },
  { name: 'Scalp Wellness', price: '$78' },
  { name: 'Curl Consultation', price: '$105' },
];

const gallery = [
  'https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/1570807/pexels-photo-1570807.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/3182742/pexels-photo-3182742.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/3997379/pexels-photo-3997379.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/2009901/pexels-photo-2009901.jpeg?auto=compress&cs=tinysrgb&w=500',
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
    <div style={{ background: LIGHT, color: DARK }} className="overflow-x-hidden">

      <nav style={{ background: scrolled ? 'rgba(244,242,238,0.97)' : 'transparent', backdropFilter: scrolled ? 'blur(12px)' : 'none', borderBottom: scrolled ? `1px solid ${WARM}` : 'none' }}
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-500 py-5 px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button onClick={() => scrollTo('hero')}>
            <span style={{ fontFamily: "'Zilla Slab', serif", fontSize: 22, color: DARK, letterSpacing: 1 }}>Fern & Co.</span>
          </button>
          <div className="hidden md:flex items-center gap-8">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)} style={{ color: WARM_GREY, fontSize: 13, fontWeight: 500 }}
                className="capitalize hover:text-green-700 transition-colors duration-300">{s}</button>
            ))}
            <button onClick={() => scrollTo('contact')} style={{ background: FOREST, color: 'white', borderRadius: 4 }}
              className="px-7 py-2.5 text-sm font-medium hover:opacity-90 transition-opacity duration-300">Book Now</button>
          </div>
          <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)} style={{ color: DARK }}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menuOpen && (
          <div style={{ background: LIGHT, borderTop: `1px solid ${WARM}` }} className="md:hidden px-8 py-4 space-y-4">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)} className="block capitalize" style={{ color: WARM_GREY }}>{s}</button>
            ))}
          </div>
        )}
      </nav>

      {/* HERO — textured, minimal with image accent */}
      <section id="hero" className="min-h-screen grid md:grid-cols-3">
        <div className="md:col-span-2 flex flex-col justify-center px-12 md:px-20 py-32 md:py-0">
          <div className="flex items-center gap-4 mb-6">
            <div style={{ width: 24, height: 24, border: `2px solid ${SAGE}`, borderRadius: '50%' }} />
            <p style={{ color: SAGE, letterSpacing: 4, fontSize: 11 }} className="uppercase">Natural Hair Studio</p>
          </div>
          <h1 style={{ fontFamily: "'Zilla Slab', serif", fontSize: 'clamp(44px, 7vw, 88px)', color: DARK, lineHeight: 1.0 }} className="mb-6">
            Understated.<br /><em>Natural.</em><br />Lasting.
          </h1>
          <p style={{ color: WARM_GREY, lineHeight: 1.9, fontSize: 15, maxWidth: 420 }} className="mb-10">
            Fern & Co. is a calm, considered hair studio for those who believe the best beauty is barely noticeable — until suddenly, everyone notices.
          </p>
          <div className="flex gap-4">
            <button onClick={() => scrollTo('contact')} style={{ background: FOREST, color: 'white' }}
              className="px-8 py-3.5 text-sm font-medium hover:opacity-90 transition-opacity duration-300">Book Now</button>
            <button onClick={() => scrollTo('services')} style={{ border: `1.5px solid ${WARM}`, color: WARM_GREY }}
              className="px-8 py-3.5 text-sm hover:border-green-400 transition-colors duration-300">Services</button>
          </div>
        </div>
        <div className="hidden md:block relative overflow-hidden">
          <img src="https://images.pexels.com/photos/1570807/pexels-photo-1570807.jpeg?auto=compress&cs=tinysrgb&w=800&q=85"
            className="w-full h-full object-cover" style={{ filter: 'saturate(0.7)' }} alt="" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(244,242,238,0.3) 0%, transparent 100%)' }} />
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" style={{ background: WARM }} className="py-24 px-6">
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <div className="grid grid-cols-2 gap-3">
            <img src="https://images.pexels.com/photos/3804040/pexels-photo-3804040.jpeg?auto=compress&cs=tinysrgb&w=500&q=80"
              className="w-full object-cover rounded-lg" style={{ aspectRatio: '4/5', filter: 'saturate(0.75)' }} alt="" />
            <div className="mt-8">
              <img src="https://images.pexels.com/photos/1327218/pexels-photo-1327218.jpeg?auto=compress&cs=tinysrgb&w=500&q=80"
                className="w-full object-cover rounded-lg" style={{ aspectRatio: '4/5', filter: 'saturate(0.75)' }} alt="" />
            </div>
          </div>
          <div>
            <p style={{ color: SAGE, letterSpacing: 4, fontSize: 11 }} className="uppercase mb-5">Our Philosophy</p>
            <h2 style={{ fontFamily: "'Zilla Slab', serif", fontSize: 'clamp(28px, 4vw, 46px)', color: DARK }} className="leading-tight mb-8">
              Hair that grows<br /><em>with you</em>
            </h2>
            <p style={{ color: WARM_GREY, lineHeight: 1.9, fontSize: 15 }} className="mb-5">
              At Fern & Co., we design cuts and colours that evolve gracefully as they grow out. No harsh lines that reveal neglect — just hair that continues looking intentional, month after month.
            </p>
            <p style={{ color: WARM_GREY, lineHeight: 1.9, fontSize: 15 }} className="mb-10">
              Seven stylists, all with a background in natural-finish hairdressing and a commitment to products that treat your scalp and strands with respect.
            </p>
            <div className="grid grid-cols-3 gap-5">
              {[['7', 'Stylists'], ['8+', 'Years'], ['★4.9', 'Google']].map(([n, l]) => (
                <div key={l} style={{ borderLeft: `2px solid ${SAGE}`, paddingLeft: 16 }}>
                  <p style={{ fontFamily: "'Zilla Slab', serif", fontSize: 32, color: FOREST }}>{n}</p>
                  <p style={{ color: WARM_GREY, fontSize: 11, letterSpacing: 2 }} className="uppercase mt-1">{l}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" style={{ background: LIGHT }} className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <p style={{ color: SAGE, letterSpacing: 4, fontSize: 11 }} className="uppercase mb-3">Menu</p>
            <h2 style={{ fontFamily: "'Zilla Slab', serif", fontSize: 44, color: DARK }}>Services</h2>
            <div style={{ width: 40, height: 2, background: SAGE, borderRadius: 2 }} className="mx-auto mt-4" />
          </div>
          {services.map(({ name, price }, i) => (
            <div key={name} className="group flex justify-between items-center py-5 hover:bg-gray-50 transition-colors duration-300 px-4 -mx-4"
              style={{ borderBottom: '1px solid #DEDAD4' }}>
              <span style={{ fontFamily: "'Zilla Slab', serif", fontSize: 18, color: DARK }}
                className="group-hover:text-green-800 transition-colors duration-300">{name}</span>
              <span style={{ fontFamily: "'Zilla Slab', serif", fontSize: 22, color: SAGE }}>{price}</span>
            </div>
          ))}
        </div>
      </section>

      {/* GALLERY */}
      <section id="gallery" style={{ background: WARM }} className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <p style={{ color: SAGE, letterSpacing: 4, fontSize: 11 }} className="uppercase text-center mb-3">Portfolio</p>
          <h2 style={{ fontFamily: "'Zilla Slab', serif", fontSize: 44, color: DARK }} className="text-center mb-12">Our Work</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {gallery.map((src, i) => (
              <div key={i} className="overflow-hidden rounded-lg group" style={{ aspectRatio: '4/5' }}>
                <img src={src} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  style={{ filter: 'saturate(0.8)' }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" style={{ background: DARK }} className="py-24 px-6 text-white">
        <div className="max-w-5xl mx-auto">
          <p style={{ color: SAGE, letterSpacing: 4, fontSize: 11 }} className="uppercase text-center mb-3">Visit</p>
          <h2 style={{ fontFamily: "'Zilla Slab', serif", fontSize: 44 }} className="text-center mb-14">Contact</h2>
          <div className="grid md:grid-cols-2 gap-16">
            <div className="space-y-7">
              {[
                { icon: <MapPin size={16} />, lines: ['11 Duke of York Square', 'London, SW3 4LY'] },
                { icon: <Phone size={16} />, lines: ['+44 20 7730 0176'] },
                { icon: <Mail size={16} />, lines: ['hello@fernandco.studio'] },
                { icon: <Clock size={16} />, lines: ['Mon–Sat: 9am – 7pm', 'Sun: 10am – 5pm'] },
              ].map(({ icon, lines }, i) => (
                <div key={i} className="flex gap-4">
                  <div style={{ color: SAGE, marginTop: 2 }}>{icon}</div>
                  <div>{lines.map(l => <p key={l} style={{ color: WARM_GREY, fontSize: 15 }}>{l}</p>)}</div>
                </div>
              ))}
              <div className="flex gap-3">
                {[<Instagram size={15} />, <Facebook size={15} />].map((ic, i) => (
                  <a key={i} href="#" style={{ border: `1px solid #3A3E3A`, color: WARM_GREY }}
                    className="w-10 h-10 flex items-center justify-center rounded-lg hover:border-green-600 hover:text-green-400 transition-colors duration-300">{ic}</a>
                ))}
              </div>
            </div>
            <div style={{ background: '#333836', borderRadius: 12 }} className="p-8">
              {['Name', 'Email', 'Phone'].map(p => (
                <input key={p} placeholder={p}
                  style={{ background: '#2A2E2A', border: '1px solid #3A3E3A', color: LIGHT, borderRadius: 8, display: 'block', width: '100%', padding: '12px 16px', marginBottom: 12, outline: 'none', fontSize: 14 }}
                  className="placeholder:text-gray-700 focus:border-green-600 transition-colors duration-300" />
              ))}
              <textarea placeholder="Service you'd like..."
                style={{ background: '#2A2E2A', border: '1px solid #3A3E3A', color: LIGHT, borderRadius: 8, display: 'block', width: '100%', padding: '12px 16px', marginBottom: 16, outline: 'none', fontSize: 14, resize: 'none', height: 80 }}
                className="placeholder:text-gray-700 focus:border-green-600 transition-colors duration-300" />
              <button style={{ background: SAGE, color: 'white', borderRadius: 8, width: '100%', padding: '14px 0', fontSize: 14 }}
                className="font-medium hover:opacity-90 transition-opacity duration-300">Book Appointment</button>
            </div>
          </div>
        </div>
      </section>

      <footer style={{ background: '#1E221E', borderTop: `1px solid #2A2E2A` }} className="py-8 px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <span style={{ fontFamily: "'Zilla Slab', serif", color: '#4A4E4A', fontSize: 16 }}>Fern & Co.</span>
          <p style={{ color: '#3A3E3A', fontSize: 12 }}>&copy; {new Date().getFullYear()} Fern & Co. Studio</p>
        </div>
      </footer>
    </div>
  );
}
