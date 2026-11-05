import { Body, Controller, ForbiddenException, Get, Headers, Param, Post, ConflictException, Query, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../db/database.service';
import { IdentityService } from '../identity/identity.service';
import { documentType, financialYear, validateLegacyDraft } from './legacy-invoice-draft';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type InvoiceRow={invoice_number:string;legacy_document:Record<string,unknown>;status:string};
@ApiTags('original-fork-invoices')
@ApiBearerAuth()
@Controller('tenants/:tenantId/companies/:companyId/legacy-invoice-drafts')
export class LegacyInvoiceDraftsController {
 constructor(private readonly identity:IdentityService,private readonly db:DatabaseService){}
 private async scoped<T>(auth:string|undefined,tenant:string,company:string,write:boolean,fn:(client:PoolClient)=>Promise<T>):Promise<T>{
   const user=await this.identity.authenticate(auth);
   const member=await this.identity.requireMember(user,tenant);
   if(!UUID.test(company) || (write&&!['owner','admin','member'].includes(member.role)))
     throw new ForbiddenException('Invoice access denied');
   return this.db.withTenant(tenant,async client=>{
     const exists=await client.query('SELECT id FROM companies WHERE tenant_id=$1 AND id=$2',[tenant,company]);
     if(!exists.rowCount)throw new ForbiddenException('Company access denied');
     return fn(client);
   });
 }
 @Get()
 async list(@Headers('authorization') auth:string|undefined,@Param('tenantId')tenant:string,@Param('companyId')company:string){
   return this.scoped(auth,tenant,company,false,async client=>{
     const rows=await client.query<InvoiceRow>(
       "SELECT invoice_number,legacy_document,status FROM invoices WHERE tenant_id=$1 AND company_id=$2 AND status='draft' ORDER BY created_at DESC LIMIT 500",
       [tenant,company]);
     return rows.rows.map(row=>row.legacy_document);
   });
 }
 @Post()
 async save(@Headers('authorization') auth:string|undefined,@Param('tenantId')tenant:string,@Param('companyId')company:string,
  @Query('overwrite') overwrite:string|undefined,@Body()body:unknown){
   if(overwrite!==undefined && overwrite!=='1')throw new BadRequestException('Invalid overwrite flag');
   const draft=validateLegacyDraft(body);
   const type=documentType(draft.invoiceType)!;
   const year=financialYear(draft.invoiceDate);
   return this.scoped(auth,tenant,company,true,async client=>{
     const data=JSON.stringify(draft);
     if(overwrite==='1'){
       const updated=await client.query<InvoiceRow>(
         `UPDATE invoices SET legacy_document=$6::jsonb,issued_on=$7,currency=$8
          WHERE tenant_id=$1 AND company_id=$2 AND financial_year=$3 AND document_type=$4
            AND invoice_number=$5 AND status='draft'
          RETURNING invoice_number,legacy_document,status`,
          [tenant,company,year,type,draft.invoiceNumber,data,draft.invoiceDate,draft.currency]);
       if(!updated.rows[0])throw new ForbiddenException('Only an existing draft may be edited');
       return updated.rows[0].legacy_document;
     }
     try{
       const created=await client.query<InvoiceRow>(
         `INSERT INTO invoices(tenant_id,company_id,invoice_number,financial_year,document_type,issued_on,currency,status,legacy_document)
          VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8::jsonb)
          RETURNING invoice_number,legacy_document,status`,
         [tenant,company,draft.invoiceNumber,year,type,draft.invoiceDate,draft.currency,data]);
       return created.rows[0].legacy_document;
     }catch(e){
       if((e as {code?:string}).code==='23505')
         throw new ConflictException('Invoice number already exists');
       throw e;
     }
   });
 }
}
