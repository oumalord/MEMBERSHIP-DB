import { useEffect, useState } from 'react';
import { api } from '../local-client';
import type { Member, Transaction } from '../types';

const BRANCHES = ['Rainbow', 'Brownie', 'Girl Guide', 'Ranger Guide', 'Adult Leader', 'Unassigned'];
const STATUSES = ['active', 'pending', 'suspended', 'expelled'];

export default function Members({ canEdit }: { canEdit: boolean }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<Member | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = async () => {
    setLoading(true);
    const r = await api.get('/api/admin/members');
    setMembers(r.data.items || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = members.filter((m) => {
    if (branchFilter !== 'all' && m.branch !== branchFilter) return false;
    if (statusFilter !== 'all' && m.status !== statusFilter) return false;
    if (search && !m.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const runTransitionCheck = async () => {
    setBusy(true);
    const r = await api.post('/api/admin/members/transition-check', {});
    setNotice(`Transition check complete — ${r.data.updated} member(s) moved to a new branch.`);
    await load();
    setBusy(false);
    setTimeout(() => setNotice(''), 5000);
  };

  const runComplianceCheck = async () => {
    setBusy(true);
    const r = await api.post('/api/admin/members/compliance-check', {});
    setNotice(`Compliance check complete — ${r.data.suspended} suspended, ${r.data.expelled} expelled.`);
    await load();
    setBusy(false);
    setTimeout(() => setNotice(''), 5000);
  };

  const sourceLabel = (m: Member) => (m.source === 'institution' ? m.institutionName || 'Institution' : m.source === 'self' ? 'Individual (self)' : 'Admin');

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">Members</div>
          <div className="page-sub">{members.length} registered members</div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {canEdit && <button className="btn btn-secondary" onClick={runTransitionCheck} disabled={busy}>Run Branch Transition</button>}
          {canEdit && <button className="btn btn-secondary" onClick={runComplianceCheck} disabled={busy}>Run Compliance Check</button>}
          {canEdit && <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add Member</button>}
        </div>
      </div>

      {!canEdit && <div className="card" style={{ marginBottom: 16, padding: '12px 18px', fontSize: 13.5, color: 'var(--muted)' }}>You have view-only access. Ask a Super Admin for editing rights to make changes.</div>}
      {notice && <div className="card" style={{ marginBottom: 16, padding: '12px 18px', fontSize: 13.5, color: 'var(--accent)' }}>{notice}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="input" style={{ maxWidth: 240 }} placeholder="Search by name…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input" style={{ maxWidth: 180 }} value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
            <option value="all">All Branches</option>
            {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <select className="input" style={{ maxWidth: 160 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All Statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? <div className="empty-state">Loading members…</div> : filtered.length === 0 ? (
          <div className="empty-state">No members match your filters.</div>
        ) : (
          <table className="data-table">
            <thead><tr><th>Name</th><th>Branch</th><th>Added Via</th><th>Status</th><th>Subscription Expiry</th><th></th></tr></thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(m)}>
                  <td style={{ fontWeight: 600 }}>{m.name}</td>
                  <td>{m.branch}</td>
                  <td style={{ fontSize: 12.5, color: 'var(--muted)' }}>{sourceLabel(m)}</td>
                  <td><span className={`badge badge-${m.status}`}>{m.status}</span></td>
                  <td>{m.subscriptionExpiry}</td>
                  <td style={{ textAlign: 'right', color: 'var(--accent)', fontSize: 12.5, fontWeight: 600 }}>View →</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && <AddMemberModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
      {selected && <MemberDetailModal member={selected} canEdit={canEdit} onClose={() => setSelected(null)} onChanged={() => { load(); }} />}
    </div>
  );
}

function AddMemberModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', dob: '', phone: '', email: '', region: '', guardianName: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim()) { setErr('Name is required.'); return; }
    setSaving(true); setErr('');
    try {
      await api.post('/api/admin/members', form);
      onSaved();
    } catch {
      setErr('Could not save member. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Add Member</div>
        <div className="field"><label className="field-label">Full Name *</label><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
        <div className="field-grid">
          <div><label className="field-label">Date of Birth</label><input type="date" className="input" value={form.dob} onChange={(e) => set('dob', e.target.value)} /></div>
          <div><label className="field-label">Region / County</label><input className="input" value={form.region} onChange={(e) => set('region', e.target.value)} /></div>
        </div>
        <div className="field-grid">
          <div><label className="field-label">Phone</label><input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
          <div><label className="field-label">Email</label><input className="input" value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
        </div>
        <div className="field"><label className="field-label">Guardian Name (if minor)</label><input className="input" value={form.guardianName} onChange={(e) => set('guardianName', e.target.value)} /></div>
        {err && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{err}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save Member'}</button>
        </div>
      </div>
    </div>
  );
}

function MemberDetailModal({ member, canEdit, onClose, onChanged }: { member: Member; canEdit: boolean; onClose: () => void; onChanged: () => void }) {
  const [tx, setTx] = useState<Transaction[]>([]);
  const [showInvoice, setShowInvoice] = useState(false);
  const [invAmount, setInvAmount] = useState('');
  const [invDesc, setInvDesc] = useState('Annual Membership Subscription');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const loadTx = async () => {
    const r = await api.get(`/api/admin/transactions?memberId=${member.id}`);
    setTx(r.data.items || []);
  };
  useEffect(() => { loadTx(); }, [member.id]);

  const issueInvoice = async () => {
    if (!invAmount || Number(invAmount) <= 0) return;
    setBusy(true);
    await api.post(`/api/admin/members/${member.id}/invoice`, { amount: Number(invAmount), description: invDesc });
    setInvAmount('');
    setShowInvoice(false);
    await loadTx();
    setBusy(false);
  };

  const markPaid = async (id: string) => {
    setBusy(true);
    await api.post(`/api/admin/transactions/${id}/pay`, {});
    await loadTx();
    onChanged();
    setBusy(false);
  };

  const sendReminder = async () => {
    setBusy(true);
    await api.post(`/api/admin/members/${member.id}/reminder`, {});
    setNotice('Renewal reminder sent.');
    setBusy(false);
    setTimeout(() => setNotice(''), 4000);
  };

  const deleteMember = async () => {
    if (!confirm(`Remove ${member.name} from the register? This cannot be undone.`)) return;
    setBusy(true);
    await api.delete(`/api/admin/members/${member.id}`);
    onChanged();
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{member.name}</div>
        <div className="field-grid" style={{ fontSize: 13.5 }}>
          <div><span style={{ color: 'var(--muted)' }}>Branch</span><br />{member.branch}</div>
          <div><span style={{ color: 'var(--muted)' }}>Status</span><br /><span className={`badge badge-${member.status}`}>{member.status}</span></div>
          <div><span style={{ color: 'var(--muted)' }}>Region</span><br />{member.region || '—'}</div>
          <div><span style={{ color: 'var(--muted)' }}>Subscription Expiry</span><br />{member.subscriptionExpiry}</div>
          <div><span style={{ color: 'var(--muted)' }}>Phone</span><br />{member.phone || '—'}</div>
          <div><span style={{ color: 'var(--muted)' }}>Email</span><br />{member.email || '—'}</div>
        </div>

        {(member.membershipNo || member.interests || member.memberType === 'adult') && (
          <div className="card" style={{ margin: '14px 0', fontSize: 13 }}>
            {member.membershipNo && <div style={{ marginBottom: 6 }}><span style={{ color: 'var(--muted)' }}>Membership No.: </span>{member.membershipNo}</div>}
            {member.interests && <div style={{ marginBottom: 6 }}><span style={{ color: 'var(--muted)' }}>Interests/Hobbies: </span>{member.interests}</div>}
            {member.guardianPhone && <div style={{ marginBottom: 6 }}><span style={{ color: 'var(--muted)' }}>Guardian Phone: </span>{member.guardianPhone}</div>}
            {member.memberType === 'adult' && (
              <>
                {member.idNo && <div style={{ marginBottom: 6 }}><span style={{ color: 'var(--muted)' }}>ID No.: </span>{member.idNo}</div>}
                {member.occupation && <div style={{ marginBottom: 6 }}><span style={{ color: 'var(--muted)' }}>Occupation: </span>{member.occupation}{member.employer ? ` at ${member.employer}` : ''}</div>}
                {member.nextOfKinName && <div style={{ marginBottom: 6 }}><span style={{ color: 'var(--muted)' }}>Next of Kin: </span>{member.nextOfKinName}{member.nextOfKinPhone ? ` · ${member.nextOfKinPhone}` : ''}</div>}
                {member.yearJoinedGuiding && <div style={{ marginBottom: 6 }}><span style={{ color: 'var(--muted)' }}>Joined Guiding: </span>{member.yearJoinedGuiding}</div>}
                {member.levelsUndertaken && <div style={{ marginBottom: 6 }}><span style={{ color: 'var(--muted)' }}>Levels Undertaken: </span>{member.levelsUndertaken}</div>}
                {member.trainingsReceived && <div style={{ marginBottom: 6 }}><span style={{ color: 'var(--muted)' }}>Trainings: </span>{member.trainingsReceived}</div>}
                {member.currentInvolvement && <div style={{ marginBottom: 6 }}><span style={{ color: 'var(--muted)' }}>Current Involvement: </span>{member.currentInvolvement}</div>}
                {member.currentLevelOfEngagement && <div><span style={{ color: 'var(--muted)' }}>Level of Engagement: </span>{member.currentLevelOfEngagement}</div>}
              </>
            )}
          </div>
        )}

        {notice && <p style={{ color: 'var(--accent)', fontSize: 13, marginBottom: 10 }}>{notice}</p>}

        {canEdit && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '16px 0' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowInvoice((s) => !s)}>Issue Invoice</button>
            <button className="btn btn-secondary btn-sm" onClick={sendReminder} disabled={busy}>Send Reminder</button>
            <button className="btn btn-danger btn-sm" onClick={deleteMember} disabled={busy}>Remove Member</button>
          </div>
        )}

        {showInvoice && canEdit && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="field-grid">
              <div><label className="field-label">Amount (KES)</label><input className="input" type="number" value={invAmount} onChange={(e) => setInvAmount(e.target.value)} /></div>
              <div><label className="field-label">Description</label><input className="input" value={invDesc} onChange={(e) => setInvDesc(e.target.value)} /></div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={issueInvoice} disabled={busy}>Issue Invoice</button>
          </div>
        )}

        <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: 10 }}>Member Statement</h4>
        {tx.length === 0 ? <p style={{ fontSize: 13, color: 'var(--muted)' }}>No transactions yet.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
            {tx.map((t) => (
              <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, borderBottom: '1px solid #f0f0f2', paddingBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{t.description}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 11.5 }}>{t.date} · <span className={`badge ${t.type === 'invoice' ? 'badge-invoice' : 'badge-paid'}`}>{t.type}</span></div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700 }}>KES {t.amount.toLocaleString()}</div>
                  {canEdit && t.type === 'invoice' && t.status === 'pending' && (
                    <button className="btn btn-primary btn-sm" style={{ marginTop: 4 }} onClick={() => markPaid(t.id)} disabled={busy}>Mark Paid</button>
                  )}
                  {t.status === 'paid' && <span className="badge badge-paid">paid</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
