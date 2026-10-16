/**
 * Job roles for staff, one list per business type (locations.category), and
 * whether each role takes turns by default. A staff member's role is saved as
 * its label in staff.role; staff.takes_turns decides who is in the turn line
 * (getTurnEligibility) and so who counts on the /nail Technicians tile.
 * Front desk doesn't take turns; everyone else does unless switched off on the
 * staff member — a manager who also does nails keeps it on.
 */

export const FRONT_DESK = "Front Desk";
export const MANAGER = "Manager";

const ROLES_BY_TYPE: Array<{ match: RegExp; roles: string[] }> = [
  { match: /nail/i, roles: ["Nail Technician", FRONT_DESK, MANAGER] },
  { match: /barber/i, roles: ["Barber", FRONT_DESK, MANAGER] },
  { match: /hair/i, roles: ["Stylist", "Colorist", FRONT_DESK, MANAGER] },
  { match: /spa/i, roles: ["Massage Therapist", "Esthetician", FRONT_DESK, MANAGER] },
  { match: /esthetic/i, roles: ["Esthetician", FRONT_DESK, MANAGER] },
  { match: /pet|groom/i, roles: ["Groomer", "Bather", FRONT_DESK, MANAGER] },
  { match: /tattoo/i, roles: ["Tattoo Artist", "Piercer", FRONT_DESK, MANAGER] },
];
const OTHER_ROLES = ["Service Provider", FRONT_DESK, MANAGER];

/** The roles offered for a business type, its main service role first. */
export function rolesForBusinessType(category: string | null | undefined): string[] {
  return ROLES_BY_TYPE.find((t) => t.match.test(category ?? ""))?.roles ?? OTHER_ROLES;
}

/** The role a new staff member starts with: the business type's main service role. */
export function defaultRole(category: string | null | undefined): string {
  return rolesForBusinessType(category)[0];
}

/** Whether a role takes turns unless the owner changes it on the staff member. */
export function defaultTakesTurns(role: string | null | undefined): boolean {
  return (role ?? "").trim().toLowerCase() !== FRONT_DESK.toLowerCase();
}

/** A role as the staff screens show it: the old built-in values ("stylist", "manager", ...) become today's labels. */
export function displayRole(role: string | null | undefined, category: string | null | undefined): string {
  const r = (role ?? "").trim();
  if (!r || /^(stylist|technician|staff|custom)$/i.test(r)) return defaultRole(category);
  if (/^manager$/i.test(r)) return MANAGER;
  if (/^(receptionist|front[ _-]?desk)$/i.test(r)) return FRONT_DESK;
  return r;
}
