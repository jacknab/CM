import {
  Hand,
  Sparkles,
  Brush,
  Heart,
  Gem,
  Footprints,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * The sample salon: the template's own preview only (no salon is loaded). A real salon's page never shows any of it
 * (context/SiteContext.tsx).
 */
export const salon = {
  name: 'Luxe Nail Bar',
  nameFirst: 'Luxe',
  nameRest: 'Nail Bar',
  phone: '(510) 555-0148',
  phoneHref: 'tel:+15105550148',
  street: '5612 College Avenue',
  cityLine: 'Oakland, CA 94618',
  hoursLine: 'Tue–Fri 9:30–7 · Sat 9–6 · Sun 10–4',
  hours: [
    { day: 'Monday', time: 'Closed', closed: true },
    { day: 'Tuesday', time: '9:30 AM – 7:00 PM', closed: false },
    { day: 'Wednesday', time: '9:30 AM – 7:00 PM', closed: false },
    { day: 'Thursday', time: '9:30 AM – 7:00 PM', closed: false },
    { day: 'Friday', time: '9:30 AM – 7:00 PM', closed: false },
    { day: 'Saturday', time: '9:00 AM – 6:00 PM', closed: false },
    { day: 'Sunday', time: '10:00 AM – 4:00 PM', closed: false },
  ],
  heroText: 'Pull up to the bar for luxury manicures, spa pedicures, and custom nail art at the East Bay\'s most loved nail salon. Book your moment of calm today.',
  about: 'Nestled on College Avenue in Oakland\'s charming Rockridge neighborhood, Luxe Nail Bar was born from a simple belief: a nail appointment should feel like a retreat. We\'ve spent years perfecting the balance between artistry, hygiene, and genuine hospitality.',
};

export interface Service {
  id: string;
  name: string;
  description: string;
  price: string;
  duration: string;
  category: string;
  icon: LucideIcon;
  popular?: boolean;
}

export const services: Service[] = [
  {
    id: 'classic-manicure',
    category: 'Manicures',
    name: 'Classic Manicure',
    description: 'A timeless treatment with shaping, cuticle care, hand massage, and polish in the shade of your choice.',
    price: '28',
    duration: '30 min',
    icon: Hand,
  },
  {
    id: 'gel-manicure',
    category: 'Manicures',
    name: 'Gel Manicure',
    description: 'Long-lasting, high-shine gel polish that stays flawless for up to three weeks. Includes cuticle care and massage.',
    price: '45',
    duration: '45 min',
    icon: Gem,
    popular: true,
  },
  {
    id: 'spa-pedicure',
    category: 'Pedicures',
    name: 'Luxury Spa Pedicure',
    description: 'An indulgent soak, exfoliation, callus removal, leg mask, and massage finished with your choice of polish.',
    price: '52',
    duration: '50 min',
    icon: Footprints,
    popular: true,
  },
  {
    id: 'dip-powder',
    category: 'Enhancements',
    name: 'Dip Powder Enhancement',
    description: 'Lightweight, durable dip powder nails that strengthen natural nails without UV light. Lasts up to four weeks.',
    price: '65',
    duration: '60 min',
    icon: Sparkles,
  },
  {
    id: 'nail-art',
    category: 'Nail Art',
    name: 'Custom Nail Art',
    description: 'From minimalist accents to bold full-set designs, our artists bring your vision to life with hand-painted detail.',
    price: 'from 10',
    duration: 'varies',
    icon: Brush,
  },
  {
    id: 'gel-x-extension',
    category: 'Enhancements',
    name: 'Gel-X Extension',
    description: 'Soft gel extensions applied seamlessly for added length and strength. A damage-free alternative to acrylics.',
    price: '75',
    duration: '75 min',
    icon: Heart,
  },
];

export interface GalleryItem {
  image: string;
  alt: string;
  span?: boolean;
}

export const galleryItems: GalleryItem[] = [
  {
    image: 'https://images.pexels.com/photos/34835286/pexels-photo-34835286/free-photo-of-manicured-hand-with-pink-and-glitter-nail-art.jpeg?auto=compress&cs=tinysrgb&w=800&h=800&fit=crop',
    alt: 'Pink and glitter nail art with rhinestones at Luxe Nail Bar Oakland',
    span: true,
  },
  {
    image: 'https://images.pexels.com/photos/4677850/pexels-photo-4677850.jpeg?auto=compress&cs=tinysrgb&w=600&h=600&fit=crop',
    alt: 'Nail technician working on a client at Luxe Nail Bar Rockridge Oakland',
  },
  {
    image: 'https://images.pexels.com/photos/28713174/pexels-photo-28713174/free-photo-of-vibrant-stiletto-nail-art-design-close-up.jpeg?auto=compress&cs=tinysrgb&w=600&h=600&fit=crop',
    alt: 'Vibrant stiletto nail art design done at Luxe Nail Bar Oakland',
  },
  {
    image: 'https://images.pexels.com/photos/13277178/pexels-photo-13277178.jpeg?auto=compress&cs=tinysrgb&w=600&h=600&fit=crop',
    alt: 'Colorful nail art close-up from Luxe Nail Bar Rockridge',
  },
  {
    image: 'https://images.pexels.com/photos/7066298/pexels-photo-7066298.jpeg?auto=compress&cs=tinysrgb&w=600&h=600&fit=crop',
    alt: 'Gel nails close-up at Luxe Nail Bar Oakland nail salon',
    span: true,
  },
  {
    image: 'https://images.pexels.com/photos/34121866/pexels-photo-34121866/free-photo-of-colorful-avant-garde-nail-art-close-up.jpeg?auto=compress&cs=tinysrgb&w=600&h=600&fit=crop',
    alt: 'Avant-garde colorful nail art from Luxe Nail Bar Rockridge Oakland',
  },
];

export interface Testimonial {
  name: string;
  text: string;
  rating: number;
  location: string;
}

export const testimonials: Testimonial[] = [
  {
    name: 'Maya Thompson',
    text: 'Best nail salon in Oakland, hands down. The Rockridge location is spotless, the staff is incredibly talented, and my gel manicure lasted three weeks without a single chip. The nail art options are endless.',
    rating: 5,
    location: 'Rockridge, Oakland',
  },
  {
    name: 'Priya Sharma',
    text: 'I came in for a spa pedicure and left feeling like a new person. The atmosphere is so relaxing and the attention to detail is unmatched. I have finally found my go-to nail bar in Oakland.',
    rating: 5,
    location: 'Temescal, Oakland',
  },
  {
    name: 'Danielle Brooks',
    text: 'Their custom nail art is genuinely artwork. I bring in inspiration photos and they nail it every single time. Worth every penny and the online booking makes it so easy to reserve a slot.',
    rating: 5,
    location: 'Piedmont, Oakland',
  },
  {
    name: 'Sofia Nguyen',
    text: 'Clean, professional, and beautiful. The Gel-X extensions look natural and lasted a full month. I love that they prioritize nail health over everything. Highly recommend to anyone in the East Bay.',
    rating: 5,
    location: 'Berkeley, CA',
  },
];

export interface FAQItem {
  question: string;
  answer: string;
}

export const faqs: FAQItem[] = [
  {
    question: 'Where is Luxe Nail Bar located?',
    answer: 'We are located at 5612 College Avenue in the heart of the Rockridge neighborhood in Oakland, CA 94618, just steps from the Rockridge BART station.',
  },
  {
    question: 'Do I need an appointment or can I walk in?',
    answer: 'We welcome both appointments and walk-ins. Booking online guarantees your preferred time and technician, so we recommend reserving your spot ahead of time, especially on weekends.',
  },
  {
    question: 'What services does Luxe Nail Bar offer?',
    answer: 'We offer classic and gel manicures, luxury spa pedicures, dip powder and Gel-X enhancements, custom nail art, and a range of luxury nail care treatments.',
  },
  {
    question: 'What are your hours?',
    answer: 'We are open Tuesday through Friday 9:30 AM to 7:00 PM, Saturday 9:00 AM to 6:00 PM, and Sunday 10:00 AM to 4:00 PM. We are closed on Mondays.',
  },
  {
    question: 'Do you sanitize your tools?',
    answer: 'Absolutely. All metal tools are hospital-grade sterilized between every client, and we use single-use files and buffers. Hygiene and your safety are our top priorities.',
  },
];
