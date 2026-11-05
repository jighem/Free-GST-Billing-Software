import {
  Body, Controller, Delete, ForbiddenException, Get, Headers, Param, Post,
  BadRequestException, ConflictException
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DatabaseService } from '../../db/database.service';
import { IdentityService } from '../identity/identity.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
type CustomerRow = { id: string; display_name: string; gstin: string | null; profile: Record<string, unknown> };
const PUBLIC_FIELDS = [
  'address','city','pin','state','email','phone','country','isSEZ',
  'preferredPaperSize','preferredCurrency','autoPrint'
] as const;

function validate(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Invalid customer');
  const obj = input as Record<string, unknown>;
  const name = typeof obj.name==='string'?obj.name.trim():'';
  if(name.length<2 || name.length>200) throw new BadRequestException('Customer name requires 2–200 characters');
  const gstin = typeof obj.gstin==='string'?obj.gstin.trim().toUpperCase():'';
  if(gstin && !GSTIN.test(gstin)) throw new BadRequestException('Invalid GSTIN format');
  if (obj.id!==undefined && (typeof obj.id!=='string' || !UUID.test(obj.id)))
    throw new BadRequestException('Invalid customer ID');
  const profile:Record<string,string|boolean>={};
  for (const key of PUBLIC_FIELDS) {
    const value=obj[key];
    if(value===undefined || value===null) continue;
    if(['isSEZ','autoPrint'].includes(key)) {
      if(typeof value!=='boolean') throw new BadRequestException('Invalid customer preference');
      profile[key]=value;
    } else {
      if(typeof value!=='string' || value.length>500) throw new BadRequestException('Invalid customer field');
      profile[key]=value.trim();
    }
  }
  return { id: obj.id as string | undefined, name, gstin:gstin||null, profile };
}
function toLegacy(row: CustomerRow) {
  return { ...row.profile, id:row.id, name:row.display_name, gstin:row.gstin||'' };
}

@ApiTags('customers')
@ApiBearerAuth()
@Controller('tenants/:tenantId/companies/:companyId/customers')
export class CustomersController {
  constructor(private readonly identity:IdentityService,private readonly db:DatabaseService) {}

  private async access(auth:string|undefined,tenantId:string,companyId:string,write=false) {
    const user=await this.identity.authenticate(auth);
    const member=await this.identity.requireMember(user,tenantId);
    if (!UUID.test(companyId) || (write && !['owner','admin','member'].includes(member.role)))
      throw new ForbiddenException('Customer access denied');
  }
  private async inCompany(tenantId:string,companyId:string,action:(c:import('pg').PoolClient)=>Promise<unknown>) {
    return this.db.withTenant(tenantId,async client=>{
      const company=await client.query('SELECT id FROM companies WHERE tenant_id=$1 AND id=$2',[tenantId,companyId]);
      if(!company.rows.length)throw new ForbiddenException('Company access denied');
      return action(client);
    });
  }

  @Get()
  async list(@Headers('authorization') auth:string|undefined,@Param('tenantId') tenant:string,@Param('companyId') company:string) {
    await this.access(auth,tenant,company);
    return this.inCompany(tenant,company,async client=>{
      const rows=await client.query<CustomerRow>(
        'SELECT id,display_name,gstin,profile FROM customers WHERE tenant_id=$1 AND company_id=$2 ORDER BY display_name LIMIT 500',
        [tenant,company]);
      return rows.rows.map(toLegacy);
    });
  }

  @Post()
  async save(@Headers('authorization') auth:string|undefined,@Param('tenantId') tenant:string,@Param('companyId') company:string,@Body() input:unknown) {
    await this.access(auth,tenant,company,true);
    const data=validate(input);
    return this.inCompany(tenant,company,async client=>{
      let row;
      if (data.id) {
        const existing=await client.query<CustomerRow>(
          'UPDATE customers SET display_name=$4,gstin=$5,profile=$6::jsonb WHERE id=$3 AND tenant_id=$1 AND company_id=$2 RETURNING id,display_name,gstin,profile',
          [tenant,company,data.id,data.name,data.gstin,JSON.stringify(data.profile)]);
        row=existing.rows[0];
        if(!row) throw new ForbiddenException('Customer is not accessible');
      } else {
        const inserted=await client.query<CustomerRow>(
          'INSERT INTO customers (tenant_id,company_id,display_name,gstin,profile) VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING id,display_name,gstin,profile',
          [tenant,company,data.name,data.gstin,JSON.stringify(data.profile)]);
        row=inserted.rows[0];
      }
      return toLegacy(row);
    });
  }

  @Delete(':customerId')
  async remove(@Headers('authorization') auth:string|undefined,@Param('tenantId') tenant:string,@Param('companyId') company:string,@Param('customerId') customer:string) {
    await this.access(auth,tenant,company,true);
    if (!UUID.test(customer)) throw new BadRequestException('Invalid customer ID');
    return this.inCompany(tenant,company,async client=>{
      try {
        const result=await client.query(
          'DELETE FROM customers WHERE tenant_id=$1 AND company_id=$2 AND id=$3 RETURNING id',
          [tenant,company,customer]);
        if (!result.rowCount)throw new ForbiddenException('Customer is not accessible');
        return { deleted:true };
      } catch(e) {
        if((e as {code?:string}).code==='23503')
          throw new ConflictException('Customer has linked invoices and cannot be deleted');
        throw e;
      }
    });
  }
}
