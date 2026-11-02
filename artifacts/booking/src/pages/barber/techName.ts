/**
 * How /nail shows a technician's name (owner, 2026-10-29): first name only. When two techs in the salon share a first
 * name, the first letter of the last name is added ("Lisa N."). When that can't tell them apart — no last name on
 * file, or the same initial — they get a letter instead: "Lisa A", "Lisa B" (in the order they were added).
 *
 * The roster is the salon's staff list, set by the /nail screen while it is open (setTechRoster). With no roster
 * (any other screen) a name is shown as it is.
 */
export interface RosterTech { id: number; name: string }

const words = (name: string) => name.trim().split(/\s+/).filter(Boolean);

/** Short labels for the whole salon, by staff id. */
export function techLabels(roster: RosterTech[]): Map<number, string> {
  const labels = new Map<number, string>();
  const byFirst = new Map<string, RosterTech[]>();
  for (const t of [...roster].sort((a, b) => a.id - b.id)) {
    const first = words(t.name)[0];
    if (!first) { labels.set(t.id, t.name); continue; }
    const key = first.toLowerCase();
    byFirst.set(key, [...(byFirst.get(key) ?? []), t]);
  }
  for (const group of byFirst.values()) {
    const first = (t: RosterTech) => words(t.name)[0];
    if (group.length === 1) { labels.set(group[0].id, first(group[0])); continue; }
    const initial = (t: RosterTech) => (words(t.name)[1]?.[0] ?? "").toUpperCase();
    const initialCount = new Map<string, number>();
    for (const t of group) initialCount.set(initial(t), (initialCount.get(initial(t)) ?? 0) + 1);
    let letter = 0;
    for (const t of group) {
      const i = initial(t);
      labels.set(t.id, i && initialCount.get(i) === 1 ? `${first(t)} ${i}.` : `${first(t)} ${String.fromCharCode(65 + letter++)}`);
    }
  }
  return labels;
}

let byId = new Map<number, string>();
let byName = new Map<string, string>();
let firstNames = new Map<string, number>();

export function setTechRoster(roster: RosterTech[] | null): void {
  const list = roster ?? [];
  byId = techLabels(list);
  byName = new Map();
  firstNames = new Map();
  const nameCount = new Map<string, number>();
  for (const t of list) nameCount.set(t.name.trim().toLowerCase(), (nameCount.get(t.name.trim().toLowerCase()) ?? 0) + 1);
  for (const t of list) {
    const key = t.name.trim().toLowerCase();
    // Two techs with the very same full name can only be told apart by id.
    if (nameCount.get(key) === 1) byName.set(key, byId.get(t.id) ?? t.name);
    const first = words(t.name)[0]?.toLowerCase();
    if (first) firstNames.set(first, (firstNames.get(first) ?? 0) + 1);
  }
}

/** A technician's name as /nail shows it. Pass the staff id when there is one. */
export function techLabel(name: string | null | undefined, id?: number | null): string {
  if (!name) return name ?? "";
  if (id != null && byId.has(id)) return byId.get(id)!;
  const known = byName.get(name.trim().toLowerCase());
  if (known) return known;
  if (firstNames.size === 0) return name;
  // Not on the roster (e.g. removed since): first name, or the full name when that first name is shared.
  const first = words(name)[0];
  return first && (firstNames.get(first.toLowerCase()) ?? 0) === 0 ? first : name;
}
