export interface Feature {
  icon: string;
  title: string;
  description: string;
}

export const features: Feature[] = [
  {
    icon: 'Sparkles',
    title: 'Premium Products',
    description:
      'We use only high-quality, non-toxic, vegan, and cruelty-free nail products for lasting, beautiful results.',
  },
  {
    icon: 'ShieldCheck',
    title: 'Hospital-Grade Hygiene',
    description:
      'Every tool is sterilized in a medical-grade autoclave between clients. Your safety is our top priority.',
  },
  {
    icon: 'Gem',
    title: 'Master Nail Artists',
    description:
      'Our award-winning technicians bring years of training and artistry to every set they create.',
  },
  {
    icon: 'Leaf',
    title: 'Relaxing Atmosphere',
    description:
      'Unwind in our serene, light-filled studio designed to feel like a retreat from the moment you arrive.',
  },
];

export interface TeamMember {
  name: string;
  role: string;
  specialty: string;
  image: string;
}

export const team: TeamMember[] = [
  {
    name: 'Mira Castellano',
    role: 'Founder & Master Nail Artist',
    specialty: 'Custom nail art & Gel-X extensions',
    image: 'https://images.pexels.com/photos/1858175/pexels-photo-1858175.jpeg?auto=compress&cs=tinysrgb&w=600',
  },
  {
    name: 'Jada Okafor',
    role: 'Senior Gel Technician',
    specialty: 'Gel manicures & BIAB strength builds',
    image: 'https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=600',
  },
  {
    name: 'Elena Rossi',
    role: 'Spa Pedicure Specialist',
    specialty: 'Luxury spa pedicures & foot care',
    image: 'https://images.pexels.com/photos/733872/pexels-photo-733872.jpeg?auto=compress&cs=tinysrgb&w=600',
  },
  {
    name: 'Priya Nair',
    role: 'Acrylic & Extension Artist',
    specialty: 'Acrylic full sets & sculpted shapes',
    image: 'https://images.pexels.com/photos/762020/pexels-photo-762020.jpeg?auto=compress&cs=tinysrgb&w=600',
  },
];

export interface Testimonial {
  name: string;
  role: string;
  rating: number;
  quote: string;
  initial: string;
}

export const testimonials: Testimonial[] = [
  {
    name: 'Amara Bennett',
    role: 'Regular client',
    rating: 5,
    quote:
      'Absolutely the best nail salon in the city. My gel manicure lasted three full weeks without a single chip, and the artistry on my custom design was flawless.',
    initial: 'A',
  },
  {
    name: 'Sophie Tran',
    role: 'Bride',
    rating: 5,
    quote:
      'They did my nails for my wedding and I could not have been happier. The team was so attentive and the salon is spotlessly clean. Highly recommend for any special occasion.',
    initial: 'S',
  },
  {
    name: 'Jordan Mills',
    role: 'First-time visitor',
    rating: 5,
    quote:
      'Booked online in under a minute and walked into the most relaxing experience. The deluxe pedicure with hot stones was pure heaven. I will definitely be back.',
    initial: 'J',
  },
];

export const salon = {
  name: 'Lacquer & Loom',
  fullName: 'Lacquer & Loom Luxury Nail Studio',
  tagline: 'Where Beauty Meets Artistry',
  phone: '(212) 555-0148',
  phoneHref: 'tel:+12125550148',
  email: 'hello@lacquerandloom.example.com',
  emailHref: 'mailto:hello@lacquerandloom.example.com',
  address: '245 Rosewood Avenue, Suite 5',
  city: 'New York, NY 10012',
  hours: [
    { day: 'Monday', time: 'Closed' },
    { day: 'Tuesday – Friday', time: '9:00 AM – 7:00 PM' },
    { day: 'Saturday', time: '9:00 AM – 6:00 PM' },
    { day: 'Sunday', time: '10:00 AM – 4:00 PM' },
  ],
  social: [
    { label: 'Instagram', href: 'https://www.instagram.com/lacquerandloom', icon: 'Instagram' },
    { label: 'Facebook', href: 'https://www.facebook.com/lacquerandloom', icon: 'Facebook' },
  ],
};
