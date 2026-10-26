import { useState, type FormEvent } from 'react';
import { api } from '../local-client';
import { membershipCategoryForAge } from '../../membership-categories';

type AccountType = 'individual' | 'institution';

function getAge(dob: string) {
  if (!dob) return null;
  const birth = new Date(`${dob}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age--;
  return age;
}

export default function AccountRegistration() {
  const [type, setType] = useState<AccountType>('individual');
  const [form, setForm] = useState<Record<string, string>>({
    name: '', loginEmail: '', password: '', dob: '', phone: '', email: '', region: '', guardianName: '',
    address: '', county: '', subCounty: '', principalName: '', principalMobile: '', principalEmail: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const age = type === 'individual' ? getAge(form.dob) : null;
  const branch = age === null ? '' : age < 3 ? 'Not eligible for a category' : membershipCategoryForAge(age);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const { loginEmail, password, ...details } = form;
      await api.post(`/api/admin/accounts/${type}`, { ...details, loginEmail, password });
      setSuccess(`${type === 'individual' ? 'Individual' : 'Institution'} account created. Share the login email and temporary password securely with the account holder.`);
      setForm((current) => ({ ...current, name: '', loginEmail: '', password: '', dob: '', phone: '', email: '', region: '', guardianName: '', address: '', county: '', subCounty: '', principalName: '', principalMobile: '', principalEmail: '' }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the account.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">Create Accounts</div>
          <div className="page-sub">Set up individual member and institution logins</div>
        </div>
      </div>
      <div className="card" style={{ maxWidth: 760 }}>
        <div className="field-grid" style={{ marginBottom: 22 }}>
          <button type="button" className={`btn ${type === 'individual' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setType('individual'); setError(''); setSuccess(''); }}>Individual Account</button>
          <button type="button" className={`btn ${type === 'institution' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setType('institution'); setError(''); setSuccess(''); }}>Institution Account</button>
        </div>
        <form onSubmit={submit}>
          <div className="section-divider">{type === 'individual' ? 'Member details' : 'Institution details'}</div>
          <div className="field"><label className="field-label">{type === 'individual' ? 'Full name' : 'Institution name'} *</label><input className="input" required value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
          {type === 'individual' ? (
            <>
              <div className="field-grid">
                <div><label className="field-label">Date of birth *</label><input type="date" className="input" required max={new Date().toISOString().slice(0, 10)} value={form.dob} onChange={(e) => set('dob', e.target.value)} /></div>
                <div><label className="field-label">Guide unit (assigned by age)</label><input className="input" readOnly value={branch ? `${branch}${age !== null ? ` · age ${age}` : ''}` : 'Enter date of birth'} /></div>
              </div>
              <div className="field-grid">
                <div><label className="field-label">Phone</label><input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
                <div><label className="field-label">Region / County</label><input className="input" value={form.region} onChange={(e) => set('region', e.target.value)} /></div>
              </div>
              {age !== null && age < 18 && <div className="field"><label className="field-label">Guardian name</label><input className="input" value={form.guardianName} onChange={(e) => set('guardianName', e.target.value)} /></div>}
            </>
          ) : (
            <>
              <div className="field-grid">
                <div><label className="field-label">Phone</label><input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
                <div><label className="field-label">County</label><input className="input" value={form.county} onChange={(e) => set('county', e.target.value)} /></div>
              </div>
              <div className="field-grid">
                <div><label className="field-label">Sub-county</label><input className="input" value={form.subCounty} onChange={(e) => set('subCounty', e.target.value)} /></div>
                <div><label className="field-label">Address</label><input className="input" value={form.address} onChange={(e) => set('address', e.target.value)} /></div>
              </div>
              <div className="section-divider">Primary contact</div>
              <div className="field-grid">
                <div><label className="field-label">Contact name</label><input className="input" value={form.principalName} onChange={(e) => set('principalName', e.target.value)} /></div>
                <div><label className="field-label">Contact phone</label><input className="input" value={form.principalMobile} onChange={(e) => set('principalMobile', e.target.value)} /></div>
              </div>
            </>
          )}
          <div className="section-divider">Login details</div>
          <div className="field-grid">
            <div><label className="field-label">Login email *</label><input type="email" className="input" required value={form.loginEmail} onChange={(e) => set('loginEmail', e.target.value)} /></div>
            <div><label className="field-label">Temporary password *</label><input type="password" className="input" required minLength={8} autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} /></div>
          </div>
          <p className="page-sub" style={{ marginTop: 0 }}>At least 8 characters. The user can sign in with these details immediately.</p>
          {error && <div className="card" role="alert" style={{ marginBottom: 14, color: 'var(--danger)' }}>{error}</div>}
          {success && <div className="card" role="status" style={{ marginBottom: 14, color: 'var(--success)' }}>{success}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Creating…' : `Create ${type === 'individual' ? 'Individual' : 'Institution'} Account`}</button></div>
        </form>
      </div>
    </div>
  );
}
