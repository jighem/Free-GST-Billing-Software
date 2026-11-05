import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// Never log the encryption key or plaintext verification links.
// Key must be 32 cryptographically random bytes encoded as 64 hex chars.
function key(): Buffer {
  const raw = process.env.REGISTRATION_MAIL_KEY || '';
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) throw new Error('REGISTRATION_MAIL_KEY must be 64 hex characters');
  return Buffer.from(raw, 'hex');
}

export function encryptVerificationLink(url: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), nonce);
  const ciphertext = Buffer.concat([cipher.update(url, 'utf8'), cipher.final()]);
  return [nonce.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptVerificationLink(value: string): string {
  const parts = value.split('.');
  if (parts.length !== 3) throw new Error('Invalid encrypted payload');
  const [nonce, authTag, ciphertext] = parts.map(p => Buffer.from(p, 'base64url'));
  if (nonce.length !== 12 || authTag.length !== 16) throw new Error('Invalid encrypted payload');
  const decipher = createDecipheriv('aes-256-gcm', key(), nonce);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
