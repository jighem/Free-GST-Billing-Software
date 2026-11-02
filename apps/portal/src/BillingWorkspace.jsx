import React, { useEffect, useState } from 'react';
import {
  BarChart3, BookOpen, Building2, ChevronRight, FileText, Home,
  Package, Plus, RefreshCw, Settings2, ShieldCheck, ShoppingCart, Users, Wallet
} from 'lucide-react';
import { api } from './api.js';

// Navigation and layout groups are retained from the fork's src/App.jsx.
// Until legacy /api file storage is migrated to tenant-scoped NestJS endpoints,
// unimplemented modules are deliberately NON-INTERACTIVE: no shared or dummy data.
const navigation = [
  { id: 'dashboard', label: 'Dashboard', icon: Home, ready: true },
  { id: 'new', label: 'New Invoice', icon: Plus },
  { id: 'clients', label: 'Clients', icon: Users },
  { id: 'inventory', label: 'Products', icon: Package },
  { id: 'purchases', label: 'Purchases', icon: ShoppingCart },
  { id: 'expenses', label: 'Expenses', icon: Wallet },
  { id: 'recurring', label: 'Recurring', icon: RefreshCw },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'filing', label: 'GST Returns', icon: BookOpen },
];

export default function BillingWorkspace({
  token, tenant, companies, activeCompany, onCompany, onSetup, onWorkspaces, onSignOut
}) {
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');

  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setOverview(null);
    api('/tenants/' + encodeURIComponent(tenant.tenant_id)
       + '/companies/' + encodeURIComponent(activeCompany.id) + '/dashboard',
      { token })
      .then(data => { if (active) setOverview(data); })
      .catch(e => { if (active) setError(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, tenant.tenant_id, activeCompany.id]);

  const stats = [
    { title:'Total Invoices', value:overview?.metrics.invoices, icon:FileText },
    { title:'Draft Invoices', value:overview?.metrics.drafts, icon:FileText },
    { title:'Issued Invoices', value:overview?.metrics.issued, icon:BarChart3 },
    { title:'Customers', value:overview?.metrics.customers, icon:Users },
  ];

  return <div className="billing-shell">
    <aside className="billing-sidebar" aria-label="Main application navigation">
      <div className="billing-brand"><span className="billing-mark"><FileText size={22}/></span>
        <span><strong>Anytime GST</strong><small>Your GST. Anytime. Anywhere.</small></span>
      </div>
      <div className="billing-company-picker">
        <small>ACTIVE BUSINESS</small>
        <select aria-label="Active company" value={activeCompany.id} onChange={event=>{
          const company = companies.find(item=>item.id===event.target.value);
          if (company) onCompany(company);
        }}>
          {companies.map(company=><option key={company.id} value={company.id}>{company.legal_name}</option>)}
        </select>
        <span>Workspace: {tenant.display_name}</span>
      </div>
      <nav className="billing-nav">
        {navigation.map(item=>{
          const Icon = item.icon;
          return <button key={item.id} type="button"
            disabled={!item.ready} aria-current={activeTab===item.id?'page':undefined}
            title={item.ready?item.label:item.label+' — being migrated from the original GST app'}
            className={activeTab===item.id?'active':''}
            onClick={()=>{ if(item.ready) setActiveTab(item.id); }}>
            <Icon size={17}/><span>{item.label}</span>{!item.ready&&<small>SOON</small>}
          </button>;
        })}
      </nav>
      <div className="billing-side-bottom">
        {['owner','admin'].includes(tenant.role) &&
          <button type="button" onClick={()=>onSetup(activeCompany)}>
            <Settings2 size={17}/> Company Settings
          </button>}
        <button type="button" onClick={onWorkspaces}><Building2 size={17}/> Change Workspace</button>
        <button type="button" onClick={onSignOut}>Sign out</button>
      </div>
    </aside>

    <div className="billing-content">
      <header className="billing-topbar">
        <div><span className="billing-crumb">Business / Dashboard</span>
          <h1>Dashboard</h1></div>
        <span className="billing-chip"><ShieldCheck size={14}/> {tenant.role} · STAGING</span>
      </header>
      <main className="billing-main">
        <div className="billing-welcome">
          <div><h2>Welcome to {activeCompany.legal_name}</h2>
            <p>Business overview, based on your own company data.</p></div>
          <span className="billing-muted">GSTIN: {activeCompany.gstin || 'Not configured'}</span>
        </div>
        {error && <div role="alert" className="message error">{error}</div>}
        <div className="billing-metrics">
          {stats.map(item=>{
            const Icon = item.icon;
            return <div className="billing-metric" key={item.title}>
              <div className="billing-metric-label">{item.title}<Icon size={20}/></div>
              <strong>{loading?'…':overview?item.value:'—'}</strong>
              <small>Tenant-scoped PostgreSQL data</small>
            </div>;
          })}
        </div>
        <div className="billing-grid">
          <section className="billing-widget">
            <div className="billing-widget-header"><h3>Recent business activity</h3><ChevronRight size={18}/></div>
            <div className="billing-empty">
              <FileText size={30}/><strong>{loading?'Loading overview…':'No invoice activity yet'}</strong>
              <span>Invoice lists and editing from the forked GST application are being connected to the SaaS API.</span>
            </div>
          </section>
          <section className="billing-widget">
            <div className="billing-widget-header"><h3>Company overview</h3><Building2 size={18}/></div>
            <dl className="billing-details">
              <div><dt>Legal name</dt><dd>{activeCompany.legal_name}</dd></div>
              <div><dt>GSTIN</dt><dd>{activeCompany.gstin||'Unregistered / not provided'}</dd></div>
              <div><dt>Billing email</dt><dd>{activeCompany.billing_email||'Not provided'}</dd></div>
              <div><dt>Workspace access</dt><dd>{tenant.role}</dd></div>
            </dl>
            {['owner','admin'].includes(tenant.role) &&
              <button type="button" className="billing-settings-button" onClick={()=>onSetup(activeCompany)}>
                <Settings2 size={16}/> Update business profile
              </button>}
          </section>
        </div>
        <p className="billing-preview-notice">Development preview. The forked GST application's billing modules are being connected securely. Creating or editing invoices remains disabled until tenant-scoped APIs are validated. Do not enter real financial data.</p>
      </main>
    </div>
  </div>;
}
