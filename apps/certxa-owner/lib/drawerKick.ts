/**
 * drawerKick.ts — the ESC/POS "open cash drawer" command (pure, unit-tested).
 * ESC p m t1 t2: a 50 ms pulse on drawer pin 2 (m=0) then pin 5 (m=1), so a drawer wired to
 * either pin opens. Sent to the receipt printer, which drives the drawer through its RJ11 port.
 */
export const DRAWER_KICK_BYTES: readonly number[] = [0x1b, 0x70, 0x00, 0x19, 0xfa, 0x1b, 0x70, 0x01, 0x19, 0xfa];

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(bytes: readonly number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    const n = (b0 << 16) | ((b1 ?? 0) << 8) | (b2 ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (b1 === undefined ? '=' : B64[(n >> 6) & 63]) + (b2 === undefined ? '=' : B64[n & 63]);
  }
  return out;
}

export function drawerKickBase64(): string {
  return toBase64(DRAWER_KICK_BYTES);
}
