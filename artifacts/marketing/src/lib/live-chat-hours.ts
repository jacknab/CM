/**
 * When live chat is staffed: every day, 10am to 9pm US Eastern time.
 * The chat launcher and the Contact page's chat button exist only inside
 * these hours.
 */
export const LIVE_CHAT_OPEN_HOUR = 10;
export const LIVE_CHAT_CLOSE_HOUR = 21;
export const LIVE_CHAT_TIME_ZONE = 'America/New_York';

export function isLiveChatOpen(now: Date = new Date()): boolean {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: LIVE_CHAT_TIME_ZONE,
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(now),
  );
  return hour >= LIVE_CHAT_OPEN_HOUR && hour < LIVE_CHAT_CLOSE_HOUR;
}
