/**
 * Text that comes from code shared with /nail (the turn rotation's descriptions…), in a barbershop's words:
 * barber / barbers, never technician or tech (owner, 2026-11-02).
 */
export function barberWords(text: string): string {
  return text
    .replace(/\bTechnicians\b/g, "Barbers").replace(/\btechnicians\b/g, "barbers")
    .replace(/\bTechnician\b/g, "Barber").replace(/\btechnician\b/g, "barber")
    .replace(/\bTech IDs\b/g, "Barber IDs").replace(/\bTech ID\b/g, "Barber ID")
    .replace(/\bTechs\b/g, "Barbers").replace(/\btechs\b/g, "barbers")
    .replace(/\bTech\b/g, "Barber").replace(/\btech\b/g, "barber");
}
