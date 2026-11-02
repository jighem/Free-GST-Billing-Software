import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const password = Buffer.concat(chunks).toString('utf8').replace(/[\r\n]+$/, '');
if (password.length < 12 || password.length > 1024) {
  console.error('Expected password of 12-1024 characters via stdin');
  process.exitCode = 1;
} else {
  const salt = randomBytes(16).toString('hex');
  const digest = await scrypt(password, salt, 64);
  console.log(`scrypt$${salt}$${digest.toString('hex')}`);
}
