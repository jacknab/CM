/**
 * Quick Check-in (owner, 2026-10-29): a client who won't give a phone number is checked in by name. It must not become
 * the quick way techs check everyone in, so the name has to be a real one: at least 3 letters, with a vowel, and not
 * one letter over and over. Keyboard mash ("mmm", "mmw", "wmw", "wmm") is refused, and the screen clears the name so
 * it has to be typed again. Short real names (Bob, Ann, Lee, Ng is too short) pass or fail on the same plain rules.
 */
export function quickNameProblem(name: string): string | null {
  const letters = name.toLowerCase().replace(/[^a-z]/g, "");
  if (letters.length < 3) return "Enter the client's name: at least 3 letters.";
  if (!/[aeiouy]/.test(letters) || new Set(letters).size === 1) return "That doesn't look like a name. Ask the client for their name and enter it.";
  return null;
}
