import { Controller, Get, Headers, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DatabaseService } from '../../db/database.service';
import { IdentityService } from '../identity/identity.service';

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
      return (await client.query('SELECT id, legal_name, gstin, state_code FROM companies ORDER BY legal_name LIMIT 100')).rows;
    });
  }
}
