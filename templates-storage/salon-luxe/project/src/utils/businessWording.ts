/**
 * The words the site uses for the kind of business it belongs to, from the salon's own category.
 * Says only what the category makes true: it never names a service the salon may not offer.
 */
export interface BusinessWording {
  /** After the business name: "Hair Salon in Denver". */
  label: string;
  /** Inside a sentence: "Skin Fade at our barbershop". */
  place: string;
  /** Under the name in the footer. */
  footer: string;
  /** The welcome text under the name. */
  intro: string;
  /** The hero photo's description. */
  heroAlt: (salonName: string) => string;
  /** A gallery photo's description when it has no caption. */
  galleryAlt: (salonName: string, photo: number) => string;
}

const BOOK = 'Book your appointment in seconds — no account required.';

const general = (label: string, place: string, footer: string, services: string): BusinessWording => ({
  label,
  place,
  footer,
  intro: `Professional ${services} tailored to you, with care and attention from start to finish. ${BOOK}`,
  heroAlt: (salonName) => `${salonName}, ${label}`,
  galleryAlt: (salonName, photo) => `${salonName} — photo ${photo}`,
});

export const NAIL_WORDING: BusinessWording = {
  label: 'Nail Salon',
  place: 'nail salon',
  footer: 'Nail Studio',
  intro: `From flawless gel manicures to show-stopping custom nail art, our master technicians deliver a pampering experience you will not find anywhere else. ${BOOK}`,
  heroAlt: (salonName) => `A professional nail technician performing a luxury manicure at ${salonName}`,
  galleryAlt: (salonName, photo) => `${salonName} nail art — photo ${photo}`,
};

/** A category with nothing more specific gets neutral words. */
const NEUTRAL = general('Beauty Services', 'salon', 'Professional Beauty Services', 'beauty services');

export function businessWording(category: string | null | undefined): BusinessWording {
  const c = String(category ?? '').toLowerCase();
  if (/nail/.test(c)) return NAIL_WORDING;
  if (/barber/.test(c)) return general('Barbershop', 'barbershop', 'Barbershop', 'barbering services');
  if (/hair/.test(c)) return general('Hair Salon', 'hair salon', 'Hair Salon', 'hair services');
  if (/spa/.test(c)) return general('Day Spa', 'spa', 'Day Spa', 'spa services');
  if (/beauty/.test(c)) return general('Beauty Salon', 'beauty salon', 'Beauty Salon', 'beauty services');
  return NEUTRAL;
}
