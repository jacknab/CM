import { useState, useEffect } from 'react';
import { MapPin, Phone, Mail, Clock, Instagram, Menu, X, ArrowRight } from 'lucide-react';

const services = [
  { name: 'The Cut', price: '$95', time: '60 min' },
  { name: 'Colour', price: '$170+', time: '120 min' },
  { name: 'Balayage', price: '$220+', time: '150 min' },
  { name: 'Toning', price: '$80', time: '45 min' },
  { name: 'Blowdry', price: '$60', time: '45 min' },
  { name: 'Treatment', price: '$75', time: '30 min' },
  { name: 'Men\'s Cut', price: '$65', time: '45 min' },
  { name: 'Extensions', price: '$POA', time: 'Consultation' },
];

const work = [
  'https://images.pexels.com/photos/3065171/pexels-photo-3065171.jpeg?auto=compress&cs=tinysrgb&w=600&q=80',
  'https://images.pexels.com/photos/3182742/pexels-photo-3182742.jpeg?auto=compress&cs=tinysrgb&w=600&q=80',
  'https://images.pexels.com/photos/1813346/pexels-photo-1813346.jpeg?auto=compress&cs=tinysrgb&w=600&q=80',
  'https://images.pexels.com/photos/3065170/pexels-photo-3065170.jpeg?auto=compress&cs=tinysrgb&w=600&q=80',
  'https://images.pexels.com/photos/3993306/pexels-photo-3993306.jpeg?auto=compress&cs=tinysrgb&w=600&q=80',
  'https://images.pexels.com/photos/2009901/pexels-photo-2009901.jpeg?auto=compress&cs=tinysrgb&w=600&q=80',
];

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', h);
    return () => window.removeEventListener('scroll', h);
  }, []);

  const scrollTo = (id: string) => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="bg-white text-gray-900 overflow-x-hidden">
      <style>{`
        @keyframes fadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        .fadeup { animation: fadeUp 0.8s ease both; }
      `}</style>

      {/* NAV */}
      <nav style={{ borderBottom: scrolled ? '1px solid #E8E8E8' : '1px solid transparent' }}
        className="fixed top-0 left-0 right-0 z-50 bg-white transition-all duration-300 py-5 px-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button onClick={() => scrollTo('hero')}>
            <span className="text-xl font-semibold tracking-tight" style={{ letterSpacing: -1 }}>The Edit</span>
          </button>
          <div className="hidden md:flex items-center gap-10">
            {['about', 'services', 'work', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)}
                className="text-xs uppercase tracking-[0.15em] text-gray-400 hover:text-black transition-colors duration-300">
                {s}
              </button>
            ))}
            <button onClick={() => scrollTo('contact')}
              className="text-xs uppercase tracking-[0.15em] text-white bg-black px-6 py-2.5 hover:bg-gray-800 transition-colors duration-300">
              Book
            </button>
          </div>
          <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        {menuOpen && (
          <div className="md:hidden border-t border-gray-100 px-8 py-4 space-y-4 bg-white">
            {['about', 'services', 'work', 'contact'].map(s => (
              <button key={s} onClick={() => scrollTo(s)} className="block w-full text-left text-xs uppercase tracking-widest text-gray-500">{s}</button>
            ))}
          </div>
        )}
      </nav>

      {/* HERO */}
      <section id="hero" className="min-h-screen flex items-center justify-center px-6 pt-24">
        <div className="text-center max-w-4xl">
          <p className="text-xs uppercase tracking-[0.3em] text-gray-400 mb-8 fadeup" style={{ animationDelay: '0.1s' }}>
            Hair Studio · Est. 2015
          </p>
          <h1 className="fadeup" style={{ fontSize: 'clamp(56px, 10vw, 140px)', fontWeight: 200, lineHeight: 0.88, letterSpacing: -4, animationDelay: '0.2s' }}>
            The<br />Edit.
          </h1>
          <div className="mx-auto my-10 fadeup" style={{ width: 60, height: 1, background: '#1A1A1A', animationDelay: '0.35s' }} />
          <p className="text-gray-400 text-base leading-relaxed max-w-md mx-auto mb-12 fadeup" style={{ animationDelay: '0.4s' }}>
            Precision haircare without distraction. Clean lines, considered colour, exceptional craft.
          </p>
          <div className="flex justify-center gap-6 fadeup" style={{ animationDelay: '0.5s' }}>
            <button onClick={() => scrollTo('services')}
              className="flex items-center gap-2 text-sm border-b border-black pb-1 hover:gap-4 transition-all duration-300">
              Services <ArrowRight size={14} />
            </button>
            <button onClick={() => scrollTo('work')}
              className="flex items-center gap-2 text-sm text-gray-400 border-b border-gray-300 pb-1 hover:text-black hover:border-black transition-all duration-300">
              Our Work <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </section>

      {/* DIVIDER IMAGE */}
      <div className="relative h-[50vh] overflow-hidden">
        <img src="https://images.pexels.com/photos/1570807/pexels-photo-1570807.jpeg?auto=compress&cs=tinysrgb&w=1600&q=85"
          alt="The Edit" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-white/20" />
      </div>

      {/* ABOUT */}
      <section id="about" className="py-28 px-6">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-20 items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-gray-400 mb-6">About</p>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 46px)', fontWeight: 200, lineHeight: 1.1, letterSpacing: -1 }} className="mb-8">
              Less is more.<br />Always.
            </h2>
            <p className="text-gray-500 leading-relaxed mb-5 text-[15px]">
              The Edit was founded on a single principle: that great hair doesn't need to be complicated. No unnecessary products, no rushed appointments, no compromise on craft.
            </p>
            <p className="text-gray-500 leading-relaxed mb-8 text-[15px]">
              Our team of seven senior stylists have each trained for a minimum of ten years, working with the world's leading salons before arriving here.
            </p>
            <button onClick={() => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth' })}
              className="flex items-center gap-2 text-sm font-medium border-b border-black pb-1 hover:gap-4 transition-all duration-300">
              Book a Consultation <ArrowRight size={14} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <img src="https://images.pexels.com/photos/3997379/pexels-photo-3997379.jpeg?auto=compress&cs=tinysrgb&w=400&q=80"
              alt="cut" className="w-full object-cover" style={{ aspectRatio: '3/4' }} />
            <div className="mt-8">
              <img src="https://images.pexels.com/photos/3190601/pexels-photo-3190601.jpeg?auto=compress&cs=tinysrgb&w=400&q=80"
                alt="colour" className="w-full object-cover" style={{ aspectRatio: '3/4' }} />
            </div>
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" className="py-24 px-6 bg-gray-50">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-end justify-between mb-14">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-gray-400 mb-3">Menu</p>
              <h2 style={{ fontSize: 44, fontWeight: 200, letterSpacing: -2 }}>Services</h2>
            </div>
            <p className="text-xs text-gray-400 hidden md:block">All prices from</p>
          </div>
          {services.map(({ name, price, time }, i) => (
            <div key={name} className="group flex items-center justify-between py-5 cursor-default hover:bg-white transition-colors duration-300 px-4 -mx-4"
              style={{ borderTop: i === 0 ? '1px solid #E8E8E8' : 'none', borderBottom: '1px solid #E8E8E8' }}>
              <div className="flex items-center gap-6">
                <span className="text-xs text-gray-300 w-5">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-base font-light group-hover:font-normal transition-all duration-300">{name}</span>
              </div>
              <div className="flex items-center gap-8">
                <span className="text-xs text-gray-400 hidden md:block">{time}</span>
                <span className="text-base font-medium">{price}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* WORK */}
      <section id="work" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <p className="text-xs uppercase tracking-[0.25em] text-gray-400 mb-3">Portfolio</p>
          <h2 style={{ fontSize: 44, fontWeight: 200, letterSpacing: -2 }} className="mb-14">Work</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {work.map((src, i) => (
              <div key={i} className="overflow-hidden group" style={{ aspectRatio: i % 2 === 0 ? '4/5' : '3/4' }}>
                <img src={src} alt="work" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-103"
                  style={{ filter: 'contrast(1.02)' }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" className="py-24 px-6 bg-gray-950 text-white">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs uppercase tracking-[0.25em] text-gray-500 mb-3">Contact</p>
          <h2 style={{ fontSize: 44, fontWeight: 200, letterSpacing: -2, color: 'white' }} className="mb-14">Book Now</h2>
          <div className="grid md:grid-cols-2 gap-16">
            <div className="space-y-8">
              {[
                { icon: <MapPin size={16} />, lines: ['12 Fitzroy Square', 'London, W1T 6EQ'] },
                { icon: <Phone size={16} />, lines: ['+44 20 7946 0958'] },
                { icon: <Mail size={16} />, lines: ['edit@theedithair.co.uk'] },
                { icon: <Clock size={16} />, lines: ['Tue–Fri: 9am – 8pm', 'Sat: 8am – 6pm'] },
              ].map(({ icon, lines }, i) => (
                <div key={i} className="flex gap-4">
                  <div className="text-gray-600 mt-0.5">{icon}</div>
                  <div>{lines.map(l => <p key={l} className="text-gray-400 text-sm leading-6">{l}</p>)}</div>
                </div>
              ))}
              <a href="#" className="w-9 h-9 border border-gray-800 flex items-center justify-center hover:border-white transition-colors duration-300 text-gray-600 hover:text-white">
                <Instagram size={15} />
              </a>
            </div>
            <div>
              {['Name', 'Email', 'Phone', 'Service requested'].map((p, i) => (
                <input key={p} placeholder={p}
                  className="w-full border-b border-gray-800 bg-transparent py-4 text-sm text-gray-300 placeholder:text-gray-700 outline-none focus:border-white transition-colors duration-300 mb-6"
                  style={{ borderTop: 'none', borderLeft: 'none', borderRight: 'none' }} />
              ))}
              <button className="w-full py-4 text-xs uppercase tracking-[0.2em] bg-white text-black hover:bg-gray-100 transition-colors duration-300">
                Send Request
              </button>
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-black py-8 px-8 border-t border-gray-900">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <span className="text-gray-700 text-sm font-light tracking-tight">The Edit.</span>
          <p className="text-gray-800 text-xs">&copy; {new Date().getFullYear()} The Edit Hair Studio</p>
        </div>
      </footer>
    </div>
  );
}
