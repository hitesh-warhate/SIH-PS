import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Time-based one-time passwords (RFC 6238, SHA-1, 6 digits, 30-second steps), the format authenticator apps use.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32(buf) {
  let bits = '', out = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  for (let i = 0; i < bits.length; i += 5) out += ALPHABET[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return out;
}
export function fromBase32(s) {
  let bits = '';
  for (const c of s.replace(/=+$/, '').toUpperCase()) bits += ALPHABET.indexOf(c).toString(2).padStart(5, '0');
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export const newSecret = () => base32(randomBytes(20));

export function codeAt(secret, timeMs = Date.now(), step = 30) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(timeMs / 1000 / step)));
  const h = createHmac('sha1', fromBase32(secret)).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

// Accepts the current step and one either side, to allow for a slow clock.
export function verifyCode(secret, code, timeMs = Date.now()) {
  if (!/^\d{6}$/.test(String(code ?? ''))) return false;
  return [-1, 0, 1].some((d) => {
    const want = Buffer.from(codeAt(secret, timeMs + d * 30_000));
    return timingSafeEqual(want, Buffer.from(String(code)));
  });
}

export const otpauthUri = (secret, account) => `otpauth://totp/PatientCase_AI:${encodeURIComponent(account)}?secret=${secret}&issuer=PatientCase_AI&digits=6&period=30`;
