import { Body, Controller, Delete, ForbiddenException, Get, Headers, Param, Post, BadRequestException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PoolClient } from 'pg';
import { DatabaseService } from '../../db/database.service';
import { IdentityService } from '../identity/identity.service';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type ProductRow={id:string;name:string;details:Record<string,unknown>};
const FIELDS=['kind','hsn','purchasePrice','sellingPrice','rate','taxPercent','unit','stock','description'] as const;
function parse(input:unknown) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new BadRequestException('Invalid product');
  const value=input as Record<string,unknown>;
  const name=typeof value.name==='string'?value.name.trim():'';
  if(name.length<2||name.length>200)throw new BadRequestException('Product name requires 2–200 characters');
  if(value.id!==undefined&&(typeof value.id!=='string'||!UUID.test(value.id)))
    throw new BadRequestException('Invalid product ID');
  const details:Record<string,string|number>={};
  for(const key of FIELDS){
    const v=value[key];
    if(v===undefined||v===null||v==='')continue;
    if(['purchasePrice','sellingPrice','rate','taxPercent','stock'].includes(key)){
      const n=typeof v==='number'?v:typeof v==='string'&&v.trim()?Number(v):NaN;
      if(!Number.isFinite(n)||Math.abs(n)>1e10||(key==='taxPercent'&&(n<0||n>100))||
        (['purchasePrice','sellingPrice','rate','stock'].includes(key)&&n<0))
        throw new BadRequestException('Invalid product amount or tax rate');
      details[key]=n;
    }else{
      if(typeof v!=='string'||v.length>500)throw new BadRequestException('Invalid product detail');
      details[key]=v.trim();
    }
  }
  const kind=details.kind||'goods';
  if(kind!=='goods'&&kind!=='service')throw new BadRequestException('Invalid product kind');
  details.kind=kind;
  if(kind==='service')delete details.stock;
  const sell=Number(details.sellingPrice??details.rate??0);
  details.sellingPrice=sell;
  details.rate=sell; // legacy InventoryView compatibility
  return {id:value.id as string|undefined,name,details};
}
function fromRow(row:ProductRow){return {...row.details,id:row.id,name:row.name};}
@ApiTags('products')
@ApiBearerAuth()
@Controller('tenants/:tenantId/companies/:companyId/products')
export class ProductsController {
 constructor(private readonly identity:IdentityService,private readonly db:DatabaseService){}
 private async authorize(auth:string|undefined,tenant:string,company:string,write=false) {
   const user=await this.identity.authenticate(auth);
   const member=await this.identity.requireMember(user,tenant);
   if(!UUID.test(company)||(write&&!['owner','admin','member'].includes(member.role)))
     throw new ForbiddenException('Product access denied');
 }
 private async scoped<T>(tenant:string,company:string,action:(client:PoolClient)=>Promise<T>):Promise<T>{
   return this.db.withTenant(tenant,async client=>{
     const allowed=await client.query('SELECT id FROM companies WHERE tenant_id=$1 AND id=$2',[tenant,company]);
     if(!allowed.rowCount)throw new ForbiddenException('Company access denied');
     return action(client);
   });
 }
 @Get()
 async list(@Headers('authorization')auth:string|undefined,@Param('tenantId')tenant:string,@Param('companyId')company:string){
   await this.authorize(auth,tenant,company);
   return this.scoped(tenant,company,async client=>{
     const result=await client.query<ProductRow>(
       'SELECT id,name,details FROM products WHERE tenant_id=$1 AND company_id=$2 ORDER BY name LIMIT 500',
       [tenant,company]);
     return result.rows.map(fromRow);
   });
 }
 @Post()
 async save(@Headers('authorization')auth:string|undefined,@Param('tenantId')tenant:string,@Param('companyId')company:string,@Body()input:unknown){
   await this.authorize(auth,tenant,company,true);
   const value=parse(input);
   return this.scoped(tenant,company,async client=>{
     const sql=value.id
       ? 'UPDATE products SET name=$4,details=$5::jsonb,updated_at=now() WHERE tenant_id=$1 AND company_id=$2 AND id=$3 RETURNING id,name,details'
       : 'INSERT INTO products(tenant_id,company_id,name,details) VALUES ($1,$2,$3,$4::jsonb) RETURNING id,name,details';
     const args=value.id
       ? [tenant,company,value.id,value.name,JSON.stringify(value.details)]
       : [tenant,company,value.name,JSON.stringify(value.details)];
     const result=await client.query<ProductRow>(sql,args);
     if(!result.rows[0])throw new ForbiddenException('Product access denied');
     return fromRow(result.rows[0]);
   });
 }
 @Delete(':productId')
 async remove(@Headers('authorization')auth:string|undefined,@Param('tenantId')tenant:string,@Param('companyId')company:string,@Param('productId')product:string){
   await this.authorize(auth,tenant,company,true);
   if(!UUID.test(product))throw new BadRequestException('Invalid product ID');
   return this.scoped(tenant,company,async client=>{
     const result=await client.query('DELETE FROM products WHERE tenant_id=$1 AND company_id=$2 AND id=$3 RETURNING id',
       [tenant,company,product]);
     if(!result.rowCount)throw new ForbiddenException('Product access denied');
     return {deleted:true};
   });
 }
}
