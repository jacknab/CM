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
  rating: number;
  quote: string;
  initial: string;
}

export const testimonials: Testimonial[] = [
  {
    name: 'Amara Bennett',
    rating: 5,
    quote: 'Absolutely the best nail salon. My gel manicure lasted three full weeks without a single chip and the artistry was flawless.',
    initial: 'A',
  },
  {
    name: 'Sophie Tran',
    rating: 5,
    quote: 'They did my nails for my wedding and I could not have been happier. The team was so attentive and the salon is spotlessly clean.',
    initial: 'S',
  },
  {
    name: 'Jordan Mills',
    rating: 5,
    quote: 'Booked online in under a minute and walked into the most relaxing experience. The deluxe pedicure was pure heaven.',
    initial: 'J',
  },
];

export const salon = {
  name: 'Bloom Nail Studio',
  tagline: 'Real Results. Real Clients.',
  phone: '(212) 555-0100',
  phoneHref: 'tel:+12125550100',
  email: 'hello@bloom.example.com',
  emailHref: 'mailto:hello@bloom.example.com',
  address: '123 Main Street, Suite 10',
  city: 'New York, NY 10001',
  hours: [
    { day: 'Monday', time: 'Closed' },
    { day: 'Tuesday – Friday', time: '9:00 AM – 7:00 PM' },
    { day: 'Saturday', time: '9:00 AM – 6:00 PM' },
    { day: 'Sunday', time: '10:00 AM – 4:00 PM' },
  ],
};

export interface ValueProp {
  icon: string;
  title: string;
  description: string;
}

export const valueProps: ValueProp[] = [
  {
    icon: 'Sparkles',
    title: 'Premium Products',
    description: 'High-quality, non-toxic, vegan nail products for lasting, beautiful results every visit.',
  },
  {
    icon: 'ShieldCheck',
    title: 'Hospital-Grade Hygiene',
    description: 'Every tool is sterilised in a medical-grade autoclave between clients. Your safety is our priority.',
  },
  {
    icon: 'Gem',
    title: 'Master Nail Artists',
    description: 'Our award-winning technicians bring years of training and artistry to every set they create.',
  },
  {
    icon: 'Leaf',
    title: 'Relaxing Atmosphere',
    description: 'A serene studio designed to feel like a retreat from the moment you arrive.',
  },
];
