import { Body, Controller, ForbiddenException, Get, Headers, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DatabaseService } from '../../db/database.service';
import { IdentityService } from '../identity/identity.service';
import { validateCompanySetup } from './company-setup';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@ApiTags('tenancy')
@ApiBearerAuth()
@Controller('tenants/:tenantId/companies')
export class CompaniesController {
  constructor(private readonly identity: IdentityService, private readonly db: DatabaseService) {}

  @Get()
  async list(@Headers('authorization') authorization: string | undefined, @Param('tenantId') tenantId: string) {
    const userId = await this.identity.authenticate(authorization);
    await this.identity.requireMember(userId, tenantId);
    return this.db.withTenant(tenantId, async client => {
      return (await client.query(
        'SELECT id, legal_name, trade_name, gstin, state_code, billing_email, billing_address, onboarding_completed_at FROM companies ORDER BY legal_name LIMIT 100'
      )).rows;
    });
  }

  @Patch(':companyId/setup')
  async setup(
    @Headers('authorization') authorization: string | undefined,
    @Param('tenantId') tenantId: string,
    @Param('companyId') companyId: string,
    @Body() input: unknown
  ) {
    const userId = await this.identity.authenticate(authorization);
    const membership = await this.identity.requireMember(userId, tenantId);
    if (!['owner','admin'].includes(membership.role) || !UUID.test(companyId))
      throw new ForbiddenException('Company setup requires workspace administration');
    const company = validateCompanySetup(input);
    return this.db.withTenant(tenantId, async client => {
      // RLS and tenant ID are both applied. Do not permit company or tenant reparenting.
      const result = await client.query(
        `UPDATE companies SET legal_name=$3, trade_name=$4, gstin=$5,
         state_code=$6, billing_email=$7, billing_address=$8::jsonb, onboarding_completed_at=now()
         WHERE tenant_id=$1 AND id=$2
         RETURNING id, legal_name, trade_name, gstin, state_code, billing_email, billing_address, onboarding_completed_at`,
        [tenantId,companyId,company.legalName,company.tradeName,company.gstin,
         company.stateCode,company.billingEmail,JSON.stringify(company.billingAddress)]);
      if (!result.rows[0]) throw new ForbiddenException('Company is not available in this workspace');
      return result.rows[0];
    });
  }
}
