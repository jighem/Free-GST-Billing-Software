import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowRight, Building2, CheckCircle2, FileText, LockKeyhole, LogOut, Mail, ShieldCheck } from 'lucide-react';
import { api } from './api.js';
import { clearSession, loadSession, rememberTenant, saveSession } from './session.js';
import BillingWorkspace from './BillingWorkspace.jsx';
import './style.css';

const signupEnabled = import.meta.env.VITE_ENABLE_SIGNUP === 'true';

function getVerificationToken() {
  const fragment = window.location.hash.slice(1);
  const token = new URLSearchParams(fragment).get('token');
  // Clear URL fragment immediately so token does not linger in history or screenshots.
  if (fragment) history.replaceState(null, '', window.location.pathname + window.location.search);
  return token;
}

function Portal() {
  const [page, setPage] = useState('restoring');
  const [token, setToken] = useState(null); // memory only; never localStorage
  const [memberships, setMemberships] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [selected, setSelected] = useState(null);
  const [activeCompany, setActiveCompany] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [verificationToken] = useState(getVerificationToken);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [slug, setSlug] = useState('');
  const [editing, setEditing] = useState(null);
  const [setup, setSetup] = useState({
    legalName: '', tradeName: '', gstin: '', stateCode: '', billingEmail: '',
    line1: '', line2: '', city: '', state: '', postalCode: ''
  });
  const states = {
    '01':'Jammu and Kashmir','02':'Himachal Pradesh','03':'Punjab','04':'Chandigarh',
    '05':'Uttarakhand','06':'Haryana','07':'Delhi','08':'Rajasthan','09':'Uttar Pradesh',
    '10':'Bihar','11':'Sikkim','12':'Arunachal Pradesh','13':'Nagaland','14':'Manipur',
    '15':'Mizoram','16':'Tripura','17':'Meghalaya','18':'Assam','19':'West Bengal',
    '20':'Jharkhand','21':'Odisha','22':'Chhattisgarh','23':'Madhya Pradesh','24':'Gujarat',
    '26':'Dadra and Nagar Haveli and Daman and Diu','27':'Maharashtra','29':'Karnataka',
    '30':'Goa','31':'Lakshadweep','32':'Kerala','33':'Tamil Nadu','34':'Puducherry',
    '35':'Andaman and Nicobar Islands','36':'Telangana','37':'Andhra Pradesh',
    '38':'Ladakh','97':'Other Territory'
  };

  function navigate(next) { setError(''); setNotice(''); setPage(next); }
  function resetSession() {
    clearSession();
    setToken(null); setPassword(''); setMemberships([]); setCompanies([]); setSelected(null); setEditing(null); setActiveCompany(null);
    navigate('login');
  }

  useEffect(() => {
    let cancelled = false;
    async function restoreSession() {
      const saved = loadSession();
      if (!saved) { if (!cancelled) setPage('login'); return; }
      try {
        // Validate the stored bearer token server-side before restoring a workspace.
        const list = await api('/auth/tenants', { token: saved.token });
        if (cancelled) return;
        setToken(saved.token);
        setMemberships(list);
        const preferred = list.find(x => x.tenant_id === saved.tenantId);
        if (preferred || list.length === 1) await openTenant(preferred || list[0], saved.token);
        else setPage('workspaces');
      } catch (err) {
        if (cancelled) return;
        if (err.status === 401 || err.status === 403) {
          resetSession();
          setNotice('Your session has expired. Please sign in again.');
        } else {
          // Preserve a valid tab session during a temporary API outage.
          setPage('login');
          setNotice('Could not restore your workspace. Please check the API connection.');
        }
      }
    }
    void restoreSession();
    return () => { cancelled = true; };
    // Deliberately once on initial mount: the API validates session longevity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!verificationToken) return;
    if (signupEnabled) setPage('verify');
    else setNotice('Verification is not enabled on this staging release.');
  }, [verificationToken]);

  async function submit(action) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      if (action === 'login') {
        const session = await api('/auth/login', { method: 'POST', body: { email, password } });
        setPassword('');
        const list = await api('/auth/tenants', { token: session.access_token });
        setToken(session.access_token);
        setMemberships(list);
        saveSession(session.access_token, session.expires_in);
        if (list.length === 1) await openTenant(list[0], session.access_token);
        else setPage('workspaces');
      } else if (action === 'register') {
        await api('/registrations', {
          method: 'POST',
          body: { email, password, companyLegalName: companyName, workspaceSlug: slug },
        });
        setPassword(''); setNotice('If eligible, a verification email will be sent. Check your inbox.');
        setPage('check-email');
      } else if (action === 'resend') {
        await api('/registrations/resend', { method: 'POST', body: { email } });
        setNotice('If eligible, another verification email will be sent.');
      } else if (action === 'verify') {
        await api('/registrations/verify', { method: 'POST', body: { token: verificationToken } });
        setNotice('Email verified. Sign in with your new account.');
        setPage('login');
      }
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function openTenant(workspace, accessToken = token) {
    if (!accessToken) return resetSession();
    setBusy(true); setError(''); setCompanies([]);
    try {
      const result = await api('/tenants/' + encodeURIComponent(workspace.tenant_id) + '/companies', { token:accessToken });
      setCompanies(result);
      setSelected(workspace);
      rememberTenant(workspace.tenant_id);
      setEditing(null);
      setActiveCompany(result.length===1?result[0]:null);
      if (result.length === 1 && !result[0].onboarding_completed_at && ['owner','admin'].includes(workspace.role)) {
        editCompany(result[0]);
      } else if (result.length === 1 && result[0].onboarding_completed_at) {
        setPage('billing');
      } else {
        setPage('dashboard');
      }
    } catch (err) {
      setError(err.message);
      if (err.status === 401) resetSession();
    } finally { setBusy(false); }
  }

  async function signOut() {
    const currentToken = token;
    resetSession(); // immediately forget the bearer token in this browser tab
    if (currentToken) {
      try { await api('/auth/logout', { method: 'POST', token: currentToken }); }
      catch { setNotice('Signed out locally. The server could not confirm session revocation.'); }
    }
  }

  function editCompany(company) {
    const address = company.billing_address || {};
    setSetup({
      legalName: company.legal_name || '',
      tradeName: company.trade_name || '',
      gstin: company.gstin || '',
      stateCode: company.state_code || '',
      billingEmail: company.billing_email || '',
      line1: address.line1 || '', line2: address.line2 || '',
      city: address.city || '', state: address.state || '', postalCode: address.postalCode || ''
    });
    setEditing(company.id);
    navigate('company-setup');
  }

  async function saveCompany() {
    if (busy || !selected || !editing || !token) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const payload = {
        legalName: setup.legalName.trim(),
        tradeName: setup.tradeName.trim(),
        gstin: setup.gstin.trim().toUpperCase(),
        stateCode: setup.stateCode,
        billingEmail: setup.billingEmail.trim(),
        billingAddress: {
          line1: setup.line1.trim(), line2: setup.line2.trim(),
          city: setup.city.trim(), state: setup.state.trim(), postalCode: setup.postalCode.trim()
        }
      };
      const result = await api('/tenants/' + encodeURIComponent(selected.tenant_id)
        + '/companies/' + encodeURIComponent(editing) + '/setup',
        { method: 'PATCH', token, body: payload });
      setCompanies(previous => previous.map(c => c.id === result.id ? result : c));
      setEditing(null);
      setActiveCompany(result);
      setPage('billing');
      setNotice('Company details saved successfully.');
    } catch (err) {
      setError(err.message);
      if (err.status === 401) resetSession();
    } finally { setBusy(false); }
  }

  return <div className="shell">
    {page==='billing' && token && selected && activeCompany ? <BillingWorkspace
      token={token} tenant={selected} companies={companies} activeCompany={activeCompany}
      onCompany={setActiveCompany} onSetup={editCompany}
      onWorkspaces={()=>navigate('workspaces')} onSignOut={signOut}/>
    : <>
    <header className="topbar">
      <div className="brand"><span className="brandicon"><FileText size={22}/></span><span className="brandtext"><strong>Anytime GST</strong><small>Your GST. Anytime. Anywhere.</small></span><span className="staging">STAGING</span></div>
      {token && <button type="button" className="textbtn" onClick={signOut}><LogOut size={16}/> Sign out</button>}
    </header>
    <main className="main">
      <section className="intro">
        <span className="eyebrow"><ShieldCheck size={15}/> Secure cloud invoicing platform</span>
        <h1>Your GST.<br/><em>Anytime. Anywhere.</em></h1>
        <p>Organize your companies, manage GST invoicing and build smarter workflows in one place.</p>
        <div className="benefit"><CheckCircle2 size={18}/> Separate company workspaces</div>
        <div className="benefit"><CheckCircle2 size={18}/> GST-ready billing foundation</div>
        <div className="benefit"><CheckCircle2 size={18}/> Future CRM and accounting integrations</div>
        <div className="disclaimer">Development preview. Do not enter live GST, customer or financial data.</div>
      </section>
      <section className="panel">
        {error && <div className="message error" role="alert">{error}</div>}
        {notice && <div className="message success" role="status">{notice}</div>}
        {page === 'restoring' && <><div className="panel-icon"><LockKeyhole/></div><h2>Restoring session</h2><p className="muted" role="status">Checking your existing Anytime GST login…</p></>}
        {page === 'login' && <>
          <div className="panel-icon"><LockKeyhole/></div><h2>Welcome back</h2><p className="muted">Sign in to your Anytime GST workspace.</p>
          <form onSubmit={e => { e.preventDefault(); submit('login'); }}>
            <label>Email address<input type="email" required autoComplete="username" maxLength="254" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com"/></label>
            <label>Password<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Your password"/></label>
            <button className="primary" disabled={busy} type="submit">{busy ? 'Signing in…' : 'Sign in'} <ArrowRight size={18}/></button>
          </form>
          {signupEnabled ? <p className="foot">New to Anytime GST? <button className="link" onClick={()=>navigate('register')}>Create an account</button></p>
            : <p className="foot">New account registration is disabled during staging security validation.</p>}
        </>}
        {page === 'register' && signupEnabled && <>
          <div className="panel-icon"><Building2/></div><h2>Create your workspace</h2><p className="muted">Start with your company and verify your email.</p>
          <form onSubmit={e => { e.preventDefault(); submit('register'); }}>
            <label>Work email<input type="email" required autoComplete="email" maxLength="254" value={email} onChange={e=>setEmail(e.target.value)}/></label>
            <label>Password (at least 12 characters)<input type="password" required minLength="12" maxLength="1024" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
            <label>Registered company name<input required minLength="2" maxLength="200" value={companyName} onChange={e=>setCompanyName(e.target.value)}/></label>
            <label>Workspace ID<input required minLength="2" maxLength="63" pattern="[a-z0-9][a-z0-9-]{1,62}" value={slug} onChange={e=>setSlug(e.target.value.toLowerCase())} placeholder="my-company"/></label>
            <button className="primary" type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Create account'} <ArrowRight size={18}/></button>
          </form>
          <p className="foot"><button className="link" onClick={()=>navigate('login')}>Back to sign in</button></p>
        </>}
        {page === 'check-email' && signupEnabled && <>
          <div className="panel-icon"><Mail/></div><h2>Check your email</h2>
          <p className="muted">If your registration is eligible, your verification link expires in 30 minutes.</p>
          <button type="button" className="secondary" disabled={busy} onClick={()=>submit('resend')}>Resend verification email</button>
          <p className="foot"><button className="link" onClick={()=>navigate('login')}>Back to sign in</button></p>
        </>}
        {page === 'verify' && signupEnabled && <>
          <div className="panel-icon"><Mail/></div><h2>Verify your email</h2>
          <p className="muted">Finish setting up your company workspace.</p>
          <button className="primary" disabled={busy || !verificationToken} onClick={()=>submit('verify')}>{busy ? 'Verifying…' : 'Verify email'} <ArrowRight size={18}/></button>
          <p className="foot"><button className="link" onClick={()=>navigate('login')}>Back to sign in</button></p>
        </>}
        {page === 'workspaces' && token && <>
          <div className="panel-icon"><Building2/></div><h2>Your workspaces</h2><p className="muted">Select a company workspace you have access to.</p>
          {memberships.length ? memberships.map(t=><button className="workspace" key={t.tenant_id} disabled={busy} onClick={()=>openTenant(t)}><span><strong>{t.display_name}</strong><small>{t.role}</small></span><ArrowRight size={18}/></button>)
            : <div className="empty">No active workspaces found for this account.</div>}
        </>}
        {page === 'company-setup' && token && selected && editing && <>
          <div className="panel-icon"><Building2/></div><h2>Company setup</h2>
          <p className="muted">Complete your business information for {selected.display_name}. GSTIN is optional for unregistered businesses.</p>
          <form onSubmit={e=>{e.preventDefault();saveCompany();}}>
            <label>Legal business name
              <input required minLength="2" maxLength="200" value={setup.legalName}
                onChange={e=>setSetup(v=>({...v,legalName:e.target.value}))}/></label>
            <label>Trade name (optional)
              <input maxLength="200" value={setup.tradeName}
                onChange={e=>setSetup(v=>({...v,tradeName:e.target.value}))}/></label>
            <label>State / UT
              <select value={setup.stateCode} onChange={e=>setSetup(v=>({...v,stateCode:e.target.value}))}>
                <option value="">Select state or UT</option>
                {Object.entries(states).map(([code,name])=><option key={code} value={code}>{code} — {name}</option>)}
              </select></label>
            <label>GSTIN (optional)
              <input value={setup.gstin} maxLength="15" pattern="[0-9]{2}[A-Za-z]{5}[0-9]{4}[A-Za-z][1-9A-Za-z]Z[0-9A-Za-z]"
                placeholder="15-character GSTIN" onChange={e=>setSetup(v=>({...v,gstin:e.target.value.toUpperCase()}))}/></label>
            <label>Billing email
              <input type="email" maxLength="254" value={setup.billingEmail}
                onChange={e=>setSetup(v=>({...v,billingEmail:e.target.value}))}/></label>
            <div className="sectiontitle">Billing address</div>
            {[
              ['line1','Address line 1'],['line2','Address line 2'],['city','City'],
              ['state','State / UT name'],['postalCode','PIN code']
            ].map(([key,name])=><label key={key}>{name}
              <input maxLength={key === 'postalCode' ? 10 : 200} value={setup[key]}
                onChange={e=>setSetup(v=>({...v,[key]:e.target.value}))}/></label>)}
            <button className="primary" type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save company details'} <ArrowRight size={18}/></button>
          </form>
          <p className="foot"><button type="button" className="link" onClick={()=>navigate('dashboard')}>Back to workspace</button></p>
        </>}
        {page === 'dashboard' && token && selected && <>
          <div className="panel-icon"><Building2/></div><h2>{selected.display_name}</h2>
          <p className="muted">Workspace access: {selected.role}</p>
          <div className="sectiontitle">Registered companies</div>
          {companies.length ? companies.map(c=><div key={c.id} className="company">
            <strong>{c.legal_name}</strong>
            <small>{c.gstin || 'GSTIN not configured'}</small>
            {['owner','admin'].includes(selected.role) &&
              <button type="button" className="link setup-link" onClick={()=>editCompany(c)}>
                Complete / edit company setup
              </button>}
          </div>) : <div className="empty">No company records returned.</div>}
          <p className="muted note">After company setup, open your Anytime GST dashboard to review your business. Billing operations are being migrated from the original application.</p>
          {companies.map(c=><button key={c.id} type="button" className="primary" onClick={()=>{setActiveCompany(c);setPage('billing');}}>Open {c.legal_name} Dashboard <ArrowRight size={18}/></button>)}
          <button type="button" className="secondary" onClick={()=>navigate('workspaces')}>Change workspace</button>
        </>}
      </section>
    </main>
    <footer>Anytime GST • Your GST. Anytime. Anywhere. • Staging — no live invoices or payments</footer>
    </>}
  </div>;
}

createRoot(document.getElementById('root')).render(<Portal/>);
