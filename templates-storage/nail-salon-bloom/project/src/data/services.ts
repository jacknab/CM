export interface Service {
  id: string;
  name: string;
  description: string;
  price: number;
  durationMinutes: number;
  category: 'Manicure' | 'Pedicure' | 'Extensions' | 'Add-On';
  popular?: boolean;
}

export const services: Service[] = [
  {
    id: 'classic-manicure',
    name: 'Classic Manicure',
    description: 'A timeless manicure featuring nail shaping, cuticle care, hand massage, and your choice of polish.',
    price: 35,
    durationMinutes: 45,
    category: 'Manicure',
  },
  {
    id: 'gel-manicure',
    name: 'Gel Manicure',
    description: 'Long-lasting, high-shine gel polish cured under LED light. Stays flawless for up to three weeks.',
    price: 50,
    durationMinutes: 60,
    category: 'Manicure',
    popular: true,
  },
  {
    id: 'spa-pedicure',
    name: 'Spa Pedicure',
    description: 'Aromatic soak, exfoliating scrub, callus removal, and a soothing leg massage finished with polish.',
    price: 55,
    durationMinutes: 60,
    category: 'Pedicure',
    popular: true,
  },
  {
    id: 'deluxe-pedicure',
    name: 'Deluxe Pedicure',
    description: 'Our signature pedicure with a detoxifying foot mask, hot stone massage, and paraffin treatment.',
    price: 75,
    durationMinutes: 75,
    category: 'Pedicure',
  },
  {
    id: 'acrylic-full-set',
    name: 'Acrylic Full Set',
    description: 'Durable, customisable acrylic extensions sculpted to your preferred length and shape.',
    price: 60,
    durationMinutes: 90,
    category: 'Extensions',
  },
  {
    id: 'gel-x-extension',
    name: 'Gel-X Extension',
    description: 'Lightweight, natural-looking soft-gel extensions. Healthier for natural nails than traditional acrylics.',
    price: 70,
    durationMinutes: 90,
    category: 'Extensions',
    popular: true,
  },
  {
    id: 'custom-nail-art',
    name: 'Custom Nail Art',
    description: 'Hand-painted designs, rhinestones, foil accents, and mixed-media art tailored to your vision.',
    price: 15,
    durationMinutes: 30,
    category: 'Add-On',
  },
  {
    id: 'paraffin-treatment',
    name: 'Paraffin Treatment',
    description: 'A warming paraffin dip that deeply moisturises hands or feet, leaving skin soft and rejuvenated.',
    price: 25,
    durationMinutes: 20,
    category: 'Add-On',
  },
];

export const categories = ['Manicure', 'Pedicure', 'Extensions', 'Add-On'] as const;
