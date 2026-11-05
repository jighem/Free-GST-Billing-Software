import React,{lazy,Suspense,useEffect,useState} from 'react';
import {clearSaasSession,readSaasSession,requestSaas} from './storeAdapter';

// This loads the ORIGINAL, unchanged src/App.jsx, not BillingWorkspace.jsx.
// No original code is mounted until server membership + company access pass.
const OriginalBillingApp=lazy(()=>import('../App.jsx'));
export default function SaasGate(){
 const [phase,setPhase]=useState('checking');
 const [companies,setCompanies]=useState([]);
 const [selected,setSelected]=useState('');
 const [error,setError]=useState('');
 const [companyName,setCompanyName]=useState('');
 useEffect(()=>{
   let live=true;
   async function verify(){
     const session=readSaasSession();
     if(!session){if(live)setPhase('login');return;}
     try{
       const memberships=await requestSaas('/auth/tenants',{token:session.token});
       if(!memberships.some(x=>x.tenant_id===session.tenantId))throw new Error('Workspace membership expired');
       const list=await requestSaas('/companies',{token:session.token});
       if(!live)return;
       const completed=list.filter(x=>x.onboarding_completed_at);
       setCompanies(completed);
       if(completed.length===1){setSelected(completed[0].id);setCompanyName(completed[0].legal_name);setPhase('ready');}
       else if(completed.length>1)setPhase('choose');
       else {setError('Company setup is required before opening the billing portal.');setPhase('login');}
     }catch(e){
       if(!live)return;
       setError(e.message||'Workspace validation failed');
       setPhase('login');
     }
   }
   void verify();
   return()=>{live=false;};
 },[]);
 useEffect(()=>{
   if(phase==='ready' && selected)window.__anytimeSaasCompanyId=selected;
   return()=>{delete window.__anytimeSaasCompanyId;};
 },[phase,selected]);
 async function logout(){
   const session=readSaasSession();
   if(session)try{await requestSaas('/auth/logout',{token:session.token,method:'POST'});}catch{/* Network outage: local session still cleared below */}
   clearSaasSession();
   delete window.__anytimeSaasCompanyId;
   window.location.assign('/');
 }
 if(phase==='checking')return <main role="status" style={{padding:32}}>Anytime GST — verifying your login…</main>;
 if(phase==='login')return <main style={{padding:32}}><h1>Anytime GST</h1>
   <p>Your GST. Anytime. Anywhere.</p><p>{error||'Sign in to open your billing workspace.'}</p>
   <a href="/">Return to login and company setup</a></main>;
 if(phase==='choose')return <main style={{padding:32}}><h1>Select a company</h1>
   {companies.map(company=><button key={company.id} type="button" onClick={()=>{
     setSelected(company.id);setCompanyName(company.legal_name);setPhase('ready');
   }}>{company.legal_name}</button>)}</main>;
 return <><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'9px 18px',background:'#eaf1ff',color:'#142e51',fontSize:13}}>
   <span><strong>Anytime GST</strong> · {companyName} · SaaS integration preview</span>
   <button type="button" onClick={logout}>Sign out</button>
 </div>
 <Suspense fallback={<p role="status" style={{padding:24}}>Loading original GST portal…</p>}>
   <OriginalBillingApp/>
 </Suspense>
 </>;
}
