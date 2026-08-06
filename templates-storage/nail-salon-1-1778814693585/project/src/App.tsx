import { useState, useEffect, useRef } from 'react';
import {
  MapPin,
  Phone,
  Mail,
  Clock,
  Instagram,
  Facebook,
  Star,
  ChevronDown,
  Menu,
  X,
} from 'lucide-react';

const heroImages = [
  'https://images.pexels.com/photos/3997391/pexels-photo-3997391.jpeg?auto=compress&cs=tinysrgb&w=1920&q=80',
  'https://images.pexels.com/photos/704815/pexels-photo-704815.jpeg?auto=compress&cs=tinysrgb&w=1920&q=80',
  'https://images.pexels.com/photos/939836/pexels-photo-939836.jpeg?auto=compress&cs=tinysrgb&w=1920&q=80',
  'https://images.pexels.com/photos/3997395/pexels-photo-3997395.jpeg?auto=compress&cs=tinysrgb&w=1920&q=80',
];

const galleryImages = [
  { src: 'https://images.pexels.com/photos/3997391/pexels-photo-3997391.jpeg?auto=compress&cs=tinysrgb&w=600&q=80', alt: 'Nail art design' },
  { src: 'https://images.pexels.com/photos/704815/pexels-photo-704815.jpeg?auto=compress&cs=tinysrgb&w=600&q=80', alt: 'Luxury manicure' },
  { src: 'https://images.pexels.com/photos/939836/pexels-photo-939836.jpeg?auto=compress&cs=tinysrgb&w=600&q=80', alt: 'Gel nails' },
  { src: 'https://images.pexels.com/photos/3997395/pexels-photo-3997395.jpeg?auto=compress&cs=tinysrgb&w=600&q=80', alt: 'Nail polish' },
  { src: 'https://images.pexels.com/photos/3997383/pexels-photo-3997383.jpeg?auto=compress&cs=tinysrgb&w=600&q=80', alt: 'Spa pedicure' },
  { src: 'https://images.pexels.com/photos/1319460/pexels-photo-1319460.jpeg?auto=compress&cs=tinysrgb&w=600&q=80', alt: 'Nail care' },
  { src: 'https://images.pexels.com/photos/3997396/pexels-photo-3997396.jpeg?auto=compress&cs=tinysrgb&w=600&q=80', alt: 'French manicure' },
  { src: 'https://images.pexels.com/photos/3997390/pexels-photo-3997390.jpeg?auto=compress&cs=tinysrgb&w=600&q=80', alt: 'Nail design' },
  { src: 'https://images.pexels.com/photos/2736370/pexels-photo-2736370.jpeg?auto=compress&cs=tinysrgb&w=600&q=80', alt: 'Pedicure spa' },
  { src: 'https://images.pexels.com/photos/3997392/pexels-photo-3997392.jpeg?auto=compress&cs=tinysrgb&w=600&q=80', alt: 'Nail art' },
  { src: 'https://images.pexels.com/photos/3997388/pexels-photo-3997388.jpeg?auto=compress&cs=tinysrgb&w=600&q=80', alt: 'Luxury nails' },
  { src: 'https://images.pexels.com/photos/1065098/pexels-photo-1065098.jpeg?auto=compress&cs=tinysrgb&w=600&q=80', alt: 'Nail salon' },
];

const nailServices = [
  { name: 'Classic Manicure', price: '$20' },
  { name: 'Gel Manicure', price: '$35' },
  { name: 'Acrylic Full Set', price: '$45' },
  { name: 'Acrylic Fill', price: '$30' },
  { name: 'Dip Powder Full Set', price: '$50' },
  { name: 'Dip Powder Fill', price: '$38' },
  { name: 'Nail Art (per nail)', price: '$3+' },
  { name: 'Nail Repair', price: '$5+' },
];

const pedicureServices = [
  { name: 'Classic Pedicure', price: '$30' },
  { name: 'Spa Pedicure', price: '$45' },
  { name: 'Deluxe Pedicure', price: '$55' },
  { name: 'Gel Pedicure', price: '$50' },
  { name: 'Hot Stone Pedicure', price: '$60' },
  { name: 'Callus Treatment', price: '$10' },
  { name: 'Paraffin Treatment', price: '$12' },
  { name: 'French Pedicure', price: '$38' },
];

const waxingServices = [
  { name: 'Eyebrow Wax', price: '$12' },
  { name: 'Upper Lip Wax', price: '$8' },
  { name: 'Full Face Wax', price: '$35' },
  { name: 'Underarm Wax', price: '$20' },
  { name: 'Full Arm Wax', price: '$40' },
  { name: 'Half Leg Wax', price: '$38' },
  { name: 'Full Leg Wax', price: '$65' },
  { name: 'Bikini Wax', price: '$35' },
];

const hours = [
  { day: 'Monday – Friday', time: '9:00 AM – 7:30 PM' },
  { day: 'Saturday', time: '9:00 AM – 7:00 PM' },
  { day: 'Sunday', time: '10:00 AM – 5:00 PM' },
];

type ServiceTab = 'nail' | 'pedicure' | 'waxing';

export default function App() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [nextSlide, setNextSlide] = useState<number | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeService, setActiveService] = useState<ServiceTab>('nail');
  const [scrolled, setScrolled] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const triggerSlide = (index: number) => {
    if (isTransitioning || index === currentSlide) return;
    setNextSlide(index);
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentSlide(index);
      setNextSlide(null);
      setIsTransitioning(false);
    }, 1500);
  };

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      if (!isTransitioning) {
        const next = (currentSlide + 1) % heroImages.length;
        setNextSlide(next);
        setIsTransitioning(true);
        setTimeout(() => {
          setCurrentSlide(next);
          setNextSlide(null);
          setIsTransitioning(false);
        }, 1500);
      }
    }, 15000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [currentSlide, isTransitioning]);

  const scrollTo = (id: string) => {
    setMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const serviceData =
    activeService === 'nail'
      ? nailServices
      : activeService === 'pedicure'
      ? pedicureServices
      : waxingServices;

  const serviceLabel =
    activeService === 'nail'
      ? 'Nail Services'
      : activeService === 'pedicure'
      ? 'Pedicure Services'
      : 'Waxing Services';

  return (
    <div className="font-sans text-gray-800 overflow-x-hidden">

      {/* NAV */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled ? 'bg-white shadow-md py-3' : 'bg-transparent py-5'
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <button onClick={() => scrollTo('hero')} className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-full bg-rose-500 flex items-center justify-center shadow-md">
              <Star className="w-5 h-5 text-white fill-white" />
            </div>
            <span
              className={`text-xl font-bold tracking-wide transition-colors duration-300 ${
                scrolled ? 'text-gray-900' : 'text-white drop-shadow'
              }`}
            >
              Luxury Nails Spa
            </span>
          </button>

          <div className="hidden md:flex items-center gap-8">
            {['about', 'gallery', 'services', 'contact'].map((sec) => (
              <button
                key={sec}
                onClick={() => scrollTo(sec)}
                className={`text-sm font-medium uppercase tracking-widest transition-colors duration-300 hover:text-rose-400 ${
                  scrolled ? 'text-gray-700' : 'text-white drop-shadow'
                }`}
              >
                {sec}
              </button>
            ))}
            <button
              onClick={() => scrollTo('contact')}
              className="px-5 py-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold rounded-full transition-colors duration-200 shadow"
            >
              Book Now
            </button>
          </div>

          <button
            className={`md:hidden transition-colors duration-300 ${
              scrolled ? 'text-gray-800' : 'text-white'
            }`}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {menuOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 shadow-lg">
            {['about', 'gallery', 'services', 'contact'].map((sec) => (
              <button
                key={sec}
                onClick={() => scrollTo(sec)}
                className="block w-full text-left px-6 py-4 text-sm font-medium uppercase tracking-widest text-gray-700 hover:bg-rose-50 hover:text-rose-500 transition-colors"
              >
                {sec}
              </button>
            ))}
          </div>
        )}
      </nav>

      {/* HERO */}
      <section id="hero" className="relative h-screen w-full overflow-hidden">
        {heroImages.map((src, i) => {
          const isCurrent = i === currentSlide;
          const isNext = i === nextSlide;
          return (
            <div
              key={i}
              className="absolute inset-0"
              style={{
                zIndex: isNext ? 2 : isCurrent ? 1 : 0,
                opacity: isNext ? 1 : isCurrent ? 1 : 0,
              }}
            >
              <div
                className="absolute inset-0 bg-cover bg-center will-change-transform"
                style={{
                  backgroundImage: `url(${src})`,
                  animation: isCurrent ? 'kenburns 18s ease-in-out forwards' : 'none',
                  transition: isNext ? 'opacity 1.5s ease-in-out' : undefined,
                }}
              />
              <div
                className="absolute inset-0 bg-black"
                style={{
                  opacity: isNext ? 0 : 0.45,
                  transition: isNext ? 'opacity 1.5s ease-in-out' : undefined,
                }}
              />
            </div>
          );
        })}

        {/* Crossfade overlay for next slide */}
        {nextSlide !== null && (
          <div className="absolute inset-0 z-10 animate-crossfade">
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${heroImages[nextSlide]})` }}
            />
            <div className="absolute inset-0 bg-black/45" />
          </div>
        )}

        <div className="relative z-20 h-full flex flex-col items-center justify-center text-center text-white px-6">
          <p className="text-rose-300 text-sm font-semibold uppercase tracking-[0.35em] mb-4 animate-fadein">
            Welcome to
          </p>
          <h1
            className="text-5xl md:text-7xl font-bold leading-tight mb-6 animate-fadein"
            style={{ textShadow: '0 2px 24px rgba(0,0,0,0.5)' }}
          >
            Luxury Nails Spa
          </h1>
          <p className="text-lg md:text-xl text-white/85 max-w-2xl mb-10 leading-relaxed animate-fadein">
            Where beauty meets relaxation. Experience premium nail care and spa services in an elegant, serene environment.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 animate-fadein">
            <button
              onClick={() => scrollTo('services')}
              className="px-8 py-3.5 bg-rose-500 hover:bg-rose-600 text-white font-semibold rounded-full transition-all duration-200 hover:scale-105 shadow-lg"
            >
              Explore Services
            </button>
            <button
              onClick={() => scrollTo('contact')}
              className="px-8 py-3.5 bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white font-semibold rounded-full border border-white/40 transition-all duration-200 hover:scale-105"
            >
              Get Directions
            </button>
          </div>
        </div>

        {/* Slide dots */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-20 flex gap-3">
          {heroImages.map((_, i) => (
            <button
              key={i}
              onClick={() => triggerSlide(i)}
              className={`transition-all duration-500 rounded-full ${
                i === currentSlide
                  ? 'w-8 h-2.5 bg-rose-400'
                  : 'w-2.5 h-2.5 bg-white/50 hover:bg-white/80'
              }`}
            />
          ))}
        </div>

        {/* Scroll cue */}
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 animate-bounce">
          <ChevronDown className="w-6 h-6 text-white/60" />
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-16 items-center">
          <div className="relative">
            <div className="absolute -top-4 -left-4 w-full h-full border-2 border-rose-200 rounded-2xl pointer-events-none" />
            <img
              src="https://images.pexels.com/photos/3997385/pexels-photo-3997385.jpeg?auto=compress&cs=tinysrgb&w=800&q=80"
              alt="Luxury Nails Spa"
              className="relative rounded-2xl w-full object-cover aspect-[4/3] shadow-xl"
            />
            <div className="absolute -bottom-6 -right-6 bg-rose-500 text-white rounded-xl px-6 py-4 shadow-xl">
              <p className="text-3xl font-bold">10+</p>
              <p className="text-sm text-rose-100">Years of Excellence</p>
            </div>
          </div>
          <div>
            <p className="text-rose-500 text-sm font-semibold uppercase tracking-[0.3em] mb-3">About Us</p>
            <h2 className="text-4xl font-bold text-gray-900 leading-tight mb-6">Luxury Nails Spa</h2>
            <p className="text-gray-600 leading-relaxed mb-5 text-lg">
              At <strong className="text-gray-800">Luxury Nails Spa</strong>, we believe that self-care is an art. Our mission is to provide an elegant and relaxing environment where you can unwind and enjoy top-quality nail and spa services.
            </p>
            <p className="text-gray-600 leading-relaxed mb-5">
              From classic manicures and pedicures to creative nail art and rejuvenating spa treatments, our experienced technicians are dedicated to making every visit a luxurious experience.
            </p>
            <p className="text-gray-600 leading-relaxed mb-8">
              Step into comfort, indulge in beauty, and leave feeling refreshed and confident with perfectly polished nails and a renewed spirit.
            </p>
            <div className="grid grid-cols-3 gap-6 border-t border-gray-100 pt-8">
              {[['500+', 'Happy Clients'], ['20+', 'Nail Artists'], ['50+', 'Services']].map(([num, label]) => (
                <div key={label} className="text-center">
                  <p className="text-2xl font-bold text-rose-500">{num}</p>
                  <p className="text-sm text-gray-500 mt-1">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* GALLERY */}
      <section id="gallery" className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <p className="text-rose-500 text-sm font-semibold uppercase tracking-[0.3em] mb-3">Our Work</p>
            <h2 className="text-4xl font-bold text-gray-900">Our Gallery</h2>
            <div className="mt-4 mx-auto w-16 h-0.5 bg-rose-400 rounded" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {galleryImages.map((img, i) => (
              <div
                key={i}
                className="group relative overflow-hidden rounded-xl aspect-square shadow-sm hover:shadow-xl transition-shadow duration-300 cursor-pointer"
              >
                <img
                  src={img.src}
                  alt={img.alt}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-rose-900/0 group-hover:bg-rose-900/30 transition-colors duration-300 flex items-center justify-center">
                  <Star className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300 fill-white" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <p className="text-rose-500 text-sm font-semibold uppercase tracking-[0.3em] mb-3">What We Offer</p>
            <h2 className="text-4xl font-bold text-gray-900">Service Menu</h2>
            <div className="mt-4 mx-auto w-16 h-0.5 bg-rose-400 rounded" />
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-12">
            {(
              [
                {
                  key: 'nail' as ServiceTab,
                  label: 'Nail Services',
                  img: 'https://images.pexels.com/photos/3997391/pexels-photo-3997391.jpeg?auto=compress&cs=tinysrgb&w=600&q=80',
                },
                {
                  key: 'pedicure' as ServiceTab,
                  label: 'Pedicure Services',
                  img: 'https://images.pexels.com/photos/2736370/pexels-photo-2736370.jpeg?auto=compress&cs=tinysrgb&w=600&q=80',
                },
                {
                  key: 'waxing' as ServiceTab,
                  label: 'Waxing Services',
                  img: 'https://images.pexels.com/photos/3997383/pexels-photo-3997383.jpeg?auto=compress&cs=tinysrgb&w=600&q=80',
                },
              ] as { key: ServiceTab; label: string; img: string }[]
            ).map(({ key, label, img }) => (
              <button
                key={key}
                onClick={() => setActiveService(key)}
                className={`group relative overflow-hidden rounded-2xl aspect-video shadow-md transition-all duration-300 hover:scale-105 ${
                  activeService === key ? 'ring-4 ring-rose-400 ring-offset-2' : ''
                }`}
              >
                <img
                  src={img}
                  alt={label}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                />
                <div
                  className={`absolute inset-0 flex items-end p-5 transition-all duration-300 ${
                    activeService === key
                      ? 'bg-rose-900/60'
                      : 'bg-black/40 group-hover:bg-black/55'
                  }`}
                >
                  <h3 className="text-white text-xl font-bold">{label}</h3>
                </div>
              </button>
            ))}
          </div>

          <div className="bg-gray-50 rounded-2xl p-8 shadow-inner">
            <h3 className="text-2xl font-bold text-gray-900 mb-6 text-center">{serviceLabel}</h3>
            <div className="grid sm:grid-cols-2 gap-3 max-w-3xl mx-auto">
              {serviceData.map(({ name, price }) => (
                <div
                  key={name}
                  className="flex items-center justify-between bg-white rounded-xl px-5 py-3.5 shadow-sm border border-gray-100 hover:border-rose-200 hover:shadow-md transition-all duration-200"
                >
                  <span className="text-gray-700 font-medium">{name}</span>
                  <span className="text-rose-500 font-bold text-lg">{price}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" className="py-24 bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <p className="text-rose-400 text-sm font-semibold uppercase tracking-[0.3em] mb-3">Find Us</p>
            <h2 className="text-4xl font-bold">Contact Us</h2>
            <div className="mt-4 mx-auto w-16 h-0.5 bg-rose-500 rounded" />
          </div>

          <div className="grid md:grid-cols-2 gap-16">
            <div className="space-y-8">
              <div className="flex items-start gap-5">
                <div className="w-12 h-12 bg-rose-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <MapPin className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Address</p>
                  <p className="text-lg font-medium">4231 S Buckley Rd Ste A</p>
                  <p className="text-gray-300">Aurora, CO 80013</p>
                </div>
              </div>

              <div className="flex items-start gap-5">
                <div className="w-12 h-12 bg-rose-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Phone className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Call Us</p>
                  <a href="tel:+13036901099" className="text-lg font-medium hover:text-rose-400 transition-colors">
                    (303) 690-1099
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-5">
                <div className="w-12 h-12 bg-rose-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Mail className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">Email Us</p>
                  <a
                    href="mailto:luxurynailsspa.aurora@gmail.com"
                    className="text-lg font-medium hover:text-rose-400 transition-colors break-all"
                  >
                    luxurynailsspa.aurora@gmail.com
                  </a>
                </div>
              </div>

              <div className="flex items-start gap-5">
                <div className="w-12 h-12 bg-rose-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5 text-rose-400" />
                </div>
                <div className="w-full">
                  <p className="text-xs text-gray-400 uppercase tracking-widest mb-3">Business Hours</p>
                  <div className="space-y-2">
                    {hours.map(({ day, time }) => (
                      <div key={day} className="flex justify-between text-sm border-b border-gray-800 pb-2">
                        <span className="text-gray-300">{day}</span>
                        <span className="text-white font-medium">{time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-2">
                <a
                  href="#"
                  className="w-10 h-10 bg-rose-500/20 hover:bg-rose-500 rounded-xl flex items-center justify-center transition-colors duration-200 group"
                >
                  <Instagram className="w-5 h-5 text-rose-400 group-hover:text-white transition-colors" />
                </a>
                <a
                  href="#"
                  className="w-10 h-10 bg-rose-500/20 hover:bg-rose-500 rounded-xl flex items-center justify-center transition-colors duration-200 group"
                >
                  <Facebook className="w-5 h-5 text-rose-400 group-hover:text-white transition-colors" />
                </a>
              </div>
            </div>

            <div className="rounded-2xl overflow-hidden shadow-2xl" style={{ minHeight: '380px' }}>
              <iframe
                title="Luxury Nails Spa Location"
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3073.0!2d-104.769!3d39.674!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2s4231+S+Buckley+Rd%2C+Aurora%2C+CO+80013!5e0!3m2!1sen!2sus!4v1"
                width="100%"
                height="100%"
                style={{ border: 0, minHeight: '380px', display: 'block' }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-gray-950 text-gray-500 py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-3 text-sm">
          <p>Copyright &copy; {new Date().getFullYear()} Luxury Nails Spa. All Rights Reserved.</p>
          <p>Crafted with care for beauty.</p>
        </div>
      </footer>

      <style>{`
        @keyframes kenburns {
          0%   { transform: scale(1)    translate(0%, 0%); }
          50%  { transform: scale(1.06) translate(-1.5%, -1%); }
          100% { transform: scale(1.12) translate(1%, 0.5%); }
        }
        @keyframes crossfade {
          0%   { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes fadein {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-crossfade {
          animation: crossfade 1.5s ease-in-out forwards;
        }
        .animate-fadein {
          animation: fadein 1s ease-out both;
        }
      `}</style>
    </div>
  );
}
