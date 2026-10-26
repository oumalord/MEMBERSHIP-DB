import { useState } from 'react';
import { Users, Receipt, CalendarDays, User, Building2, ShieldCheck } from 'lucide-react';
import { Logo, useBranding } from '../branding';
import { auth, api } from '../local-client';

type ResolvedHandler = (portal: 'admin' | 'institution' | 'individual', data: any) => void;

const LEVELS = ['Rainbow', 'Brownie', 'Guide', 'Ranger', 'Young Leader'];
const TRAININGS = ['Introductory', 'Pre-warrant', 'Advanced', 'Specialized'];
const INVOLVEMENTS = ['Guide leader', 'Trainer', 'Commissioner', 'Other'];
const ENGAGEMENT_LEVELS = ['Unit', 'County', 'National', 'International', 'Other'];

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function unitForBirthDate(dob: string) {
  if (!dob) return '';
  const birth = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return '';
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age--;
  if (age < 0 || age > 120) return 'Invalid date of birth';
  if (age < 5) return 'Not eligible for a unit';
  if (age <= 6) return 'Rainbow';
  if (age <= 9) return 'Brownie';
  if (age <= 14) return 'Girl Guide';
  if (age <= 17) return 'Ranger Guide';
  return 'Adult Leader';
}

export default function Landing({ onResolved }: { onResolved: ResolvedHandler }) {
  const { branding } = useBranding();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [activePortal, setActivePortal] = useState<'individual' | 'institution'>('individual');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showIndividualForm, setShowIndividualForm] = useState(false);
  const [showInstitutionForm, setShowInstitutionForm] = useState(false);

  const credentials = () => {
    const e = email.trim();
    if (!e || !password) { setErr('Enter your email and password.'); return null; }
    return { e, p: password };
  };

  const signInIndividual = async () => {
    const c = credentials(); if (!c) return;
    setBusy('signin-individual'); setErr('');
    try {
      await auth.signIn(c.e, c.p);
    } catch (e: any) { setErr(e.message); setBusy(null); return; }
    try {
      const r = await api.get('/api/individual/me');
      onResolved('individual', r.data);
    } catch {
      setErr('No individual account found for this login. Please sign up first.');
    } finally { setBusy(null); }
  };

  const signInInstitution = async () => {
    const c = credentials(); if (!c) return;
    setBusy('signin-institution'); setErr('');
    try {
      await auth.signIn(c.e, c.p);
    } catch (e: any) { setErr(e.message); setBusy(null); return; }
    try {
      const r = await api.get('/api/institution/me');
      onResolved('institution', r.data);
    } catch {
      setErr('No institution account found for this login. Please sign up first.');
    } finally { setBusy(null); }
  };

  const signInAdmin = async () => {
    const c = credentials(); if (!c) return;
    setBusy('signin-admin'); setErr('');
    try {
      await auth.signIn(c.e, c.p);
    } catch (e: any) { setErr(e.message); setBusy(null); return; }
    try {
      const r = await api.post('/api/admin/session', {});
      onResolved('admin', r.data);
    } catch (e: any) {
      if (e.status === 403) {
        await auth.signOut();
        setErr(e.message || 'No admin account found for this login. Ask your Super Admin for an invitation.');
      } else {
        setErr(e.message || 'Could not verify admin access. Please try again.');
      }
    } finally { setBusy(null); }
  };

  // Registers the login; if the email already has one, falls back to signing in with the same password.
  const registerOrSignIn = async (): Promise<boolean> => {
    const c = credentials(); if (!c) return false;
    setErr('');
    try {
      await auth.register(c.e, c.p);
      return true;
    } catch (e: any) {
      if (!/already exists/i.test(e.message)) { setErr(e.message); return false; }
    }
    try { await auth.signIn(c.e, c.p); return true; } catch { setErr('An account with this email already exists. Use its password, or sign in.'); return false; }
  };

  const startSignUpIndividual = async () => { if (await registerOrSignIn()) setShowIndividualForm(true); };
  const startSignUpInstitution = async () => { if (await registerOrSignIn()) setShowInstitutionForm(true); };

  const signInSelectedPortal = async () => {
    if (activePortal === 'individual') {
      await signInIndividual();
      return;
    }
    await signInInstitution();
  };

  const createAccountForSelectedPortal = async () => {
    if (activePortal === 'individual') {
      await startSignUpIndividual();
      return;
    }
    await startSignUpInstitution();
  };

  return (
    <div className="login-shell">
      <section className="auth-hero" aria-hidden="true">
        <div className="auth-brand">
          <Logo />
          <div>
            <div className="auth-brand-name">{branding.orgName}</div>
            <div className="auth-brand-sub">Membership System</div>
          </div>
        </div>
        <div className="auth-hero-body">
          <h2>{branding.tagline || 'Welcome'}</h2>
          <p>One secure workspace to manage memberships, subscriptions, events and communication across every unit and institution.</p>
          <ul className="auth-features">
            <li><span className="ico"><Users size={16} /></span>Member and institution registers in one place</li>
            <li><span className="ico"><Receipt size={16} /></span>Invoices, receipts and subscription tracking</li>
            <li><span className="ico"><CalendarDays size={16} /></span>Events, participation and bulk messaging</li>
          </ul>
        </div>
        <div className="auth-foot">© {new Date().getFullYear()} {branding.orgName} Membership System</div>
      </section>

      <section className="auth-panel" role="region" aria-label="Sign in">
        <div className="auth-card">
          <div className="auth-mobile-brand"><Logo /><span>{branding.orgName}</span></div>
          <h1>Welcome back</h1>
          <p className="lead">Sign in to your {branding.orgName} account to continue.</p>

          <div className="landing-tabs" role="tablist" aria-label="Sign in portal">
            <button
              type="button"
              className={`landing-tab ${activePortal === 'individual' ? 'active' : ''}`}
              onClick={() => setActivePortal('individual')}
              disabled={!!busy}
            >
              <User size={16} /> Individual
            </button>
            <button
              type="button"
              className={`landing-tab ${activePortal === 'institution' ? 'active' : ''}`}
              onClick={() => setActivePortal('institution')}
              disabled={!!busy}
            >
              <Building2 size={16} /> Institution
            </button>
          </div>

          <div className="landing-field">
            <label className="landing-label">Email address</label>
            <input
              type="email"
              className="landing-input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              disabled={!!busy}
            />
          </div>

          <div className="landing-field">
            <label className="landing-label">Password</label>
            <input
              type="password"
              className="landing-input"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={!!busy}
            />
          </div>

          <button className="landing-signin-btn" onClick={signInSelectedPortal} disabled={!!busy}>
            {busy === 'signin-individual' || busy === 'signin-institution' ? 'Signing in…' : 'Sign In'}
          </button>
          <button type="button" className="landing-create-btn" onClick={createAccountForSelectedPortal} disabled={!!busy}>Create Account</button>

          <div className="landing-divider">Staff access</div>
          <button type="button" className="landing-admin-link" onClick={signInAdmin} disabled={!!busy}>
            <ShieldCheck size={15} /> {busy === 'signin-admin' ? 'Signing in admin…' : 'Admin Sign In'}
          </button>

          {err && <p className="landing-error">{err}</p>}
        </div>
      </section>

      {showIndividualForm && (
        <IndividualSignupModal
          onClose={() => setShowIndividualForm(false)}
          onSaved={(data) => { setShowIndividualForm(false); onResolved('individual', data); }}
        />
      )}
      {showInstitutionForm && (
        <InstitutionSignupModal
          onClose={() => setShowInstitutionForm(false)}
          onSaved={(data) => { setShowInstitutionForm(false); onResolved('institution', data); }}
        />
      )}
    </div>
  );
}

function ChipToggle({ label, options, selected, onToggle }: { label: string; options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      <div className="chip-row">
        {options.map((o) => (
          <button type="button" key={o} className={`chip ${selected.includes(o) ? 'active' : ''}`} onClick={() => onToggle(o)}>{o}</button>
        ))}
      </div>
    </div>
  );
}

function IndividualSignupModal({ onClose, onSaved }: { onClose: () => void; onSaved: (data: any) => void }) {
  const [form, setForm] = useState({
    name: '', idNo: '', dob: '', maritalStatus: '', poBox: '', town: '', phone: '', email: '',
    occupation: '', employer: '', workPhone: '', workEmail: '', otherSkills: '',
    nextOfKinName: '', nextOfKinRelationship: '', nextOfKinPhone: '', nextOfKinEmail: '',
    yearJoinedGuiding: '', guidingAwards: '', leadershipHistory: '', currentSupport: '',
  });
  const [levelsUndertaken, setLevelsUndertaken] = useState<string[]>([]);
  const [trainingsReceived, setTrainingsReceived] = useState<string[]>([]);
  const [currentInvolvement, setCurrentInvolvement] = useState<string[]>([]);
  const [currentLevelOfEngagement, setCurrentLevelOfEngagement] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) { setErr('Full name is required.'); return; }
    if (!form.dob) { setErr('Date of birth is required to assign a guide unit.'); return; }
    setSaving(true); setErr('');
    try {
      const r = await api.post('/api/account/signup-individual', {
        ...form,
        levelsUndertaken: levelsUndertaken.join(', '),
        trainingsReceived: trainingsReceived.join(', '),
        currentInvolvement: currentInvolvement.join(', '),
        currentLevelOfEngagement: currentLevelOfEngagement.join(', '),
      });
      onSaved(r.data);
    } catch { setErr('Could not complete sign up. Please try again.'); } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Adult Member Registration</div>

        <div className="section-divider">Personal Information</div>
        <div className="field"><label className="field-label">Full Name *</label><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
        <div className="field-grid">
          <div><label className="field-label">ID No.</label><input className="input" value={form.idNo} onChange={(e) => set('idNo', e.target.value)} /></div>
          <div><label className="field-label">Date of Birth *</label><input type="date" required max={new Date().toISOString().slice(0, 10)} className="input" value={form.dob} onChange={(e) => set('dob', e.target.value)} /></div>
          <div><label className="field-label">Guide unit (assigned by age)</label><input className="input" readOnly value={unitForBirthDate(form.dob) || 'Enter date of birth'} /></div>
        </div>
        <div className="field-grid">
          <div><label className="field-label">Marital Status</label><input className="input" value={form.maritalStatus} onChange={(e) => set('maritalStatus', e.target.value)} /></div>
          <div><label className="field-label">Town</label><input className="input" value={form.town} onChange={(e) => set('town', e.target.value)} /></div>
        </div>
        <div className="field-grid">
          <div><label className="field-label">P.O. Box</label><input className="input" value={form.poBox} onChange={(e) => set('poBox', e.target.value)} /></div>
          <div><label className="field-label">Telephone</label><input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
        </div>
        <div className="field"><label className="field-label">Email</label><input className="input" value={form.email} onChange={(e) => set('email', e.target.value)} /></div>

        <div className="section-divider">Professional Information</div>
        <div className="field-grid">
          <div><label className="field-label">Occupation</label><input className="input" value={form.occupation} onChange={(e) => set('occupation', e.target.value)} /></div>
          <div><label className="field-label">Employer</label><input className="input" value={form.employer} onChange={(e) => set('employer', e.target.value)} /></div>
        </div>
        <div className="field-grid">
          <div><label className="field-label">Work Telephone</label><input className="input" value={form.workPhone} onChange={(e) => set('workPhone', e.target.value)} /></div>
          <div><label className="field-label">Work Email</label><input className="input" value={form.workEmail} onChange={(e) => set('workEmail', e.target.value)} /></div>
        </div>
        <div className="field"><label className="field-label">Other Professional Skills</label><input className="input" value={form.otherSkills} onChange={(e) => set('otherSkills', e.target.value)} /></div>

        <div className="section-divider">Next of Kin</div>
        <div className="field-grid">
          <div><label className="field-label">Name</label><input className="input" value={form.nextOfKinName} onChange={(e) => set('nextOfKinName', e.target.value)} /></div>
          <div><label className="field-label">Relationship</label><input className="input" value={form.nextOfKinRelationship} onChange={(e) => set('nextOfKinRelationship', e.target.value)} /></div>
        </div>
        <div className="field-grid">
          <div><label className="field-label">Telephone</label><input className="input" value={form.nextOfKinPhone} onChange={(e) => set('nextOfKinPhone', e.target.value)} /></div>
          <div><label className="field-label">Email</label><input className="input" value={form.nextOfKinEmail} onChange={(e) => set('nextOfKinEmail', e.target.value)} /></div>
        </div>

        <div className="section-divider">Guiding Information</div>
        <div className="field"><label className="field-label">Year of Joining Guiding</label><input className="input" value={form.yearJoinedGuiding} onChange={(e) => set('yearJoinedGuiding', e.target.value)} /></div>
        <ChipToggle label="Levels of Guiding Undertaken" options={LEVELS} selected={levelsUndertaken} onToggle={(v) => setLevelsUndertaken((l) => toggle(l, v))} />
        <ChipToggle label="Type of Guiding Trainings Received" options={TRAININGS} selected={trainingsReceived} onToggle={(v) => setTrainingsReceived((l) => toggle(l, v))} />
        <div className="field"><label className="field-label">Guiding Awards Received</label><input className="input" value={form.guidingAwards} onChange={(e) => set('guidingAwards', e.target.value)} /></div>
        <div className="field"><label className="field-label">Past Leadership Positions, Achievements or Recognition</label><textarea className="input" rows={2} value={form.leadershipHistory} onChange={(e) => set('leadershipHistory', e.target.value)} /></div>

        <div className="section-divider">Current Involvement in Guiding</div>
        <ChipToggle label="Current Involvement" options={INVOLVEMENTS} selected={currentInvolvement} onToggle={(v) => setCurrentInvolvement((l) => toggle(l, v))} />
        <ChipToggle label="Current Level of Engagement" options={ENGAGEMENT_LEVELS} selected={currentLevelOfEngagement} onToggle={(v) => setCurrentLevelOfEngagement((l) => toggle(l, v))} />
        <div className="field"><label className="field-label">Current Support to Guiding</label><textarea className="input" rows={2} value={form.currentSupport} onChange={(e) => set('currentSupport', e.target.value)} /></div>

        {err && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{err}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Create Account'}</button>
        </div>
      </div>
    </div>
  );
}

function InstitutionSignupModal({ onClose, onSaved }: { onClose: () => void; onSaved: (data: any) => void }) {
  const [form, setForm] = useState({
    name: '', address: '', phone: '', email: '', county: '', subCounty: '',
    principalName: '', principalMobile: '', principalEmail: '',
    noOfUnits: '', noOfGuidesInUnit: '', guideLeaderName: '', guideLeaderPhone: '', guideLeaderEmail: '', meetingDayTime: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) { setErr('Institution name is required.'); return; }
    setSaving(true); setErr('');
    try {
      const r = await api.post('/api/account/signup-institution', form);
      onSaved(r.data);
    } catch { setErr('Could not complete sign up. Please try again.'); } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 580 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Unit Registration</div>

        <div className="section-divider">Institution</div>
        <div className="field"><label className="field-label">Name of Institution *</label><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
        <div className="field-grid">
          <div><label className="field-label">Postal Address</label><input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} /></div>
          <div><label className="field-label">Tel</label><input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
        </div>
        <div className="field-grid">
          <div><label className="field-label">Email</label><input className="input" value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
          <div><label className="field-label">County</label><input className="input" value={form.county} onChange={(e) => set('county', e.target.value)} /></div>
        </div>
        <div className="field"><label className="field-label">Sub County</label><input className="input" value={form.subCounty} onChange={(e) => set('subCounty', e.target.value)} /></div>
        <div className="field-grid">
          <div><label className="field-label">Name of Principal / Head Teacher</label><input className="input" value={form.principalName} onChange={(e) => set('principalName', e.target.value)} /></div>
          <div><label className="field-label">Principal Mobile No.</label><input className="input" value={form.principalMobile} onChange={(e) => set('principalMobile', e.target.value)} /></div>
        </div>
        <div className="field"><label className="field-label">Principal Email</label><input className="input" value={form.principalEmail} onChange={(e) => set('principalEmail', e.target.value)} /></div>

        <div className="section-divider">Unit</div>
        <div className="field-grid">
          <div><label className="field-label">No. of Units</label><input className="input" value={form.noOfUnits} onChange={(e) => set('noOfUnits', e.target.value)} /></div>
          <div><label className="field-label">No. of Guides in the Unit</label><input className="input" value={form.noOfGuidesInUnit} onChange={(e) => set('noOfGuidesInUnit', e.target.value)} /></div>
        </div>
        <div className="field-grid">
          <div><label className="field-label">Name of Guide Leader</label><input className="input" value={form.guideLeaderName} onChange={(e) => set('guideLeaderName', e.target.value)} /></div>
          <div><label className="field-label">Guide Leader Tel</label><input className="input" value={form.guideLeaderPhone} onChange={(e) => set('guideLeaderPhone', e.target.value)} /></div>
        </div>
        <div className="field-grid">
          <div><label className="field-label">Guide Leader Email</label><input className="input" value={form.guideLeaderEmail} onChange={(e) => set('guideLeaderEmail', e.target.value)} /></div>
          <div><label className="field-label">Day & Time of Weekly Meetings</label><input className="input" value={form.meetingDayTime} onChange={(e) => set('meetingDayTime', e.target.value)} /></div>
        </div>

        {err && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{err}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Create Institution Account'}</button>
        </div>
      </div>
    </div>
  );
}
