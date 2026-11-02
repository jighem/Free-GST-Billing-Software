import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow } from 'pg';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly auth = new Pool({ connectionString: required('AUTH_DATABASE_URL'), max: 5 });
  private readonly tenant = new Pool({ connectionString: required('DATABASE_URL'), max: 10 });

  async identityQuery<T extends QueryResultRow>(sql: string, args: unknown[] = []): Promise<T[]> {
    return (await this.auth.query<T>(sql, args)).rows;
  }

  async withTenant<T>(tenantId: string, action: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
      throw new Error('Invalid tenant ID');
    }
    const client = await this.tenant.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      const result = await action(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* preserve error */ }
      throw e;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.auth.end(), this.tenant.end()]);
  }
}
