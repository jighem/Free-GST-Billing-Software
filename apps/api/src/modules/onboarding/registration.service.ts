import { BadRequestException, ConflictException, Injectable, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { normalizeRegistration } from './registration-policy';
import { hashPassword } from '../identity/password';
import { encryptVerificationLink } from './mail-crypto';

type PendingRegistration = { id: string };
const GENERIC = { message: 'If your request is eligible, a verification email will be sent.' };

@Injectable()
export class RegistrationService implements OnModuleDestroy {
  private readonly pool: Pool;
  private readonly verifyUrl: string;

  constructor() {
    if (!process.env.REGISTRATION_DATABASE_URL) throw Error('Missing REGISTRATION_DATABASE_URL');
    if (!process.env.REGISTRATION_HMAC_SECRET || process.env.REGISTRATION_HMAC_SECRET.length < 32)
      throw Error('Missing strong REGISTRATION_HMAC_SECRET');
    if (!process.env.REGISTRATION_VERIFY_URL) throw Error('Missing REGISTRATION_VERIFY_URL');
    // Fail closed if encryption key is missing or malformed, before enabling signup.
    encryptVerificationLink('registration-key-self-test');
    const parsed = new URL(process.env.REGISTRATION_VERIFY_URL);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash)
      throw Error('REGISTRATION_VERIFY_URL must be an HTTPS page without fragment or credentials');
    this.verifyUrl = parsed.toString();
    this.pool = new Pool({ connectionString: process.env.REGISTRATION_DATABASE_URL, max: 3 });
  }

  private async limit(client: PoolClient, email: string, ip: string): Promise<boolean> {
    for (const [kind, value, max] of [['email', email, 3], ['ip', ip, 10]] as const) {
      const digest = createHmac('sha256', process.env.REGISTRATION_HMAC_SECRET!)
        .update(kind + ':' + value).digest('hex');
      const result = await client.query<{ attempts: number }>(
        `INSERT INTO registration_rate_limits(key_hash,window_start,attempts)
         VALUES($1,date_trunc('hour',now()),1)
         ON CONFLICT(key_hash) DO UPDATE SET
           attempts=CASE WHEN registration_rate_limits.window_start < date_trunc('hour',now())
                          THEN 1 ELSE registration_rate_limits.attempts+1 END,
           window_start=CASE WHEN registration_rate_limits.window_start < date_trunc('hour',now())
                             THEN date_trunc('hour',now()) ELSE registration_rate_limits.window_start END
         RETURNING attempts`, [digest]);
      if (result.rows[0].attempts > max) return false;
    }
    return true;
  }

  private async queue(client: PoolClient, id: string, email: string, token: string): Promise<void> {
    const url = new URL(this.verifyUrl);
    // Hash fragment avoids exposing the token in routine GET access logs.
    url.hash = 'token=' + encodeURIComponent(token);
    await client.query(
      `INSERT INTO registration_mail_outbox(registration_id,recipient_email,payload_ciphertext)
       VALUES ($1,$2,$3)
       ON CONFLICT(registration_id) DO UPDATE SET
         recipient_email=excluded.recipient_email, payload_ciphertext=excluded.payload_ciphertext,
         available_at=now(), attempts=0, locked_until=NULL, sent_at=NULL, last_error_code=NULL`,
      [id, email, encryptVerificationLink(url.toString())]);
  }

  async request(input: unknown, ip: string): Promise<{ message: string }> {
    let draft: ReturnType<typeof normalizeRegistration>;
    try { draft = normalizeRegistration(input); }
    catch { throw new BadRequestException('Invalid registration fields'); }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (!(await this.limit(client, draft.email, ip))) {
        await client.query('COMMIT');
        return GENERIC;
      }
      const existing = await client.query(
        'SELECT 1 FROM users WHERE email=$1 UNION SELECT 1 FROM tenants WHERE slug=$2 LIMIT 1',
        [draft.email, draft.workspaceSlug]);
      if (existing.rowCount) {
        await client.query('COMMIT');
        return GENERIC;
      }
      // Prevent indefinite duplicate pending requests and mail floods. Resend is separate.
      const pending = await client.query(
        'SELECT id FROM registration_requests WHERE email=$1 AND consumed_at IS NULL AND expires_at>now() LIMIT 1',
        [draft.email]);
      if (pending.rowCount) {
        await client.query('COMMIT');
        return GENERIC;
      }
      const token = randomBytes(32).toString('base64url');
      const hash = createHash('sha256').update(token).digest('hex');
      const passwordHash = await hashPassword(draft.password);
      const saved = await client.query<PendingRegistration>(
        `INSERT INTO registration_requests(email,password_hash,company_legal_name,
          requested_slug,verification_token_hash,expires_at)
          VALUES($1,$2,$3,$4,$5,now()+interval '30 minutes') RETURNING id`,
        [draft.email,passwordHash,draft.companyLegalName,draft.workspaceSlug,hash]);
      await this.queue(client, saved.rows[0].id, draft.email, token);
      await client.query('COMMIT');
      return GENERIC;
    } catch {
      try { await client.query('ROLLBACK'); } catch { /* preserve failure */ }
      throw new ServiceUnavailableException('Registration unavailable');
    } finally { client.release(); }
  }

  async resend(emailInput: unknown, ip: string): Promise<{ message: string }> {
    if (typeof emailInput !== 'string' || emailInput.length > 254)
      throw new BadRequestException('Invalid email');
    const email = emailInput.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw new BadRequestException('Invalid email');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (!(await this.limit(client, email, ip))) {
        await client.query('COMMIT');
        return GENERIC;
      }
      const pending = await client.query<PendingRegistration>(
        `SELECT id FROM registration_requests WHERE email=$1 AND consumed_at IS NULL
         AND expires_at>now() ORDER BY requested_at DESC LIMIT 1 FOR UPDATE`, [email]);
      if (!pending.rows[0]) {
        await client.query('COMMIT');
        return GENERIC;
      }
      const token = randomBytes(32).toString('base64url');
      await client.query(
        `UPDATE registration_requests SET verification_token_hash=$2,
         expires_at=now()+interval '30 minutes', dispatched_at=NULL WHERE id=$1`,
        [pending.rows[0].id,createHash('sha256').update(token).digest('hex')]);
      await this.queue(client, pending.rows[0].id, email, token);
      await client.query('COMMIT');
      return GENERIC;
    } catch {
      try { await client.query('ROLLBACK'); } catch { /* preserve failure */ }
      throw new ServiceUnavailableException('Registration unavailable');
    } finally { client.release(); }
  }

  async verify(token: unknown): Promise<{ status: string }> {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{40,128}$/.test(token))
      throw new ConflictException('Invalid or expired verification code');
    const hash = createHash('sha256').update(token).digest('hex');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const found = await client.query<{
        id: string; email: string; password_hash: string;
        requested_slug: string; company_legal_name: string;
      }>(`SELECT id,email,password_hash,requested_slug,company_legal_name
          FROM registration_requests
          WHERE verification_token_hash=$1 AND consumed_at IS NULL AND expires_at>now()
          FOR UPDATE`, [hash]);
      if (!found.rows[0]) {
        await client.query('ROLLBACK');
        throw new ConflictException('Invalid or expired verification code');
      }
      const row = found.rows[0];
      const tenantId = randomUUID();
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
      await client.query('INSERT INTO tenants(id,slug,display_name) VALUES($1,$2,$3)',
        [tenantId,row.requested_slug,row.company_legal_name]);
      const user = await client.query<{ id: string }>(
        'INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id',
        [row.email,row.password_hash]);
      await client.query(
        "INSERT INTO tenant_memberships(tenant_id,user_id,role) VALUES($1,$2,'owner')",
        [tenantId,user.rows[0].id]);
      await client.query('INSERT INTO companies(tenant_id,legal_name) VALUES($1,$2)',
        [tenantId,row.company_legal_name]);
      await client.query('UPDATE registration_requests SET consumed_at=now() WHERE id=$1', [row.id]);
      // Cancel outstanding delivery before COMMIT so the worker skips consumed requests.
      await client.query(
        'UPDATE registration_mail_outbox SET sent_at=now(),locked_until=NULL WHERE registration_id=$1',
        [row.id]);
      await client.query('COMMIT');
      return { status: 'verified' };
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* preserve failure */ }
      if (e instanceof ConflictException) throw e;
      throw new ConflictException('Registration cannot be completed');
    } finally { client.release(); }
  }

  async onModuleDestroy(): Promise<void> { await this.pool.end(); }
}
