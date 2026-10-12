import { describe, expect, it } from 'vitest';
import { isLiveChatOpen } from '../live-chat-hours';

// October is daylight time: Eastern = UTC-4.
describe('live chat hours (10am–9pm Eastern, every day)', () => {
  it('is closed just before 10am Eastern', () => {
    expect(isLiveChatOpen(new Date('2026-10-12T13:59:00Z'))).toBe(false);
  });
  it('opens at 10am Eastern', () => {
    expect(isLiveChatOpen(new Date('2026-10-12T14:00:00Z'))).toBe(true);
  });
  it('is open until just before 9pm Eastern', () => {
    expect(isLiveChatOpen(new Date('2026-10-13T00:59:00Z'))).toBe(true);
  });
  it('closes at 9pm Eastern', () => {
    expect(isLiveChatOpen(new Date('2026-10-13T01:00:00Z'))).toBe(false);
  });
  it('is open on a Sunday afternoon', () => {
    expect(isLiveChatOpen(new Date('2026-10-11T18:00:00Z'))).toBe(true);
  });
  it('follows Eastern standard time in winter (UTC-5)', () => {
    expect(isLiveChatOpen(new Date('2026-12-01T14:30:00Z'))).toBe(false);
    expect(isLiveChatOpen(new Date('2026-12-01T15:00:00Z'))).toBe(true);
  });
});
