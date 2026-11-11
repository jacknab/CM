/**
 * The sample barbershop: the template's own preview only (no shop is loaded). A real shop's page never shows any of
 * it (context/SiteContext.tsx).
 */
export const shop = {
  name: "King's Row Barber Co.",
  nameFirst: "King's Row",
  nameRest: 'Barber Co.',
  phone: '(312) 555-9247',
  phoneHref: 'tel:+13125559247',
  street: '847 W. Randolph Street',
  cityLine: 'Chicago, IL 60607',
  eyebrow: 'Est. 2018 — Chicago, Illinois',
  heroText: "Step into a world where timeless grooming techniques meet contemporary style, right in the heart of Chicago's West Loop.",
  about: "We don't just shape hair — we build connections and craft memories. King's Row Barber Co. is where every visit feels like coming home.",
  footerText: "Where tradition meets trend in men's grooming. Serving Chicago's West Loop since 2018.",
  hours: [
    { day: 'Monday', time: '9:00 AM – 7:00 PM', closed: false },
    { day: 'Tuesday', time: '9:00 AM – 7:00 PM', closed: false },
    { day: 'Wednesday', time: '9:00 AM – 7:00 PM', closed: false },
    { day: 'Thursday', time: '9:00 AM – 7:00 PM', closed: false },
    { day: 'Friday', time: '9:00 AM – 7:00 PM', closed: false },
    { day: 'Saturday', time: '9:00 AM – 5:00 PM', closed: false },
    { day: 'Sunday', time: 'Closed', closed: true },
  ],
};

export const services = [
  { id: 1, name: "Gentleman's Haircut", description: "Classic and contemporary cuts perfected — a blend of tradition and today's style.", price: 28, duration: '45 min', category: 'Haircuts', popular: true },
  { id: 2, name: 'Senior Cut', description: 'A discounted cut exclusively for gentlemen aged 60 and older.', price: 24, duration: '30 min', category: 'Haircuts' },
  { id: 3, name: 'Buzz Cut', description: 'Single blade clipper only haircut. One clean length all over.', price: 22, duration: '20 min', category: 'Haircuts' },
  { id: 4, name: 'Beard Trim', description: 'Sculpting stories, one masterful beard trim at a time.', price: 16, duration: '20 min', category: 'Beard' },
  { id: 5, name: 'Cut & Beard Combo', description: 'A full haircut paired with a precise beard trim and shape-up.', price: 32, duration: '1 hr', category: 'Haircuts' },
  { id: 6, name: 'Hot Towel Head Shave', description: 'Hot lather, steam towel, premium pre & after-shave products finished with moisturizer.', price: 32, duration: '45 min', category: 'Shaves' },
  { id: 7, name: 'Hot Towel Face Shave', description: 'Hot lather, steam towels, premium shave products and moisturizer.', price: 26, duration: '30 min', category: 'Shaves' },
  { id: 8, name: "Men's Facial", description: 'Facial cleanser, black charcoal mask, astringent, and face moisturizer.', price: 26, duration: '30 min', category: 'Grooming' },
  { id: 9, name: '"The King" Deluxe', description: 'Pick 3: haircut or head shave + face shave or beard trim + charcoal mask or massage.', price: 55, duration: '1 hr 30 min', category: 'Packages' },
];

/** The sample's founder quote (a real shop shows one of its own reviews here instead). */
export const featuredQuote = {
  text: "At King's Row Barber Co., our mission is to provide the community with both current and traditional haircuts and grooming services — blending modern and old-school techniques, all while prioritizing client satisfaction and fostering good conversation.",
  name: 'Marcus Webb',
  label: 'Founder & Master Barber',
  photo: 'https://images.pexels.com/photos/2379005/pexels-photo-2379005.jpeg?auto=compress&cs=tinysrgb&w=200',
};

export const pillars = [
  { title: 'Community First', body: 'A barbershop where grooming becomes a community event — fostering friendships and memorable conversations.' },
  { title: 'Blend of Eras', body: 'Celebrating the best of both worlds: time-honored grooming techniques and contemporary haircut styles.' },
  { title: 'Client Centric', body: 'Every snip, trim, and shave is a direct reflection of our commitment to your satisfaction.' },
  { title: 'Laughter & Precision', body: 'A balance of lighthearted moments and uncompromised professionalism in every service we provide.' },
];

const px = (id: number) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=800`;
export const gallery = [
  { url: px(1570807), alt: 'Precision fade' },
  { url: px(1453005), alt: 'Classic cut' },
  { url: px(3998428), alt: 'Beard styling' },
  { url: px(2040189), alt: 'Hot towel shave' },
  { url: px(3992874), alt: 'Shop interior' },
  { url: px(897271), alt: 'Finishing touches' },
];
