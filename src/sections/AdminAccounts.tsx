import { useEffect, useState } from 'react';
import { api } from '../local-client';
import type { AdminAccount } from '../types';

export default function AdminAccounts({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [wipeResult, setWipeResult] = useState('');

  const load = async () => {
    const r = await api.get('/api/admin/accounts');
    setAccounts(r.data.items || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleEdit = async (a: AdminAccount) => {
    await api.put(`/api/admin/accounts/${a.id}/rights`, { canEdit: !a.canEdit });
    await load();
  };

  const toggleManage = async (a: AdminAccount) => {
    await api.put(`/api/admin/accounts/${a.id}/rights`, { canManageAdmins: !a.canManageAdmins });
    await load();
  };

  const removeAdmin = async (a: AdminAccount) => {
    if (!confirm(`Remove admin access for ${a.email}?`)) return;
    await api.delete(`/api/admin/accounts/${a.id}`);
    await load();
  };

  const wipeDemoData = async () => {
    if (!confirm('This will permanently delete all members, institutions, transactions, events, and messages. Admin accounts are kept. Continue?')) return;
    setWiping(true);
    setWipeResult('');
    try {
      const r = await api.post('/api/admin/wipe-demo-data', {});
      const total = Object.values(r.data.counts as Record<string, number>).reduce((s: number, n: number) => s + n, 0);
      setWipeResult(`Removed ${total} record(s).`);
    } catch {
      setWipeResult('Could not wipe data. Please try again.');
    } finally {
      setWiping(false);
    }
  };

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">Admin Accounts</div>
          <div className="page-sub">Manage administrators and their editing rights</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowInvite(true)}>+ Create Admin</button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? <div className="empty-state">Loading…</div> : (
          <table className="data-table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Editing</th><th>Can Manage Admins</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontWeight: 600 }}>{a.name || '—'}</td>
                  <td>{a.email}</td>
                  <td><span className={`badge ${a.isSuperAdmin ? 'badge-super' : 'badge-staff'}`}>{a.isSuperAdmin ? 'Super Admin' : 'Admin'}</span></td>
                  <td>
                    {a.isSuperAdmin ? <span className="badge badge-edit">Edit</span> : (
                      <button className={`chip ${a.canEdit ? 'active' : ''}`} onClick={() => toggleEdit(a)}>{a.canEdit ? 'Edit' : 'View Only'}</button>
                    )}
                  </td>
                  <td>
                    {a.isSuperAdmin ? '—' : isSuperAdmin ? (
                      <button className={`chip ${a.canManageAdmins ? 'active' : ''}`} onClick={() => toggleManage(a)}>{a.canManageAdmins ? 'Yes' : 'No'}</button>
                    ) : (a.canManageAdmins ? 'Yes' : 'No')}
                  </td>
                  <td><span className={`badge ${a.status === 'active' ? 'badge-active' : 'badge-pending'}`}>{a.status}</span></td>
                  <td>{!a.isSuperAdmin && isSuperAdmin && <button className="btn btn-danger btn-sm" onClick={() => removeAdmin(a)}>Remove</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {isSuperAdmin && (
        <div className="card" style={{ marginTop: 24, borderColor: 'var(--danger)' }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: 'var(--danger)' }}>Danger Zone</h3>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>Permanently remove all members, institutions, transactions, events, and messages. Admin accounts are not affected.</p>
          {wipeResult && <p style={{ fontSize: 13, color: 'var(--accent)', marginBottom: 10 }}>{wipeResult}</p>}
          <button className="btn btn-danger" onClick={wipeDemoData} disabled={wiping}>{wiping ? 'Wiping…' : 'Wipe All Data'}</button>
        </div>
      )}

      {showInvite && <InviteAdminModal isSuperAdmin={isSuperAdmin} onClose={() => setShowInvite(false)} onSaved={() => { setShowInvite(false); load(); }} />}
    </div>
  );
}

function InviteAdminModal({ isSuperAdmin, onClose, onSaved }: { isSuperAdmin: boolean; onClose: () => void; onSaved: () => void }) {
  const [email, setEmail] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [canManageAdmins, setCanManageAdmins] = useState(false);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!email.trim()) { setErr('Email is required.'); return; }
    if (password.length < 8) { setErr('Set a temporary password of at least 8 characters.'); return; }
    setSaving(true); setErr('');
    try {
      await api.post('/api/admin/accounts/invite', { email: email.trim(), password, canEdit, canManageAdmins });
      onSaved();
    } catch (e: any) { setErr(e.message || 'Could not create the admin account.'); } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Create Admin Account</div>
        <div className="field"><label className="field-label">Email *</label><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" /></div>
        <div className="field"><label className="field-label">Temporary password *</label><input className="input" type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" /></div>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>Share the email and password with them securely. They sign in using the Admin Sign In button. If this email already has a login, its existing password is kept.</p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, marginBottom: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={canEdit} onChange={(e) => setCanEdit(e.target.checked)} /> Grant editing rights (default is view-only)
        </label>
        {isSuperAdmin && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, marginBottom: 14, cursor: 'pointer' }}>
            <input type="checkbox" checked={canManageAdmins} onChange={(e) => setCanManageAdmins(e.target.checked)} /> Allow this admin to grant editing rights to others
          </label>
        )}
        {err && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{err}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? 'Creating…' : 'Create Admin'}</button>
        </div>
      </div>
    </div>
  );
}
