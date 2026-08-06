import { useState, useEffect } from 'react';
import { MapPin, Phone, Mail, Clock, Instagram, Menu, X } from 'lucide-react';

const BLUSH = '#F5DDD5';
const ROSE = '#C8907A';
const CHAMPAGNE = '#D4B896';
const CREAM = '#FBF7F3';
const DARK = '#2A1A14';
const MINK = '#8A6A5A';

const services = [
  { cat: 'Coupe', items: [{ n: 'Coupe Signature', p: '€105' }, { n: 'Coupe & Brushing', p: '€135' }, { n: 'Coupe Homme', p: '€80' }] },
  { cat: 'Couleur', items: [{ n: 'Couleur Totale', p: '€160+' }, { n: 'Balayage Soleil', p: '€220+' }, { n: 'Mèches & Reflets', p: '€180+' }] },
  { cat: 'Soins', items: [{ n: 'Soin Kératine', p: '€95' }, { n: 'Masque Intense', p: '€75' }, { n: 'Soin Cuir Chevelu', p: '€80' }] },
];

const gallery = [
  'https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/1570807/pexels-photo-1570807.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/3804040/pexels-photo-3804040.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/1813346/pexels-photo-1813346.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/3997379/pexels-photo-3997379.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/3182742/pexels-photo-3182742.jpeg?auto=compress&cs=tinysrgb&w=500',
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
      <nav style={{ background: scrolled ? 'rgba(251,247,243,0.96)' : 'transparent', backdropFilter: scrolled ? 'blur(12px)' : 'none', borderBottom: scrolled ? `1px solid ${BLUSH}` : 'none' }}
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-500 py-5 px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button onClick={() => scrollTo('hero')}>
            <span style={{ fontFamily: "'Cormorant', serif", fontSize: 22, color: DARK, letterSpacing: 4, fontStyle: 'italic' }}>Riviera</span>
          </button>
          <div className="hidden md:flex items-center gap-10">
            {['à propos', 'services', 'galerie', 'contact'].map((s, i) => (
              <button key={s} onClick={() => scrollTo(['about', 'services', 'gallery', 'contact'][i])}
                style={{ color: MINK, fontSize: 12, letterSpacing: 1 }}
                className="capitalize hover:text-rose-700 transition-colors duration-300">{s}</button>
            ))}
            <button onClick={() => scrollTo('contact')}
              style={{ border: `1px solid ${ROSE}`, color: ROSE, borderRadius: 50, letterSpacing: 2, fontSize: 12 }}
              className="px-6 py-2.5 hover:bg-rose-50 transition-colors duration-300">
              Réserver
            </button>
          </div>
          <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)} style={{ color: DARK }}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menuOpen && (
          <div style={{ background: CREAM, borderTop: `1px solid ${BLUSH}` }} className="md:hidden px-8 py-4 space-y-4">
            {['À propos', 'Services', 'Galerie', 'Contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s.toLowerCase())} className="block capitalize text-sm" style={{ color: MINK }}>{s}</button>
            ))}
          </div>
        )}
      </nav>

      {/* HERO - elegant split */}
      <section id="hero" className="min-h-screen grid md:grid-cols-2">
        <div className="flex flex-col justify-center px-12 md:px-20 py-32 md:py-0" style={{ background: CREAM, order: 1 }}>
          <p style={{ color: ROSE, letterSpacing: 6, fontSize: 10 }} className="uppercase mb-5">Paris · Monaco · Côte d'Azur</p>
          <h1 style={{ fontFamily: "'Cormorant', serif", fontSize: 'clamp(48px, 7vw, 90px)', color: DARK, lineHeight: 0.9, fontStyle: 'italic' }} className="mb-6">
            Riviera
          </h1>
          <div style={{ width: 60, height: 1, background: CHAMPAGNE }} className="mb-8" />
          <p style={{ color: MINK, lineHeight: 1.9, fontSize: 15, maxWidth: 380 }} className="mb-10">
            Un salon de coiffure d'exception, où la tradition française rencontre le luxe contemporain. Chaque visite est une promesse de beauté et d'élégance.
          </p>
          <div className="flex gap-4">
            <button onClick={() => scrollTo('contact')}
              style={{ background: ROSE, color: 'white', borderRadius: 50 }}
              className="px-8 py-3.5 text-sm hover:opacity-90 transition-opacity duration-300 shadow-sm">
              Prendre Rendez-vous
            </button>
            <button onClick={() => scrollTo('services')}
              style={{ border: `1.5px solid ${BLUSH}`, color: MINK, borderRadius: 50 }}
              className="px-8 py-3.5 text-sm hover:border-rose-300 transition-colors duration-300">
              Nos Services
            </button>
          </div>
        </div>
        <div className="relative overflow-hidden" style={{ minHeight: 500, order: 2 }}>
          <img src="https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=1200&q=85"
            className="w-full h-full object-cover" style={{ minHeight: 500 }} alt="Riviera" />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, transparent 60%, rgba(251,247,243,0.2) 100%)' }} />
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" style={{ background: BLUSH }} className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p style={{ color: ROSE, letterSpacing: 5, fontSize: 10 }} className="uppercase mb-5">Notre Philosophie</p>
          <h2 style={{ fontFamily: "'Cormorant', serif", fontSize: 'clamp(32px, 5vw, 60px)', color: DARK, fontStyle: 'italic' }} className="mb-6 leading-tight">
            L'art de la beauté<br />à la française
          </h2>
          <div style={{ width: 40, height: 1, background: CHAMPAGNE }} className="mx-auto mb-8" />
          <p style={{ color: MINK, lineHeight: 1.9, fontSize: 15, maxWidth: 600, margin: '0 auto 48px' }}>
            Fondé par une équipe de coiffeurs parisiens, Riviera incarne le savoir-faire français avec une vision moderne. Nous croyons que chaque femme mérite des cheveux qui lui correspondent parfaitement.
          </p>
          <div className="grid grid-cols-3 gap-6 max-w-2xl mx-auto">
            {[['7', 'Coiffeurs'], ['12+', 'Années'], ['★5', 'Avis']].map(([n, l]) => (
              <div key={l} style={{ background: CREAM, borderRadius: 16 }} className="p-6">
                <p style={{ fontFamily: "'Cormorant', serif", fontSize: 40, color: ROSE, fontStyle: 'italic' }}>{n}</p>
                <p style={{ color: MINK, fontSize: 12, letterSpacing: 2 }} className="uppercase mt-1">{l}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" style={{ background: CREAM }} className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p style={{ color: ROSE, letterSpacing: 5, fontSize: 10 }} className="uppercase mb-4">Menu</p>
            <h2 style={{ fontFamily: "'Cormorant', serif", fontSize: 44, color: DARK, fontStyle: 'italic' }}>Nos Services</h2>
            <div style={{ width: 40, height: 1, background: CHAMPAGNE }} className="mx-auto mt-4" />
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {services.map(({ cat, items }) => (
              <div key={cat} style={{ border: `1px solid ${BLUSH}`, borderRadius: 12 }} className="p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div style={{ width: 16, height: 1, background: ROSE }} />
                  <p style={{ color: ROSE, letterSpacing: 3, fontSize: 10 }} className="uppercase">{cat}</p>
                </div>
                <div className="space-y-5">
                  {items.map(({ n, p }) => (
                    <div key={n} className="flex justify-between">
                      <span style={{ color: DARK, fontSize: 15 }}>{n}</span>
                      <span style={{ fontFamily: "'Cormorant', serif", fontSize: 20, color: ROSE }}>{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* GALLERY */}
      <section id="gallery" style={{ background: BLUSH }} className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <p style={{ color: ROSE, letterSpacing: 5, fontSize: 10 }} className="uppercase text-center mb-3">Galerie</p>
          <h2 style={{ fontFamily: "'Cormorant', serif", fontSize: 44, color: DARK, fontStyle: 'italic' }} className="text-center mb-12">Notre Travail</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {gallery.map((src, i) => (
              <div key={i} className="overflow-hidden rounded-2xl group" style={{ aspectRatio: '4/5' }}>
                <img src={src} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" style={{ background: DARK }} className="py-24 px-6 text-white">
        <div className="max-w-5xl mx-auto">
          <p style={{ color: ROSE, letterSpacing: 5, fontSize: 10 }} className="uppercase text-center mb-3">Contact</p>
          <h2 style={{ fontFamily: "'Cormorant', serif", fontSize: 44, color: BLUSH, fontStyle: 'italic' }} className="text-center mb-14">Nous Trouver</h2>
          <div className="grid md:grid-cols-2 gap-16">
            <div className="space-y-7">
              {[
                { icon: <MapPin size={16} />, lines: ['18 Rue du Faubourg Saint-Honoré', 'Paris, 75008'] },
                { icon: <Phone size={16} />, lines: ['+33 1 42 56 0180'] },
                { icon: <Mail size={16} />, lines: ['bonjour@riviera.salon'] },
                { icon: <Clock size={16} />, lines: ['Mar–Sam: 9h – 19h', 'Dim: 10h – 17h'] },
              ].map(({ icon, lines }, i) => (
                <div key={i} className="flex gap-4">
                  <div style={{ color: ROSE, marginTop: 2 }}>{icon}</div>
                  <div>{lines.map(l => <p key={l} style={{ color: MINK, fontSize: 15 }}>{l}</p>)}</div>
                </div>
              ))}
              <a href="#" style={{ border: `1px solid #3A2A24`, color: MINK }}
                className="w-10 h-10 inline-flex items-center justify-center rounded-xl hover:border-rose-400 hover:text-rose-300 transition-colors duration-300">
                <Instagram size={15} />
              </a>
            </div>
            <div style={{ background: '#3A2018', borderRadius: 16, border: `1px solid #4A2A20` }} className="p-8">
              {['Votre Nom', 'Email', 'Téléphone'].map(p => (
                <input key={p} placeholder={p}
                  style={{ background: '#2A1610', border: '1px solid #3A2018', color: BLUSH, borderRadius: 10, display: 'block', width: '100%', padding: '12px 16px', marginBottom: 12, outline: 'none', fontSize: 14 }}
                  className="placeholder:text-orange-950 focus:border-rose-500 transition-colors duration-300" />
              ))}
              <textarea placeholder="Service souhaité..."
                style={{ background: '#2A1610', border: '1px solid #3A2018', color: BLUSH, borderRadius: 10, display: 'block', width: '100%', padding: '12px 16px', marginBottom: 16, outline: 'none', fontSize: 14, resize: 'none', height: 80 }}
                className="placeholder:text-orange-950 focus:border-rose-500 transition-colors duration-300" />
              <button style={{ background: ROSE, color: 'white', borderRadius: 10, width: '100%', padding: '14px 0', fontSize: 14 }}
                className="hover:opacity-90 transition-opacity duration-300">
                Envoyer la Demande
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer style={{ background: '#1A0E0A', borderTop: `1px solid #2A1610` }} className="py-8 px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <span style={{ fontFamily: "'Cormorant', serif", color: MINK, fontSize: 18, fontStyle: 'italic' }}>Riviera</span>
          <p style={{ color: '#3A2018', fontSize: 12 }}>&copy; {new Date().getFullYear()} Riviera Salon. Tous droits réservés.</p>
        </div>
      </footer>
    </div>
  );
}
