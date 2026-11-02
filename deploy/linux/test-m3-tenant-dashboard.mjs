// Test only against the loopback M3 candidate. No credentials or tokens printed.
// Run via Docker with read-only /private/test-users.txt and --network host.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const API = 'http://127.0.0.1:14104/api/v1';
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
console.log('M3 LOCALHOST CANDIDATE: ALL AUTHENTICATION AND TENANT ISOLATION TESTS PASSED');
