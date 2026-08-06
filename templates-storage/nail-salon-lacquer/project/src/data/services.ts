export interface Service {
  id: string;
  name: string;
  description: string;
  price: number;
  durationMinutes: number;
  category: 'Manicure' | 'Pedicure' | 'Nail Art' | 'Add-On';
  popular?: boolean;
}

export const services: Service[] = [
  {
    id: 'classic-manicure',
    name: 'Classic Manicure',
    description:
      'A timeless manicure featuring nail shaping, cuticle care, a relaxing hand massage, and your choice of polish.',
    price: 35,
    durationMinutes: 45,
    category: 'Manicure',
  },
  {
    id: 'gel-manicure',
    name: 'Gel Manicure',
    description:
      'Long-lasting, high-shine gel polish that stays flawless for up to three weeks. Cured under LED light for a durable finish.',
    price: 50,
    durationMinutes: 60,
    category: 'Manicure',
    popular: true,
  },
  {
    id: 'spa-pedicure',
    name: 'Spa Pedicure',
    description:
      'Pamper your feet with an aromatic soak, exfoliating scrub, callus removal, and a soothing leg massage finished with polish.',
    price: 55,
    durationMinutes: 60,
    category: 'Pedicure',
    popular: true,
  },
  {
    id: 'deluxe-pedicure',
    name: 'Deluxe Pedicure',
    description:
      'Our signature pedicure with a detoxifying foot mask, hot stone massage, and paraffin treatment for ultimate relaxation.',
    price: 75,
    durationMinutes: 75,
    category: 'Pedicure',
  },
  {
    id: 'acrylic-full-set',
    name: 'Acrylic Full Set',
    description:
      'Durable, customizable acrylic extensions sculpted to your preferred length and shape, finished with polish or gel.',
    price: 60,
    durationMinutes: 90,
    category: 'Nail Art',
  },
  {
    id: 'gel-x-extension',
    name: 'Gel-X Extension',
    description:
      'Lightweight, natural-looking gel extensions applied with a soft-gel system. Healthier for natural nails than traditional acrylics.',
    price: 70,
    durationMinutes: 90,
    category: 'Nail Art',
    popular: true,
  },
  {
    id: 'custom-nail-art',
    name: 'Custom Nail Art',
    description:
      'Express yourself with hand-painted designs, rhinestones, foil accents, and mixed-media art tailored to your vision.',
    price: 15,
    durationMinutes: 30,
    category: 'Nail Art',
  },
  {
    id: 'gel-removal',
    name: 'Gel Removal',
    description:
      'Safe, soak-off removal of gel or acrylic nails with cuticle conditioning to restore your natural nails.',
    price: 20,
    durationMinutes: 30,
    category: 'Add-On',
  },
  {
    id: 'paraffin-treatment',
    name: 'Paraffin Treatment',
    description:
      'A warming paraffin dip that deeply moisturizes hands or feet, leaving skin soft, smooth, and rejuvenated.',
    price: 25,
    durationMinutes: 20,
    category: 'Add-On',
  },
];

export const categories = ['Manicure', 'Pedicure', 'Nail Art', 'Add-On'] as const;
