import { useState, useEffect } from 'react';
import { MapPin, Phone, Mail, Clock, Instagram, Facebook, Menu, X, Leaf } from 'lucide-react';

const FOREST = '#2C5F2E';
const SAGE = '#7BA05B';
const CREAM = '#F4F0E8';
const WARM = '#E8E2D5';
const DARK = '#1A2E1A';

const services = [
  { name: 'Botanical Cut', desc: 'Tailored to your texture', price: '$90' },
  { name: 'Plant-Based Color', desc: 'Henna & organic tints', price: '$150+' },
  { name: 'Deep Nourish Treatment', desc: 'Argan & rosehip oils', price: '$85' },
  { name: 'Herbal Scalp Ritual', desc: 'Botanical infusion', price: '$70' },
  { name: 'Natural Balayage', desc: 'Sun-kissed dimension', price: '$195' },
  { name: 'Curl Definition', desc: 'Curl consultation & cut', price: '$110' },
];

const galleryImages = [
  'https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=500&q=80',
  'https://images.pexels.com/photos/1570807/pexels-photo-1570807.jpeg?auto=compress&cs=tinysrgb&w=500&q=80',
  'https://images.pexels.com/photos/3182742/pexels-photo-3182742.jpeg?auto=compress&cs=tinysrgb&w=500&q=80',
  'https://images.pexels.com/photos/3998429/pexels-photo-3998429.jpeg?auto=compress&cs=tinysrgb&w=500&q=80',
  'https://images.pexels.com/photos/1813346/pexels-photo-1813346.jpeg?auto=compress&cs=tinysrgb&w=500&q=80',
  'https://images.pexels.com/photos/3065170/pexels-photo-3065170.jpeg?auto=compress&cs=tinysrgb&w=500&q=80',
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
      <nav style={{ background: scrolled ? 'rgba(244,240,232,0.95)' : 'transparent', backdropFilter: scrolled ? 'blur(10px)' : 'none', boxShadow: scrolled ? '0 1px 20px rgba(44,95,46,0.08)' : 'none' }}
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-500 py-5 px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button onClick={() => scrollTo('hero')} className="flex items-center gap-3">
            <Leaf size={22} style={{ color: FOREST }} />
            <span style={{ fontFamily: "'Lora', serif", fontSize: 20, color: DARK, letterSpacing: 1 }}>Botanica</span>
          </button>
          <div className="hidden md:flex items-center gap-8">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)}
                style={{ color: '#6B7B5A', fontSize: 13, letterSpacing: 1 }}
                className="capitalize hover:text-green-800 transition-colors duration-300">{s}</button>
            ))}
            <button onClick={() => scrollTo('contact')}
              style={{ background: FOREST, color: CREAM, letterSpacing: 1, fontSize: 13 }}
              className="px-6 py-2.5 rounded-full hover:opacity-90 transition-opacity duration-300">
              Book Now
            </button>
          </div>
          <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)} style={{ color: DARK }}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menuOpen && (
          <div style={{ background: CREAM, borderTop: `1px solid ${WARM}` }} className="md:hidden px-8 py-4 space-y-4">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)} className="block w-full text-left capitalize"
                style={{ color: '#6B7B5A', fontSize: 14 }}>{s}</button>
            ))}
          </div>
        )}
      </nav>

      {/* HERO - SPLIT */}
      <section id="hero" className="min-h-screen grid md:grid-cols-2">
        <div className="relative overflow-hidden" style={{ minHeight: 500 }}>
          <img src="https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=1000&q=85"
            alt="Botanica" className="w-full h-full object-cover" style={{ minHeight: 500 }} />
          <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, rgba(44,95,46,0.3) 0%, transparent 60%)` }} />
        </div>
        <div style={{ background: WARM }} className="flex flex-col justify-center px-12 md:px-16 py-24 md:py-0">
          <div className="flex items-center gap-3 mb-6">
            <div style={{ width: 32, height: 1, background: SAGE }} />
            <p style={{ color: SAGE, letterSpacing: 4, fontSize: 11 }} className="uppercase">Natural Hair Studio</p>
          </div>
          <h1 style={{ fontFamily: "'Lora', serif", fontSize: 'clamp(38px, 5vw, 64px)', color: DARK, lineHeight: 1.1 }} className="mb-6">
            Hair Care<br />Rooted in<br /><em>Nature</em>
          </h1>
          <p style={{ color: '#6B7B5A', lineHeight: 1.8, fontSize: 15, maxWidth: 380 }} className="mb-10">
            We believe in beauty that works with nature, not against it. Every treatment uses organic, plant-based ingredients that nourish from root to tip.
          </p>
          <div className="flex gap-4">
            <button onClick={() => scrollTo('services')}
              style={{ background: FOREST, color: CREAM }}
              className="px-8 py-3.5 rounded-full text-sm hover:opacity-90 transition-opacity duration-300">
              Explore Services
            </button>
            <button onClick={() => scrollTo('about')}
              style={{ border: `1.5px solid ${SAGE}`, color: FOREST }}
              className="px-8 py-3.5 rounded-full text-sm hover:bg-green-50 transition-colors duration-300">
              Our Story
            </button>
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" style={{ background: '#EDE8DC' }} className="py-24 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <Leaf size={32} style={{ color: SAGE, margin: '0 auto 20px' }} />
          <p style={{ color: SAGE, letterSpacing: 4, fontSize: 11 }} className="uppercase mb-4">Our Approach</p>
          <h2 style={{ fontFamily: "'Lora', serif", fontSize: 'clamp(28px, 4vw, 46px)', color: DARK }} className="mb-6 leading-tight">
            Beauty Without Compromise
          </h2>
          <p style={{ color: '#6B7B5A', lineHeight: 1.9, fontSize: 15, maxWidth: 640, margin: '0 auto 60px' }}>
            At Botanica, we've spent years perfecting formulas that harness the power of botanical extracts, essential oils, and plant-based pigments. Our stylists are trained in both artistry and holistic hair wellness.
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: '🌿', title: 'Organic Products', desc: 'Only certified organic, cruelty-free products in our studio.' },
              { icon: '🍃', title: 'Gentle Formulas', desc: 'No harsh chemicals — safe for sensitive scalps and hair.' },
              { icon: '🌱', title: 'Sustainable Practice', desc: 'Eco-conscious studio with zero-waste commitment.' },
            ].map(({ icon, title, desc }) => (
              <div key={title} style={{ background: WARM, borderRadius: 16 }} className="p-8 text-left">
                <p className="text-3xl mb-4">{icon}</p>
                <h3 style={{ fontFamily: "'Lora', serif", fontSize: 20, color: DARK }} className="mb-3">{title}</h3>
                <p style={{ color: '#7A8B6A', fontSize: 14, lineHeight: 1.7 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" style={{ background: CREAM }} className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p style={{ color: SAGE, letterSpacing: 4, fontSize: 11 }} className="uppercase mb-3">Menu</p>
            <h2 style={{ fontFamily: "'Lora', serif", fontSize: 44, color: DARK }}>Services</h2>
            <div style={{ width: 40, height: 2, background: SAGE, borderRadius: 2 }} className="mx-auto mt-4" />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {services.map(({ name, desc, price }) => (
              <div key={name} style={{ border: `1px solid #D8D0C4`, borderRadius: 12, background: WARM }}
                className="p-6 flex items-center justify-between hover:border-green-400 transition-colors duration-300 group">
                <div>
                  <h3 style={{ fontFamily: "'Lora', serif", fontSize: 18, color: DARK }} className="mb-1">{name}</h3>
                  <p style={{ color: '#8A9A7A', fontSize: 13 }}>{desc}</p>
                </div>
                <span style={{ fontFamily: "'Lora', serif", fontSize: 22, color: FOREST }} className="font-medium ml-4 flex-shrink-0">{price}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* GALLERY */}
      <section id="gallery" style={{ background: WARM }} className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <p style={{ color: SAGE, letterSpacing: 4, fontSize: 11 }} className="uppercase mb-3">Portfolio</p>
            <h2 style={{ fontFamily: "'Lora', serif", fontSize: 44, color: DARK }}>Our Work</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {galleryImages.map((src, i) => (
              <div key={i} className="overflow-hidden rounded-xl group" style={{ aspectRatio: '4/5' }}>
                <img src={src} alt="hair work" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" style={{ background: DARK }} className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p style={{ color: SAGE, letterSpacing: 4, fontSize: 11 }} className="uppercase mb-3">Find Us</p>
            <h2 style={{ fontFamily: "'Lora', serif", fontSize: 44, color: CREAM }}>Get in Touch</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-16">
            <div className="space-y-8">
              {[
                { icon: <MapPin size={18} />, text: ['88 Garden District', 'Portland, OR 97201'] },
                { icon: <Phone size={18} />, text: ['(503) 555-0142'] },
                { icon: <Mail size={18} />, text: ['hello@botanicahair.com'] },
                { icon: <Clock size={18} />, text: ['Mon–Sat: 9am – 7pm', 'Sun: 10am – 5pm'] },
              ].map(({ icon, text }, i) => (
                <div key={i} className="flex gap-4">
                  <div style={{ color: SAGE, marginTop: 2 }}>{icon}</div>
                  <div>{text.map(t => <p key={t} style={{ color: '#A8B898', fontSize: 15 }}>{t}</p>)}</div>
                </div>
              ))}
              <div className="flex gap-3 pt-2">
                {[<Instagram size={18} />, <Facebook size={18} />].map((ic, i) => (
                  <a key={i} href="#" style={{ border: `1px solid #3A4A3A`, color: SAGE }}
                    className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-green-900/30 transition-colors duration-300">{ic}</a>
                ))}
              </div>
            </div>
            <div style={{ background: '#243524', borderRadius: 16 }} className="p-8">
              <h3 style={{ fontFamily: "'Lora', serif", fontSize: 26, color: CREAM }} className="mb-6">Book a Visit</h3>
              {['Your Name', 'Email', 'Phone'].map(p => (
                <input key={p} placeholder={p}
                  style={{ background: '#1A2B1A', border: '1px solid #3A4A3A', color: CREAM, borderRadius: 8 }}
                  className="w-full px-4 py-3 mb-4 text-sm outline-none focus:border-green-500 transition-colors duration-300 placeholder:text-green-900" />
              ))}
              <textarea placeholder="Service you're interested in..."
                style={{ background: '#1A2B1A', border: '1px solid #3A4A3A', color: CREAM, borderRadius: 8 }}
                className="w-full px-4 py-3 mb-6 text-sm outline-none focus:border-green-500 transition-colors duration-300 placeholder:text-green-900 resize-none h-24" />
              <button style={{ background: FOREST, color: CREAM, borderRadius: 8 }}
                className="w-full py-3.5 text-sm hover:opacity-90 transition-opacity duration-300">
                Request Appointment
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer style={{ background: '#0E1E0E', borderTop: `1px solid #1A2A1A` }} className="py-8 px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Leaf size={16} style={{ color: SAGE }} />
            <span style={{ fontFamily: "'Lora', serif", color: '#8A9A7A', fontSize: 15 }}>Botanica Hair Studio</span>
          </div>
          <p style={{ color: '#3A4A3A', fontSize: 12 }}>&copy; {new Date().getFullYear()} Botanica. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
