import React,{useEffect,useState} from 'react';
import {Package,Plus,Save,Trash2,X} from 'lucide-react';
import {api} from './api.js';

const blank={kind:'goods',name:'',hsn:'',sellingPrice:'',purchasePrice:'',taxPercent:'',unit:'Pcs',stock:'',description:''};
const inputFields=[
  ['name','Product / Service Name *'],['hsn','HSN / SAC'],['sellingPrice','Selling Price'],
  ['purchasePrice','Purchase Price'],['taxPercent','GST %'],['unit','Unit'],['stock','Opening Stock'],
  ['description','Description'],
];
export default function ProductsModule({tenant,company,token,onAuthExpired}) {
  const [items,setItems]=useState([]);
  const [form,setForm]=useState(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [refresh,setRefresh]=useState(0);
  const path='/tenants/'+encodeURIComponent(tenant.tenant_id)+'/companies/'+encodeURIComponent(company.id)+'/products';
  const canWrite=['owner','admin','member'].includes(tenant.role);
  useEffect(()=>{
    let active=true;setItems([]);setError('');setLoading(true);
    api(path,{token}).then(v=>{if(active)setItems(v);})
      .catch(e=>{if(active){if(e.status===401)onAuthExpired();else setError(e.message);}})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[path,token,refresh]);
  async function save(event) {
    event.preventDefault();if(!canWrite||busy)return;
    setBusy(true);setError('');
    try{
      await api(path,{token,method:'POST',body:form});
      setForm(null);setRefresh(n=>n+1);
    }catch(e){if(e.status===401)onAuthExpired();else setError(e.message);}
    finally{setBusy(false);}
  }
  async function remove(item) {
    if(!canWrite||busy||!window.confirm('Delete '+item.name+'?'))return;
    setBusy(true);setError('');
    try{
      await api(path+'/'+encodeURIComponent(item.id),{token,method:'DELETE'});
      setRefresh(n=>n+1);
    }catch(e){if(e.status===401)onAuthExpired();else setError(e.message);}
    finally{setBusy(false);}
  }
  return <section className="billing-products">
    <div className="billing-page-header"><div><h2>Products & Services</h2>
      <p>Inventory and service catalogue for {company.legal_name}</p></div>
      {canWrite&&<button className="billing-action" type="button" onClick={()=>setForm({...blank})}><Plus size={16}/> Add Product</button>}
    </div>
    {error&&<div className="message error" role="alert">{error}</div>}
    {form&&<form className="billing-customer-form" onSubmit={save}>
      <div className="billing-page-header"><h3>{form.id?'Edit Product':'Add New Product'}</h3>
        <button className="billing-settings-button" type="button" onClick={()=>setForm(null)}><X size={16}/> Cancel</button>
      </div>
      <div className="billing-form-fields">
        <label>Item type<select value={form.kind||'goods'} onChange={e=>setForm(v=>({...v,kind:e.target.value}))}>
          <option value="goods">Goods</option><option value="service">Service</option>
        </select></label>
        {inputFields.filter(([key])=>key!=='stock'||form.kind!=='service').map(([key,label])=>
          <label key={key}>{label}<input
            type={['sellingPrice','purchasePrice','taxPercent','stock'].includes(key)?'number':'text'}
            min={['sellingPrice','purchasePrice','taxPercent','stock'].includes(key)?0:undefined}
            max={key==='taxPercent'?100:undefined}
            step={['sellingPrice','purchasePrice','taxPercent','stock'].includes(key)?'any':undefined}
            required={key==='name'} maxLength="500"
            value={form[key]??''}
            onChange={e=>setForm(v=>({...v,[key]:e.target.value}))}/></label>)}
      </div>
      <button className="billing-action" type="submit" disabled={busy}><Save size={16}/>{busy?'Saving…':'Save Product'}</button>
    </form>}
    <div className="billing-widget">{loading?<div className="billing-empty">Loading products…</div>
      :items.length?<div className="billing-table-wrap"><table className="billing-table">
        <thead><tr><th>Product / Service</th><th>HSN/SAC</th><th>Selling ₹</th><th>GST %</th><th>Stock</th><th>Actions</th></tr></thead>
        <tbody>{items.map(item=><tr key={item.id}>
          <td><strong>{item.name}</strong><div><small>{item.kind||'goods'}</small></div></td>
          <td>{item.hsn||'—'}</td><td>{Number(item.sellingPrice??item.rate??0).toLocaleString('en-IN')}</td>
          <td>{item.taxPercent??0}%</td><td>{item.kind==='service'?'N/A':(item.stock??'Not tracked')}</td>
          <td><div className="billing-table-actions">{canWrite&&<>
            <button type="button" onClick={()=>setForm({...blank,...item})}>Edit</button>
            <button type="button" disabled={busy} aria-label={'Delete '+item.name} onClick={()=>remove(item)}><Trash2 size={15}/></button>
          </>}</div></td>
        </tr>)}</tbody>
      </table></div>:<div className="billing-empty"><Package size={30}/><strong>No products yet</strong>
        <span>Add goods or services to this company's catalogue.</span></div>}
    </div>
    <p className="billing-preview-notice">Products are isolated by company. Inventory movements, manufacturing and invoice stock adjustments from the original fork are still being migrated and are not enabled.</p>
  </section>;
}
