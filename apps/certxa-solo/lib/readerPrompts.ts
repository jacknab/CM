/**
 * readerPrompts.ts — pure text for the prompts the Stripe SDK asks the app to show.
 * The M2 has no screen, so Stripe requires the app to display these itself
 * ("Retry card", "Insert or swipe"…) and the reader software-update progress.
 */

const DISPLAY: Record<string, string> = {
  insertCard: 'INSERT CARD',
  insertOrSwipeCard: 'INSERT OR SWIPE CARD',
  swipeCard: 'SWIPE CARD',
  removeCard: 'REMOVE CARD',
  retryCard: 'RETRY CARD',
  tryAnotherCard: 'TRY ANOTHER CARD',
  tryAnotherReadMethod: 'TRY ANOTHER READ METHOD — TAP, INSERT OR SWIPE',
  multipleContactlessCardsDetected: 'MORE THAN ONE CARD DETECTED — PRESENT ONE CARD',
  cardRemovedTooEarly: 'CARD REMOVED TOO EARLY — RETRY',
  checkMobileDevice: 'CHECK YOUR PHONE',
};

export function displayPrompt(message: string): string {
  return DISPLAY[message] ?? String(message).replace(/([A-Z])/g, ' $1').toUpperCase();
}

const INPUT: Record<string, string> = { tapCard: 'TAP', insertCard: 'INSERT', swipeCard: 'SWIPE' };

/** e.g. ['tapCard','insertCard','swipeCard'] → "TAP, INSERT OR SWIPE CARD" */
export function inputPrompt(options: readonly string[]): string {
  const words = options.map((o) => INPUT[o] ?? String(o).toUpperCase());
  if (words.length === 0) return 'PRESENT CARD';
  if (words.length === 1) return `${words[0]} CARD`;
  return `${words.slice(0, -1).join(', ')} OR ${words[words.length - 1]} CARD`;
}

/** progress is Stripe's 0–1 value as a string, e.g. "0.42". */
export function updateProgressPrompt(progress: string | number): string {
  const n = Math.max(0, Math.min(1, Number(progress)));
  const pct = Number.isFinite(n) ? Math.round(n * 100) : 0;
  return `UPDATING READER SOFTWARE… ${pct}% — KEEP THE READER ON AND NEARBY`;
}

export const UPDATE_STARTING_PROMPT =
  'INSTALLING A READER UPDATE — THIS CAN TAKE SEVERAL MINUTES. KEEP THE READER ON AND NEARBY (BATTERY OVER 50%).';
