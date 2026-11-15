import { describe, expect, it } from 'vitest';
import { isLiveChatOpen } from '../live-chat-hours';

describe('live chat hours (all day, Tom and Marel answer)', () => {
  it('is open late at night Eastern', () => {
    expect(isLiveChatOpen(new Date('2026-10-12T07:00:00Z'))).toBe(true);
  });
  it('is open in the afternoon', () => {
    expect(isLiveChatOpen(new Date('2026-10-12T18:00:00Z'))).toBe(true);
  });
});
