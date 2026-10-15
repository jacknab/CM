/**
 * Titles, descriptions, robots tags and the answer-first summaries for the
 * salon directory (/salons/...). The SSR entry and the pages in the browser
 * both build them here, so the head Google sees after hydration is the same
 * one the server sent (plans/salon-directory.md).
 */
import type { CityListing, DirectoryState, SalonProfile, StateListing } from './api';

export interface DirectoryHead {
  title: string;
  description: string;
  robots: string;
}

const INDEX = 'index, follow, max-image-preview:large, max-snippet:-1';
const NOINDEX = 'noindex, follow';

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

export function directoryRootHead(states: DirectoryState[]): DirectoryHead {
  const total = states.reduce((sum, s) => sum + s.count, 0);
  return {
    title: 'Licensed nail salons by state | Certxa',
    description: `${plural(total, 'licensed nail salon')} in ${plural(states.length, 'state')}, taken from state license records. Salons that book on Certxa show their menu, prices and open times.`,
    robots: states.some((s) => s.indexable) ? INDEX : NOINDEX,
  };
}

export function directoryAboutHead(): DirectoryHead {
  return {
    title: 'How the Certxa salon directory works | Certxa',
    description: 'Where the listings come from, how salons are checked, how reviews are collected, and how to remove a listing.',
    robots: INDEX,
  };
}

export function stateHead(state: StateListing): DirectoryHead {
  const source = state.license ? `, from ${state.license.board} records` : '';
  return {
    title: `Licensed nail salons in ${state.name} | Certxa`,
    description: `${plural(state.count, 'licensed nail salon')} in ${plural(state.cities.length, 'city', 'cities')} across ${state.name}${source}.`,
    robots: state.indexable ? INDEX : NOINDEX,
  };
}

/** Counts behind a city page's opening answer. */
export function cityFacts(city: CityListing): { total: number; booking: number } {
  return { total: city.salons.length, booking: city.salons.filter((s) => s.featured).length };
}

/** The city page's first paragraph: a direct answer built only from the listing data. */
export function citySummary(city: CityListing): string {
  const { total, booking } = cityFacts(city);
  const where = `${city.cityName}, ${city.stateName}`;
  const lead = `There ${total === 1 ? 'is' : 'are'} ${plural(total, 'licensed nail salon')} in ${where} in the Certxa directory`;
  const source = city.license ? `, each with a current license from the ${city.license.board}` : '';
  const book = booking ? ` ${plural(booking, 'salon')} ${booking === 1 ? 'takes' : 'take'} online booking on Certxa.` : '';
  return `${lead}${source}.${book}`;
}

export function cityHead(city: CityListing): DirectoryHead {
  const { total, booking } = cityFacts(city);
  return {
    title: `Nail salons in ${city.cityName}, ${city.stateName} | Certxa`,
    description: `${plural(total, 'licensed nail salon')} in ${city.cityName}, ${city.stateName}${booking ? `; ${booking} book online on Certxa` : ''}. Addresses, phone numbers and state license details.`,
    robots: city.indexable ? INDEX : NOINDEX,
  };
}

export function salonHead(salon: SalonProfile): DirectoryHead {
  const cityState = [salon.city, salon.state].filter(Boolean).join(', ');
  const license = salon.license ? ` Licensed by the ${salon.license.board}, license ${salon.license.number}.` : '';
  return {
    title: cityState ? `${salon.name} | Nail Salon in ${cityState}` : `${salon.name} | Nail Salon`,
    description: `${salon.name} is a nail salon at ${salon.address}.${license}`,
    // Only a salon that books on Certxa has a page with something Google
    // Maps can't show (live menu, prices, booking, Certxa reviews).
    robots: salon.bookingUrl ? INDEX : NOINDEX,
  };
}
