import { useEffect, useState, useCallback, type ReactNode } from 'react';
import { auth, api } from './local-client';
import { Logo, useBranding } from './branding';
import Settings from './sections/Settings';
import Landing from './sections/Landing';
import Dashboard from './sections/Dashboard';
import Members from './sections/Members';
import Transactions from './sections/Transactions';
import Messages from './sections/Messages';
import Events from './sections/Events';
import Reports from './sections/Reports';
import AdminAccounts from './sections/AdminAccounts';
import IndividualDashboard from './sections/IndividualDashboard';
import InstitutionDashboard from './sections/InstitutionDashboard';
import { LayoutDashboard, Users, Receipt, Mail, CalendarDays, BarChart3, ShieldCheck, LogOut, Menu, X, Settings as SettingsIcon, type LucideIcon } from 'lucide-react';
import type { AdminAccount as AdminAccountRecord, Institution, Member } from './types';

type AdminTab = 'dashboard' | 'members' | 'transactions' | 'messages' | 'events' | 'reports' | 'accounts' | 'settings';
type Portal = 'admin' | 'institution' | 'individual' | null;

const ADMIN_NAV: { key: AdminTab; label: string; icon: LucideIcon }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'members', label: 'Members', icon: Users },
  { key: 'transactions', label: 'Invoices & Receipts', icon: Receipt },
  { key: 'messages', label: 'Messages', icon: Mail },
  { key: 'events', label: 'Events', icon: CalendarDays },
  { key: 'reports', label: 'Reports', icon: BarChart3 },
  { key: 'accounts', label: 'Admin Accounts', icon: ShieldCheck },
  { key: 'settings', label: 'Settings', icon: SettingsIcon },
];

const initials = (s: string) => s.split(/[\s@]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

function SignOutButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="btn btn-secondary btn-sm" style={{ width: '100%' }} onClick={onClick}>
      <LogOut size={14} /> Sign Out
    </button>
  );
}

function UserChip({ name, role }: { name: string; role: string }) {
  return (
    <div className="user-chip">
      <div className="user-avatar">{initials(name) || 'U'}</div>
      <div style={{ minWidth: 0 }}>
        <div className="user-name">{name}</div>
        <div className="brand-sub">{role}</div>
      </div>
    </div>
  );
}

export default function App() {
  const { branding } = useBranding();
  const [checking, setChecking] = useState(true);
  const [signedIn, setSignedIn] = useState(false);
  const [portal, setPortal] = useState<Portal>(null);
  const [adminMe, setAdminMe] = useState<AdminAccountRecord | null>(null);
  const [institutionMe, setInstitutionMe] = useState<Institution | null>(null);
  const [individualMe, setIndividualMe] = useState<Member | null>(null);
  const [adminTab, setAdminTab] = useState<AdminTab>('dashboard');

  const detectPortal = useCallback(async () => {
    try {
      const status = await api.get('/api/account/status');
      if (status.data.isAdmin) {
        const me = await api.get('/api/admin/me');
        setAdminMe(me.data);
        setPortal('admin');
        return;
      }
      if (status.data.isInstitution) {
        const me = await api.get('/api/institution/me');
        setInstitutionMe(me.data);
        setPortal('institution');
        return;
      }
      if (status.data.isIndividual) {
        const me = await api.get('/api/individual/me');
        setIndividualMe(me.data);
        setPortal('individual');
        return;
      }
      setPortal(null);
    } catch {
      setPortal(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const isIn = auth.isSignedIn();
      setSignedIn(isIn);
      if (isIn) await detectPortal();
      setChecking(false);
    })();
  }, [detectPortal]);

  const handleResolved = (p: 'admin' | 'institution' | 'individual', data: any) => {
    setSignedIn(true);
    if (p === 'admin') { setAdminMe(data); setPortal('admin'); }
    if (p === 'institution') { setInstitutionMe(data); setPortal('institution'); }
    if (p === 'individual') { setIndividualMe(data); setPortal('individual'); }
  };

  const handleSignOut = async () => {
    await auth.signOut();
    setSignedIn(false);
    setPortal(null);
    setAdminMe(null);
    setInstitutionMe(null);
    setIndividualMe(null);
  };

  if (checking) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <div className="login-logo">KG</div>
          <p style={{ color: 'var(--muted)' }}>Loadingâ€¦</p>
        </div>
      </div>
    );
  }

  if (!signedIn || !portal) {
    return <Landing onResolved={handleResolved} />;
  }

  if (portal === 'institution' && institutionMe) {
    return (
      <Shell title={institutionMe.name} subtitle="Institution Portal" onSignOut={handleSignOut}>
        <InstitutionDashboard />
      </Shell>
    );
  }

  if (portal === 'individual' && individualMe) {
    return (
      <Shell title={individualMe.name} subtitle="Member Portal" onSignOut={handleSignOut}>
        <IndividualDashboard member={individualMe} onUpdated={setIndividualMe} />
      </Shell>
    );
  }

  if (portal === 'admin' && adminMe) {
    const canEdit = adminMe.canEdit;
    const canManageAdmins = adminMe.isSuperAdmin || adminMe.canManageAdmins;
    const nav = ADMIN_NAV.filter((n) => (n.key === 'settings' ? adminMe.isSuperAdmin : n.key !== 'accounts' || canManageAdmins));
    return (
      <Shell
        title={branding.orgName}
        subtitle="Admin Portal"
        nav={nav}
        activeKey={adminTab}
        onNavigate={(k) => setAdminTab(k as AdminTab)}
        user={{ name: adminMe.name || adminMe.email, role: adminMe.isSuperAdmin ? 'Super Admin' : canEdit ? 'Admin · Edit' : 'Admin · View Only' }}
        onSignOut={handleSignOut}
      >
        {adminTab === 'dashboard' && <Dashboard />}
        {adminTab === 'members' && <Members canEdit={canEdit} />}
        {adminTab === 'transactions' && <Transactions canEdit={canEdit} />}
        {adminTab === 'messages' && <Messages canEdit={canEdit} />}
        {adminTab === 'events' && <Events canEdit={canEdit} />}
        {adminTab === 'reports' && <Reports />}
        {adminTab === 'accounts' && canManageAdmins && <AdminAccounts isSuperAdmin={adminMe.isSuperAdmin} />}
        {adminTab === 'settings' && adminMe.isSuperAdmin && <Settings />}
      </Shell>
    );
  }

  return <Landing onResolved={handleResolved} />;
}

interface NavEntry { key: string; label: string; icon: LucideIcon }

function Shell({ title, subtitle, nav = [], activeKey, onNavigate, user, onSignOut, children }: {
  title: string; subtitle: string; nav?: NavEntry[]; activeKey?: string; onNavigate?: (key: string) => void;
  user?: { name: string; role: string }; onSignOut: () => void; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <div className="app-shell">
      <header className="mobile-bar">
        <button className="icon-btn" aria-label="Open menu" onClick={() => setOpen(true)}><Menu size={20} /></button>
        <Logo />
        <div className="mobile-bar-title">{title}</div>
      </header>
      {open && <div className="drawer-backdrop" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <Logo />
          <div style={{ minWidth: 0 }}><div className="brand-title">{title}</div><div className="brand-sub">{subtitle}</div></div>
          <button className="icon-btn drawer-close" aria-label="Close menu" onClick={() => setOpen(false)}><X size={18} /></button>
        </div>
        <nav className="sidebar-nav">
          {nav.length > 0 && <div className="nav-label">Menu</div>}
          {nav.map((n) => (
            <button key={n.key} className={`nav-item ${activeKey === n.key ? 'active' : ''}`} onClick={() => { onNavigate?.(n.key); setOpen(false); window.scrollTo({ top: 0 }); }}>
              <n.icon size={18} />{n.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          {user && <UserChip name={user.name} role={user.role} />}
          <SignOutButton onClick={onSignOut} />
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

