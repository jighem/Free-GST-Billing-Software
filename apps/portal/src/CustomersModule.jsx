import React, {useEffect,useState} from 'react';
import {Plus, Save, Trash2, Users, X} from 'lucide-react';
import {api} from './api.js';

// Field contract is the same as the fork's src/components/ClientModal.jsx.
// The original fork's client table/statement UI remains for subsequent reuse,
// after all dependencies on src/store.js are migrated.
const blank={name:'',address:'',city:'',pin:'',state:'',gstin:'',email:'',phone:'',country:'India',isSEZ:false};
export default function CustomersModule({tenant,company,token}) {
  const [customers,setCustomers]=useState([]);
  const [form,setForm]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [refresh,setRefresh]=useState(0);
  useEffect(()=>{
    let active=true;setLoading(true);setError('');setCustomers([]);
    api('/tenants/'+encodeURIComponent(tenant.tenant_id)+'/companies/'+encodeURIComponent(company.id)+'/customers',{token})
      .then(data=>{if(active)setCustomers(data);})
      .catch(err=>{if(active)setError(err.message);})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[tenant.tenant_id,company.id,token,refresh]);
  const path='/tenants/'+encodeURIComponent(tenant.tenant_id)+'/companies/'+encodeURIComponent(company.id)+'/customers';
  const canWrite=['owner','admin','member'].includes(tenant.role);
  const change=(key,value)=>setForm(f=>({...f,[key]:value}));
  async function save(event) {
    event.preventDefault();
    if(!canWrite||busy)return;
    setBusy(true);setError('');
    try {
      await api(path,{token,method:'POST',body:form});
      setForm(null);setRefresh(x=>x+1);
    } catch(e){setError(e.message);}
    finally{setBusy(false);}
  }
  async function remove(customer) {
    if(!canWrite||busy||!window.confirm('Delete '+customer.name+'?'))return;
    setBusy(true);setError('');
    try {
      await api(path+'/'+encodeURIComponent(customer.id),{token,method:'DELETE'});
      setRefresh(x=>x+1);
    }catch(e){setError(e.message);}
    finally{setBusy(false);}
  }
  return <section className="billing-customers">
    <div className="billing-page-header"><div><h2>Clients</h2><p>Customers for {company.legal_name}</p></div>
      {canWrite&&<button type="button" className="billing-action" onClick={()=>setForm({...blank})}><Plus size={16}/> Add Client</button>}
    </div>
    {error&&<div role="alert" className="message error">{error}</div>}
    {form&&<form className="billing-customer-form" onSubmit={save}>
      <div className="billing-page-header"><h3>{form.id?'Edit Client':'Add New Client'}</h3>
      <button type="button" className="billing-settings-button" onClick={()=>setForm(null)}><X size={16}/> Cancel</button></div>
      <div className="billing-form-fields">
        {[
          ['name','Client / Business Name *'],['gstin','GSTIN'],['address','Address'],['city','City'],
          ['state','State / UT'],['pin','PIN code'],['email','Email'],['phone','Phone'],['country','Country']
        ].map(([key,label])=><label key={key}>{label}
          <input required={key==='name'} type={key==='email'?'email':'text'} maxLength={key==='name'?200:500}
            value={form[key]||''} onChange={e=>change(key,key==='gstin'?e.target.value.toUpperCase():e.target.value)}/>
        </label>)}
      </div>
      <label className="billing-checkbox"><input type="checkbox" checked={!!form.isSEZ} onChange={e=>change('isSEZ',e.target.checked)}/> SEZ customer</label>
      <button className="billing-action" type="submit" disabled={busy}><Save size={16}/>{busy?'Saving…':'Save Client'}</button>
    </form>}
    <div className="billing-widget">
      {loading?<div className="billing-empty">Loading clients…</div>:customers.length?(
        <div className="billing-table-wrap"><table className="billing-table">
          <thead><tr><th>Client / Business</th><th>GSTIN</th><th>City</th><th>Email</th><th>Actions</th></tr></thead>
          <tbody>{customers.map(c=><tr key={c.id}>
            <td><strong>{c.name}</strong></td><td>{c.gstin||'—'}</td><td>{c.city||'—'}</td><td>{c.email||'—'}</td>
            <td><div className="billing-table-actions">
              {canWrite&&<><button type="button" onClick={()=>setForm({...blank,...c})}>Edit</button>
                <button type="button" disabled={busy} onClick={()=>remove(c)} aria-label={'Delete '+c.name}><Trash2 size={15}/></button></>}
            </div></td></tr>)}</tbody>
        </table></div>
      ):<div className="billing-empty"><Users size={30}/><strong>No clients yet</strong><span>Add your first client to this company.</span></div>}
    </div>
    <p className="billing-preview-notice">Client records are stored in PostgreSQL under your authenticated company. The fork's invoice statements and linked invoices will be connected in the next migration.</p>
  </section>;
}
