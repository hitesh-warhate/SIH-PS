import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

// Field-level encryption (AES-256-GCM) and keyed hashing (HMAC-SHA256) for identifiers and mobile numbers (DBR-5).
// Key management is hardened in Phase 8.
export function createCrypto({ encryptionKey, hashKey }) {
  return {
    encrypt(plain) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
      const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
      return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
    },
    decrypt(blob) {
      const [v, iv, tag, ct] = String(blob).split(':');
      if (v !== 'v1') throw new Error('unknown ciphertext version');
      const d = createDecipheriv('aes-256-gcm', encryptionKey, Buffer.from(iv, 'base64'));
      d.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
    },
    // Files: iv (12) | auth tag (16) | ciphertext.
    encryptBuffer(buf) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
      const ct = Buffer.concat([cipher.update(buf), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), ct]);
    },
    decryptBuffer(blob) {
      const d = createDecipheriv('aes-256-gcm', encryptionKey, blob.subarray(0, 12));
      d.setAuthTag(blob.subarray(12, 28));
      return Buffer.concat([d.update(blob.subarray(28)), d.final()]);
    },
    hash(value) {
      return createHmac('sha256', hashKey).update(String(value)).digest('hex');
    },
  };
}

// ENCRYPTION_KEY and HASH_KEY are 64 hex characters. Outside production they fall back to keys derived from JWT_SECRET.
export function cryptoFromEnv(env, { isProd }) {
  const derive = (label) => Buffer.from(hkdfSync('sha256', env.JWT_SECRET ?? 'dev', '', `patientcase-${label}`, 32));
  const fromHex = (name) => {
    if (!env[name]) {
      if (isProd) throw new Error(`${name} must be set in production (64 hex characters).`);
      return null;
    }
    if (!/^[0-9a-f]{64}$/i.test(env[name])) throw new Error(`${name} must be 64 hex characters.`);
    return Buffer.from(env[name], 'hex');
  };
  return createCrypto({
    encryptionKey: fromHex('ENCRYPTION_KEY') ?? derive('enc'),
    hashKey: fromHex('HASH_KEY') ?? derive('hash'),
  });
}
