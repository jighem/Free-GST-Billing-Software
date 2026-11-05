// Test only against the loopback M3 candidate. No credentials or tokens printed.
// Run via Docker with read-only /private/test-users.txt and --network host.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const API = process.env.M3_API_BASE || 'http://127.0.0.1:14104/api/v1';
const dashboardOnly = process.env.M3_DASHBOARD_ONLY === '1';
const data = readFileSync('/private/test-users.txt','utf8');
function credentials(label) {
  const start = data.indexOf(label+'\n');
  assert.ok(start>=0,'Missing test account '+label);
  const segment = data.slice(start);
  const email = /^Email:\s*(\S+)/m.exec(segment)?.[1];
  const password = /^Password:\s*(\S+)/m.exec(segment)?.[1];
  assert.ok(email && password,'Missing login details for '+label);
  return {email,password};
}
async function request(path, token, method='GET', body) {
  const response = await fetch(API+path, {
    method,
    headers: {
      ...(body ? {'content-type':'application/json'} : {}),
      ...(token ? {authorization:'Bearer '+token} : {}),
    },
    body:body?JSON.stringify(body):undefined,
    signal:AbortSignal.timeout(8000),
    cache:'no-store',
  });
  const json = await response.json().catch(()=>null);
  return {status:response.status,data:json};
}
async function load(label) {
  const {email,password}=credentials(label);
  const login=await request('/auth/login',null,'POST',{email,password});
  assert.equal(login.status,201,'Login failed for '+label);
  assert.ok(login.data.access_token);
  const token=login.data.access_token;
  const memberships=await request('/auth/tenants',token);
  assert.equal(memberships.status,200,label+' workspaces failed');
  assert.equal(memberships.data.length,1,label+' should have exactly one tenant');
  const tenant=memberships.data[0].tenant_id;
  const companies=await request('/tenants/'+tenant+'/companies',token);
  assert.equal(companies.status,200,label+' companies failed');
  assert.equal(companies.data.length,1,label+' should have exactly one company');
  const company=companies.data[0].id;
  const dashboard=await request('/tenants/'+tenant+'/companies/'+company+'/dashboard',token);
  assert.equal(dashboard.status,200,label+' dashboard failed');
  for(const key of ['customers','invoices','drafts','issued','voided'])
    assert.equal(typeof dashboard.data.metrics[key],'number',key+' must be numeric');
  console.log(label+': login, workspace, company and dashboard PASS');
  return {token,tenant,company};
}

const publicRead=await request(
 '/tenants/11111111-1111-4111-8111-111111111111/companies/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/dashboard'
);
assert.equal(publicRead.status,401,'Dashboard must require authentication');

const A=await load('AnytimeGST Test A');
const B=await load('AnytimeGST Test B');
for(const [own,foreign,label] of [[A,B,'A -> B'],[B,A,'B -> A']]){
  const cross=await request('/tenants/'+foreign.tenant+'/companies/'+foreign.company+'/dashboard',own.token);
  assert.equal(cross.status,403,label+' cross-tenant dashboard must be denied');
  console.log(label+': cross-tenant dashboard denied (403) PASS');
  const foreignWithinOwnTenant=await request(
    '/tenants/'+own.tenant+'/companies/'+foreign.company+'/dashboard',own.token);
  assert.equal(foreignWithinOwnTenant.status,403,label+' cross-company access must be denied');
}
// Safely exercise customers/products against synthetic test accounts.
// Always clean up created records, and never output auth tokens or passwords.
if (!dashboardOnly) for (const [label,own,foreign] of [['A',A,B],['B',B,A]]) {
  for (const [resource,payload] of [
    ['customers',{name:'CI Synthetic '+label+' Client',city:'Mumbai'}],
    ['products',{name:'CI Synthetic '+label+' Product',kind:'goods',hsn:'1234',sellingPrice:25,taxPercent:18}]
  ]) {
    const base='/tenants/'+own.tenant+'/companies/'+own.company+'/'+resource;
    const made=await request(base,own.token,'POST',payload);
    assert.equal(made.status,201,label+' '+resource+' create failed');
    const id=made.data?.id;
    assert.match(id,/^[0-9a-f-]{36}$/i);
    try {
      const mine=await request(base,own.token);
      assert.equal(mine.status,200);
      assert.ok(mine.data.some(row=>row.id===id),'New '+resource+' missing in '+label);
      const others=await request('/tenants/'+foreign.tenant+'/companies/'+foreign.company+'/'+resource,foreign.token);
      assert.equal(others.status,200);
      assert.ok(!others.data.some(row=>row.id===id),'Cross-tenant '+resource+' leakage');
      const foreignPath='/tenants/'+foreign.tenant+'/companies/'+foreign.company+'/'+resource;
      const unauthorized=await request(foreignPath,own.token);
      assert.equal(unauthorized.status,403,'Cross-tenant '+resource+' access allowed');
      const crossUpdate=await request(foreignPath,own.token,'POST',{...payload,id});
      assert.equal(crossUpdate.status,403,'Cross-tenant '+resource+' mutation allowed');
      const crossDelete=await request(foreignPath+'/'+id,own.token,'DELETE');
      assert.equal(crossDelete.status,403,'Cross-tenant '+resource+' deletion allowed');
      console.log('Test '+label+' '+resource+': create, isolated read, blocked foreign write PASS');
    } finally {
      const removed=await request(base+'/'+id,own.token,'DELETE');
      assert.equal(removed.status,200,label+' '+resource+' test cleanup failed');
    }
  }
}
for (const [label, session] of [['A', A], ['B', B]]) {
  const response = await request('/auth/logout', session.token, 'POST');
  assert.equal(response.status, 201, label + ' logout failed');
  const denied = await request('/auth/tenants', session.token);
  assert.equal(denied.status, 401, label + ' revoked session still active');
}
console.log(dashboardOnly ? 'M3 DASHBOARD: AUTHENTICATION, TENANT ISOLATION AND LOGOUT PASS' : 'M3 LOCALHOST CANDIDATE: AUTHENTICATION, CUSTOMERS, PRODUCTS, TENANT ISOLATION AND LOGOUT PASS');
