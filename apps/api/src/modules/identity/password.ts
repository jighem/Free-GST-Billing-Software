import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 1024) throw Error('Password must be 12-1024 characters');
  const salt = randomBytes(16).toString('hex');
  const digest = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${digest.toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored || typeof password !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt' ||
      !/^[0-9a-f]{32}$/.test(parts[1]) || !/^[0-9a-f]{128}$/.test(parts[2])) return false;
  const actual = (await scrypt(password, parts[1], 64)) as Buffer;
  return timingSafeEqual(actual, Buffer.from(parts[2], 'hex'));
}
