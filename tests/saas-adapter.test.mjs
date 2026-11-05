import test from 'node:test';
import assert from 'node:assert/strict';
import {readSaasSession,clearSaasSession,requestSaas,translateOriginalRequest} from '../src/saas/storeAdapter.js';

const token='A'.repeat(43);
const tenantId='11111111-1111-4111-8111-111111111111';
const companyId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const key='anytime-gst-staging-session-v1';
function storage(){
 const values=new Map([[key,JSON.stringify({token,tenantId,expiresAt:Date.now()+600000})]]);
 return{getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
}
test('requires an unexpired session with a selected tenant',()=>{
 globalThis.sessionStorage=storage();
 assert.equal(readSaasSession().tenantId,tenantId);
 clearSaasSession();assert.equal(readSaasSession(),null);
});
test('preserves original customer/product store contract only',()=>{
 for(const [oldPath,expected] of [
  ['/api/clients','/customers'],['/api/clients/'+companyId,'/customers/'+companyId],
  ['/api/products','/products'],['/api/products/'+companyId,'/products/'+companyId]
 ]) assert.equal(translateOriginalRequest(oldPath,{},companyId).path,expected);
 for(const path of ['/api/bills','/api/backups/now','/api/update','/api/lock','/api/meta/name'])
   assert.throws(()=>translateOriginalRequest(path,{},companyId),e=>e.code==='SAAS_MODULE_NOT_MIGRATED');
});
test('never calls legacy Express and always scopes data to chosen tenant/company',async()=>{
 globalThis.sessionStorage=storage();
 let requests=[];
 globalThis.fetch=async(url,options)=>{
  requests.push({url,options});
  return{ok:true,json:async()=>[{name:'Test customer'}]};
 };
 const customers=await requestSaas('/customers',{token,companyId});
 assert.equal(customers[0].name,'Test customer');
 assert.match(requests[0].url,/\/tenants\/11111111-1111-4111-8111-111111111111\/companies\/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa\/customers$/);
 assert.equal(requests[0].options.credentials,'omit');
 assert.equal(requests[0].options.headers.Authorization,'Bearer '+token);
 assert.ok(!requests[0].url.includes('/api/clients'));
 await assert.rejects(requestSaas('/customers',{token:'wrong',companyId}),/Session expired/);
 assert.equal(requests.length,1);
});
test('authenticated workspace lookup is still server validated',async()=>{
 globalThis.sessionStorage=storage();
 let urls=[];
 globalThis.fetch=async(url)=>{urls.push(url);return{ok:true,json:async()=>[]};};
 await requestSaas('/auth/tenants',{token});
 await requestSaas('/companies',{token});
 assert.equal(urls[0],'https://staging-api.anytimegst.com/api/v1/auth/tenants');
 assert.equal(urls[1],'https://staging-api.anytimegst.com/api/v1/tenants/'+tenantId+'/companies');
});
test('rejects traversal and does not send unsafe requests',async()=>{
 globalThis.sessionStorage=storage();
 let count=0;globalThis.fetch=async()=>{count++;return{ok:true,json:async()=>[]};};
 await assert.rejects(requestSaas('//evil',{token,companyId}),/Invalid API path/);
 await assert.rejects(requestSaas('/../bills',{token,companyId}),/Invalid API path/);
 assert.equal(count,0);
});

test('original profile is sourced from authorized company fields without local files',async()=>{
 globalThis.sessionStorage=storage();
 globalThis.fetch=async()=>({ok:true,json:async()=>[{
   id:companyId,legal_name:'Anytime GST Demo',trade_name:'Demo',gstin:'27ABCDE1234F1Z5',
   state_code:'27',billing_email:'test@example.invalid',
   billing_address:{line1:'Line 1',city:'Mumbai',postalCode:'400001'}
 }]});
 assert.equal(translateOriginalRequest('/api/profile',{method:'GET'},companyId).path,'/profile');
 const p=await requestSaas('/profile',{companyId,token});
 assert.equal(p.businessName,'Anytime GST Demo');
 assert.equal(p.gstin,'27ABCDE1234F1Z5');
 assert.equal(p.city,'Mumbai');
 await assert.rejects(requestSaas('/profile',{companyId,token,method:'POST',body:{businessName:'bad'}}),
   /requires the reviewed SaaS settings adapter/);
});
