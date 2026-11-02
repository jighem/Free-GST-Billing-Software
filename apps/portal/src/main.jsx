import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowRight, Building2, CheckCircle2, FileText, LockKeyhole, LogOut, Mail, ShieldCheck } from 'lucide-react';
import { api } from './api.js';
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
  const [page, setPage] = useState('login');
  const [token, setToken] = useState(null); // memory only; never localStorage
  const [memberships, setMemberships] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [verificationToken] = useState(getVerificationToken);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [slug, setSlug] = useState('');

  function navigate(next) { setError(''); setNotice(''); setPage(next); }
  function resetSession() {
    setToken(null); setPassword(''); setMemberships([]); setCompanies([]); setSelected(null);
    navigate('login');
  }

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
        setPage('workspaces');
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

  async function openTenant(workspace) {
    if (!token) return resetSession();
    setBusy(true); setError(''); setCompanies([]);
    try {
      const result = await api('/tenants/' + encodeURIComponent(workspace.tenant_id) + '/companies', { token });
      setCompanies(result);
      setSelected(workspace);
      setPage('dashboard');
    } catch (err) {
      setError(err.message);
      if (err.status === 401) resetSession();
    } finally { setBusy(false); }
  }

  return <div className="shell">
    <header className="topbar">
      <div className="brand"><span className="brandicon"><FileText size={22}/></span> GST <strong>SaaS</strong><span className="staging">STAGING</span></div>
      {token && <button type="button" className="textbtn" onClick={resetSession}><LogOut size={16}/> Sign out</button>}
    </header>
    <main className="main">
      <section className="intro">
        <span className="eyebrow"><ShieldCheck size={15}/> Secure cloud invoicing platform</span>
        <h1>Business billing,<br/><em>made simpler.</em></h1>
        <p>Organize your companies, manage GST invoicing and build smarter workflows in one place.</p>
        <div className="benefit"><CheckCircle2 size={18}/> Separate company workspaces</div>
        <div className="benefit"><CheckCircle2 size={18}/> GST-ready billing foundation</div>
        <div className="benefit"><CheckCircle2 size={18}/> Future CRM and accounting integrations</div>
        <div className="disclaimer">Development preview. Do not enter live GST, customer or financial data.</div>
      </section>
      <section className="panel">
        {error && <div className="message error" role="alert">{error}</div>}
        {notice && <div className="message success" role="status">{notice}</div>}
        {page === 'login' && <>
          <div className="panel-icon"><LockKeyhole/></div><h2>Welcome back</h2><p className="muted">Sign in to your GST SaaS workspace.</p>
          <form onSubmit={e => { e.preventDefault(); submit('login'); }}>
            <label>Email address<input type="email" required autoComplete="username" maxLength="254" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com"/></label>
            <label>Password<input type="password" required autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Your password"/></label>
            <button className="primary" disabled={busy} type="submit">{busy ? 'Signing in…' : 'Sign in'} <ArrowRight size={18}/></button>
          </form>
          {signupEnabled ? <p className="foot">New to GST SaaS? <button className="link" onClick={()=>navigate('register')}>Create an account</button></p>
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
        {page === 'dashboard' && token && selected && <>
          <div className="panel-icon"><Building2/></div><h2>{selected.display_name}</h2>
          <p className="muted">Workspace access: {selected.role}</p>
          <div className="sectiontitle">Registered companies</div>
          {companies.length ? companies.map(c=><div key={c.id} className="company"><strong>{c.legal_name}</strong><small>{c.gstin || 'GSTIN not configured'}</small></div>) : <div className="empty">No company records returned.</div>}
          <p className="muted note">Invoice creation and subscription administration are not available in this development preview.</p>
          <button type="button" className="secondary" onClick={()=>navigate('workspaces')}>Change workspace</button>
        </>}
      </section>
    </main>
    <footer>GST SaaS • Development environment • No live invoices or payments</footer>
  </div>;
}

createRoot(document.getElementById('root')).render(<Portal/>);
