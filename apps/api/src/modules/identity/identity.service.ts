import { Injectable, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { DatabaseService } from '../../db/database.service';
import { verifyPassword } from './password';

type User = { id: string; password_hash: string | null };
type Session = { user_id: string };
export type Membership = { tenant_id: string; display_name: string; role: string };

@Injectable()
export class IdentityService {
  constructor(private readonly db: DatabaseService) {}

  async login(email: unknown, password: unknown) {
    if (typeof email !== 'string' || typeof password !== 'string' ||
        email.length > 254 || password.length > 1024) throw new UnauthorizedException('Invalid credentials');
    const users = await this.db.identityQuery<User>(
      'SELECT id, password_hash FROM users WHERE email = lower($1) LIMIT 1',
      [email.trim().toLowerCase()]);
    if (!users[0] || !(await verifyPassword(password, users[0].password_hash)))
      throw new UnauthorizedException('Invalid credentials');
    const token = randomBytes(32).toString('base64url');
    const digest = createHash('sha256').update(token).digest('hex');
    await this.db.identityQuery(
      "INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '12 hours')",
      [users[0].id, digest]);
    return { access_token: token, token_type: 'Bearer', expires_in: 43200 };
  }

  async authenticate(header: string | undefined): Promise<string> {
    const match = /^Bearer ([A-Za-z0-9_-]{40,128})$/.exec(header || '');
    if (!match) throw new UnauthorizedException();
    const digest = createHash('sha256').update(match[1]).digest('hex');
    const session = await this.db.identityQuery<Session>(
      'SELECT user_id FROM user_sessions WHERE token_hash = $1 AND expires_at > now() LIMIT 1', [digest]);
    if (!session[0]) throw new UnauthorizedException();
    return session[0].user_id;
  }

  async memberships(userId: string): Promise<Membership[]> {
    return this.db.withAuthenticatedUser(userId, async client => {
      const result = await client.query<Membership>(
        `SELECT m.tenant_id, m.role, t.display_name
         FROM tenant_memberships m JOIN tenants t ON t.id=m.tenant_id
         WHERE m.user_id=$1 AND t.status='active' ORDER BY t.display_name`, [userId]);
      return result.rows;
    });
  }

  async requireMember(userId: string, tenantId: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId))
      throw new ForbiddenException();
    const membership = (await this.memberships(userId)).find(x => x.tenant_id === tenantId);
    if (!membership) throw new ForbiddenException();
    return membership;
  }
}
