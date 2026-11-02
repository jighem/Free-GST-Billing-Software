import { Controller, ForbiddenException, Get, Headers, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DatabaseService } from '../../db/database.service';
import { IdentityService } from '../identity/identity.service';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Counts = {
  customers: number;
  invoices: number;
  drafts: number;
  issued: number;
  voided: number;
};

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('tenants/:tenantId/companies/:companyId/dashboard')
export class BillingDashboardController {
  constructor(private readonly identity: IdentityService, private readonly db: DatabaseService) {}

  @Get()
  async overview(
    @Headers('authorization') authorization: string | undefined,
    @Param('tenantId') tenantId: string,
    @Param('companyId') companyId: string
  ) {
    const userId = await this.identity.authenticate(authorization);
    await this.identity.requireMember(userId, tenantId);
    if (!uuid.test(companyId)) throw new ForbiddenException();
    return this.db.withTenant(tenantId, async client => {
      // No tenant ID from request headers and no unscoped read.
      const company = await client.query<{ id: string; legal_name: string }>(
        'SELECT id, legal_name FROM companies WHERE id=$1 AND tenant_id=$2',
        [companyId, tenantId]);
      if (!company.rows[0]) throw new ForbiddenException('Company not accessible');

      // Independent aggregates ensure joins never multiply invoice amounts/counts.
      const stats = await client.query<Counts>(
        `SELECT
          (SELECT count(*)::int FROM customers
           WHERE tenant_id=$1 AND company_id=$2) AS customers,
          (SELECT count(*)::int FROM invoices
           WHERE tenant_id=$1 AND company_id=$2) AS invoices,
          (SELECT count(*)::int FROM invoices
           WHERE tenant_id=$1 AND company_id=$2 AND status='draft') AS drafts,
          (SELECT count(*)::int FROM invoices
           WHERE tenant_id=$1 AND company_id=$2 AND status='issued') AS issued,
          (SELECT count(*)::int FROM invoices
           WHERE tenant_id=$1 AND company_id=$2 AND status='void') AS voided`,
        [tenantId, companyId]);

      return { company: company.rows[0], metrics: stats.rows[0] };
    });
  }
}
