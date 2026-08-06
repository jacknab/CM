import { useState, useEffect } from 'react';
import { MapPin, Phone, Mail, Clock, Instagram, Menu, X } from 'lucide-react';

const services = [
  { name: 'Spectrum Cut', price: '$98', desc: 'Precision with personality' },
  { name: 'Iridescent Colour', price: '$195+', desc: 'Multi-tonal dimension' },
  { name: 'Prism Balayage', price: '$250+', desc: 'Light-catching gradients' },
  { name: 'Shine Treatment', price: '$92', desc: 'Mirror gloss finish' },
  { name: 'Rainbow Highlights', price: '$175+', desc: 'Subtle spectrum weave' },
  { name: 'Blowout & Style', price: '$68', desc: 'Polished completion' },
];

const gallery = [
  'https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/1813346/pexels-photo-1813346.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/3182742/pexels-photo-3182742.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/3997379/pexels-photo-3997379.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/2009901/pexels-photo-2009901.jpeg?auto=compress&cs=tinysrgb&w=500',
  'https://images.pexels.com/photos/3993306/pexels-photo-3993306.jpeg?auto=compress&cs=tinysrgb&w=500',
];

const RAINBOW = 'linear-gradient(135deg, #FF6B8A 0%, #FF9A5C 20%, #FFD166 40%, #06D6A0 60%, #118AB2 80%, #8B5CF6 100%)';

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
    <div className="bg-white overflow-x-hidden" style={{ color: '#1A1A2E' }}>
      <style>{`
        .prism-text { background: ${RAINBOW}; -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .prism-btn { background: ${RAINBOW}; }
      `}</style>

      {/* NAV */}
      <nav style={{ background: scrolled ? 'rgba(255,255,255,0.97)' : 'transparent', backdropFilter: scrolled ? 'blur(12px)' : 'none', borderBottom: scrolled ? '1px solid #F0EEF8' : 'none' }}
        className="fixed top-0 left-0 right-0 z-50 transition-all duration-500 py-5 px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button onClick={() => scrollTo('hero')}>
            <span className="text-xl font-semibold prism-text" style={{ fontWeight: 600 }}>Prism</span>
          </button>
          <div className="hidden md:flex items-center gap-8">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)} className="text-xs uppercase tracking-[0.2em] text-gray-400 hover:text-gray-900 transition-colors duration-300 capitalize">{s}</button>
            ))}
            <button onClick={() => scrollTo('contact')} className="prism-btn text-white text-xs uppercase tracking-[0.15em] px-7 py-2.5 rounded-full hover:opacity-90 transition-opacity duration-300 shadow-sm font-medium">
              Book
            </button>
          </div>
          <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menuOpen && (
          <div className="md:hidden border-t border-gray-100 px-8 py-4 space-y-4 bg-white">
            {['about', 'services', 'gallery', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)} className="block capitalize text-sm text-gray-400">{s}</button>
            ))}
          </div>
        )}
      </nav>

      {/* HERO */}
      <section id="hero" className="min-h-screen relative overflow-hidden">
        {/* Iridescent background */}
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 30% 40%, rgba(139,92,246,0.08) 0%, transparent 60%), radial-gradient(ellipse at 70% 60%, rgba(6,214,160,0.06) 0%, transparent 60%), radial-gradient(ellipse at 50% 20%, rgba(255,107,138,0.06) 0%, transparent 40%)' }} />
        <div className="relative z-10 h-screen grid md:grid-cols-2 items-center">
          <div className="px-10 md:px-20 py-32 md:py-0">
            <p className="text-xs uppercase tracking-[0.35em] text-gray-400 mb-8">Colour Studio · Melbourne</p>
            <h1 className="mb-8" style={{ fontSize: 'clamp(56px, 10vw, 120px)', fontWeight: 200, lineHeight: 0.85, letterSpacing: -4, color: '#0A0A1A' }}>
              Every<br />shade<br /><span className="prism-text" style={{ fontWeight: 600 }}>alive.</span>
            </h1>
            <p className="text-gray-400 text-base leading-relaxed max-w-md mb-12 font-light">
              Prism is Melbourne's most colour-forward hair studio. From subtle iridescence to full-spectrum transformations, we make light play in your hair.
            </p>
            <div className="flex gap-4">
              <button onClick={() => scrollTo('contact')} className="prism-btn text-white px-8 py-3.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity duration-300 shadow-lg">
                Book Now
              </button>
              <button onClick={() => scrollTo('gallery')} className="border border-gray-200 text-gray-500 px-8 py-3.5 rounded-full text-sm hover:border-gray-400 transition-colors duration-300">
                Our Work
              </button>
            </div>
          </div>
          <div className="hidden md:block relative h-full overflow-hidden">
            <img src="https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=1000&q=85"
              className="w-full h-full object-cover" alt="" />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(to left, transparent 50%, rgba(255,255,255,0.1) 100%)' }} />
            {/* Rainbow accent */}
            <div className="absolute left-0 top-0 bottom-0 w-1 prism-btn" />
          </div>
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" style={{ background: '#FAFAF8' }} className="py-24 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-gray-400 mb-4">About</p>
          <h2 style={{ fontSize: 'clamp(30px, 5vw, 56px)', fontWeight: 200, lineHeight: 1.1, letterSpacing: -2 }} className="mb-6">
            Colour through a<br /><span className="prism-text" style={{ fontWeight: 500 }}>different lens</span>
          </h2>
          <p className="text-gray-400 text-[15px] leading-relaxed max-w-xl mx-auto mb-14 font-light">
            Prism Studio was founded by a team of colour scientists and artists who saw hair colour as a spectrum of infinite possibility. We've spent years perfecting techniques that create depth, movement, and light-responsiveness in every shade.
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { color: '#FF6B8A', icon: '✦', title: 'Vivid Colour', desc: 'From subtle blush to bold statement — we do it all.' },
              { color: '#06D6A0', icon: '◈', title: 'Iridescence', desc: 'Colour that shifts and shimmers in different lights.' },
              { color: '#118AB2', icon: '◎', title: 'Precision Cut', desc: 'The foundation that makes your colour sing.' },
            ].map(({ color, icon, title, desc }) => (
              <div key={title} className="p-8 rounded-2xl border border-gray-100 hover:shadow-lg transition-shadow duration-300 text-left">
                <p style={{ color, fontSize: 28 }} className="mb-4">{icon}</p>
                <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed font-light">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs uppercase tracking-[0.3em] text-gray-400 mb-3">Menu</p>
          <h2 style={{ fontSize: 48, fontWeight: 200, letterSpacing: -2 }} className="mb-14">Services</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {services.map(({ name, price, desc }) => (
              <div key={name} className="p-6 rounded-2xl border border-gray-100 hover:shadow-md transition-shadow duration-300 group">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-medium text-gray-900 mb-1 group-hover:text-purple-600 transition-colors duration-300">{name}</h3>
                    <p className="text-gray-400 text-sm font-light">{desc}</p>
                  </div>
                  <span className="prism-text font-semibold text-lg ml-4 flex-shrink-0">{price}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* GALLERY */}
      <section id="gallery" style={{ background: '#FAFAF8' }} className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <p className="text-xs uppercase tracking-[0.3em] text-gray-400 mb-3">Work</p>
          <h2 style={{ fontSize: 48, fontWeight: 200, letterSpacing: -2 }} className="mb-14">Gallery</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {gallery.map((src, i) => (
              <div key={i} className="overflow-hidden rounded-2xl group shadow-sm hover:shadow-xl transition-shadow duration-300" style={{ aspectRatio: '4/5' }}>
                <img src={src} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" style={{ background: '#1A1A2E' }} className="py-24 px-6 text-white">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs uppercase tracking-[0.3em] text-purple-400 mb-3">Book</p>
          <h2 style={{ fontSize: 48, fontWeight: 200, letterSpacing: -2 }} className="mb-14">Contact</h2>
          <div className="grid md:grid-cols-2 gap-16">
            <div className="space-y-7">
              {[
                { icon: <MapPin size={15} />, lines: ['120 Swan Street', 'Richmond, VIC 3121'] },
                { icon: <Phone size={15} />, lines: ['(03) 9555 0188'] },
                { icon: <Mail size={15} />, lines: ['colour@prism.studio'] },
                { icon: <Clock size={15} />, lines: ['Tue–Sat: 10am – 8pm', 'Sun: Noon – 5pm'] },
              ].map(({ icon, lines }, i) => (
                <div key={i} className="flex gap-4">
                  <div className="text-purple-400 mt-0.5">{icon}</div>
                  <div>{lines.map(l => <p key={l} className="text-gray-500 text-sm">{l}</p>)}</div>
                </div>
              ))}
              <a href="#" className="w-10 h-10 border border-gray-800 inline-flex items-center justify-center rounded-xl hover:border-purple-500 hover:text-purple-400 transition-colors duration-300 text-gray-700">
                <Instagram size={15} />
              </a>
            </div>
            <div>
              {['Name', 'Email', 'Phone', 'Service'].map(p => (
                <input key={p} placeholder={p}
                  className="w-full border-b border-gray-800 bg-transparent py-4 text-sm text-gray-300 placeholder:text-gray-700 outline-none focus:border-purple-500 transition-colors duration-300 mb-5 font-light"
                  style={{ borderTop: 'none', borderLeft: 'none', borderRight: 'none' }} />
              ))}
              <button className="prism-btn w-full py-4 text-sm font-medium text-white rounded-full hover:opacity-90 transition-opacity duration-300 shadow-lg">
                Book Appointment
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer style={{ background: '#12121F', borderTop: '1px solid #1E1E30' }} className="py-8 px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <span className="prism-text font-semibold text-base">Prism</span>
          <p className="text-gray-800 text-xs">&copy; {new Date().getFullYear()} Prism Studio</p>
        </div>
      </footer>
    </div>
  );
}
