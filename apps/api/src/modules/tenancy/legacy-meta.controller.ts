import {Body,Controller,ForbiddenException,Get,Headers,Param,Post,BadRequestException} from '@nestjs/common';
import {ApiBearerAuth,ApiTags} from '@nestjs/swagger';
import {PoolClient} from 'pg';
import {DatabaseService} from '../../db/database.service';
import {IdentityService} from '../identity/identity.service';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const settings=new Set(['invoiceNumberSettings','invoiceNumberSeries','costCentres',
 'stockAlertSettings','invoiceDisplayOptions','regionMode','enabledModules']);
function validKey(key:string) {
 if(typeof key!=='string'||key.length<1||key.length>180||key==='appLock'||
   /[\x00-\x1f]/.test(key))throw new BadRequestException('Invalid settings key');
 return key;
}
@ApiTags('original-fork-settings')
@ApiBearerAuth()
@Controller('tenants/:tenantId/companies/:companyId/legacy-meta')
export class LegacyMetaController {
 constructor(private readonly identity:IdentityService,private readonly db:DatabaseService){}
 private async scoped<T>(auth:string|undefined,tenant:string,company:string,write:boolean,fn:(client:PoolClient)=>Promise<T>):Promise<T>{
   const user=await this.identity.authenticate(auth);
   const member=await this.identity.requireMember(user,tenant);
   if(!UUID.test(company) || (write&&!['owner','admin','member'].includes(member.role)))
     throw new ForbiddenException('Company settings access denied');
   return this.db.withTenant(tenant,async client=>{
     const result=await client.query('SELECT id FROM companies WHERE tenant_id=$1 AND id=$2',[tenant,company]);
     if(!result.rowCount)throw new ForbiddenException('Company not accessible');
     return fn(client);
   });
 }
 @Get(':key')
 async get(@Headers('authorization')auth:string|undefined,@Param('tenantId')tenant:string,
   @Param('companyId')company:string,@Param('key')rawKey:string) {
   const key=validKey(rawKey);
   return this.scoped(auth,tenant,company,false,async client=>{
     const row=await client.query<{value:unknown}>(
       'SELECT value FROM company_meta WHERE tenant_id=$1 AND company_id=$2 AND key=$3',[tenant,company,key]);
     return {value:row.rows[0]?.value??null};
   });
 }
 @Post(':key')
 async set(@Headers('authorization')auth:string|undefined,@Param('tenantId')tenant:string,
   @Param('companyId')company:string,@Param('key')rawKey:string,@Body()input:unknown) {
   const key=validKey(rawKey);
   if(!settings.has(key))throw new ForbiddenException('Only reviewed company settings may be changed');
   if(!input||typeof input!=='object'||Array.isArray(input)||!Object.hasOwn(input,'value'))
     throw new BadRequestException('Invalid settings value');
   const value=(input as Record<string,unknown>).value;
   const json=JSON.stringify(value);
   if(json===undefined||json.length>30_000)throw new BadRequestException('Settings too large');
   return this.scoped(auth,tenant,company,true,async client=>{
     await client.query(
       `INSERT INTO company_meta(tenant_id,company_id,key,value) VALUES($1,$2,$3,$4::jsonb)
        ON CONFLICT(tenant_id,company_id,key) DO UPDATE SET value=excluded.value,updated_at=now()`,
       [tenant,company,key,json]);
     return {success:true};
   });
 }
 @Post(':key/increment')
 async increment(@Headers('authorization')auth:string|undefined,@Param('tenantId')tenant:string,
   @Param('companyId')company:string,@Param('key')rawKey:string,@Body()input:unknown) {
   const key=validKey(rawKey);
   if(settings.has(key))throw new ForbiddenException('Settings cannot be incremented');
   const start=(input as Record<string,unknown>|undefined)?.start;
   if(start!==undefined && (!Number.isSafeInteger(start)||Number(start)<1||Number(start)>1_000_000))
     throw new BadRequestException('Invalid counter start');
   const minimum=Number(start??1);
   return this.scoped(auth,tenant,company,true,async client=>{
     const result=await client.query<{value:number}>(
       `INSERT INTO company_meta(tenant_id,company_id,key,value) VALUES($1,$2,$3,to_jsonb($4::integer))
        ON CONFLICT(tenant_id,company_id,key) DO UPDATE
        SET value=to_jsonb(greatest(
          CASE WHEN jsonb_typeof(company_meta.value)='number'
            THEN (company_meta.value #>> '{}')::integer+1 ELSE 1 END,$4::integer)),
            updated_at=now()
        RETURNING (value #>> '{}')::integer AS value`,
       [tenant,company,key,minimum]);
     return {value:result.rows[0].value};
   });
 }
}
