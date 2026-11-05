// SaaS adapter for the ORIGINAL forked src/store.js contract.
// Activated only by VITE_ANYTIME_SAAS_MODE=true in the dedicated SaaS build.
// Never fall back to the desktop Express JSON-file API for authenticated users.
const SESSION_KEY='anytime-gst-staging-session-v1';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN=/^[A-Za-z0-9_-]{40,128}$/;
const BASE='https://staging-api.anytimegst.com/api/v1';

export function readSaasSession() {
  try {
    const raw=sessionStorage.getItem(SESSION_KEY);
    const session=raw?JSON.parse(raw):null;
    if(!TOKEN.test(session?.token||'') || !UUID.test(session?.tenantId||'') ||
      !Number.isFinite(session?.expiresAt) || session.expiresAt<=Date.now()) return null;
    return session;
  } catch { return null; }
}

export function clearSaasSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* blocked storage */ }
}

function companyBase(session,companyId) {
  if(!UUID.test(companyId||'')) throw new Error('Select an authorized company first.');
  return BASE+'/tenants/'+encodeURIComponent(session.tenantId)+'/companies/'+encodeURIComponent(companyId);
}

export async function requestSaas(path,{method='GET',body,companyId,token}={}) {
  if(typeof path!=='string'||!path.startsWith('/')||path.startsWith('//')||path.includes('..'))
    throw new Error('Invalid API path');
  const session=readSaasSession();
  if(!session||!token||token!==session.token) throw new Error('Session expired. Please sign in again.');
  let endpoint;
  if(path==='/auth/tenants') endpoint=BASE+path;
  else if(path==='/companies') endpoint=BASE+'/tenants/'+encodeURIComponent(session.tenantId)+'/companies';
  else endpoint=companyBase(session,companyId)+path;
  const response=await fetch(endpoint,{
    method,
    headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json'})},
    body:body===undefined?undefined:JSON.stringify(body),
    cache:'no-store',credentials:'omit'
  });
  const payload=await response.json().catch(()=>null);
  if(!response.ok){
    if(response.status===401)clearSaasSession();
    const e=new Error('Anytime GST API request failed ('+response.status+').');
    e.status=response.status;throw e;
  }
  return payload;
}

export function translateOriginalRequest(url,options={},companyId) {
  if(typeof url!=='string'||!url.startsWith('/api/'))
    throw new Error('Invalid fork store endpoint');
  const raw=url.slice(5),method=(options.method||'GET').toUpperCase();
  let body;
  if(options.body!==undefined){
    try{body=JSON.parse(options.body);}catch{throw new Error('Invalid request data');}
  }
  let path;
  if(raw==='clients')path='/customers';
  else if(raw.startsWith('clients/'))path='/customers/'+encodeURIComponent(raw.slice(8));
  else if(raw==='products')path='/products';
  else if(raw.startsWith('products/'))path='/products/'+encodeURIComponent(raw.slice(9));
  else {
    // Do not fake a successful response or risk making a legacy write.
    const error=new Error('This original GST module needs its tenant-safe API adapter before use: '+raw.split('/')[0]);
    error.code='SAAS_MODULE_NOT_MIGRATED';
    throw error;
  }
  return {path,method,body,companyId};
}
