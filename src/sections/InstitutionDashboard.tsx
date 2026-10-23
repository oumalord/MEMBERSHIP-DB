import { useEffect, useState } from 'react';
import { api } from '../local-client';
import type { Member, Category } from '../types';

const DEFAULT_BRANCHES = ['Rainbow', 'Brownie', 'Girl Guide', 'Ranger Guide', 'Adult Leader'];
const UNIT_AGES = [
  { name: 'Rainbow', min: 5, max: 6 },
  { name: 'Brownie', min: 7, max: 9 },
  { name: 'Girl Guide', min: 10, max: 14 },
  { name: 'Ranger Guide', min: 15, max: 17 },
  { name: 'Adult Leader', min: 18, max: 120 },
];

export default function InstitutionDashboard() {
  const [tab, setTab] = useState<'members' | 'categories'>('members');
  const [members, setMembers] = useState<Member[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newCategory, setNewCategory] = useState('');

  const load = async () => {
    setLoading(true);
    const [mr, cr] = await Promise.all([api.get('/api/institution/members'), api.get('/api/institution/categories')]);
    setMembers(mr.data.items || []);
    setCategories(cr.data.items || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const addCategory = async () => {
    if (!newCategory.trim()) return;
    await api.post('/api/institution/categories', { name: newCategory.trim() });
    setNewCategory('');
    await load();
  };

  const removeCategory = async (id: string) => {
    await api.delete(`/api/institution/categories/${id}`);
    await load();
  };

  const removeMember = async (id: string) => {
    if (!confirm('Remove this student from your roster?')) return;
    await api.delete(`/api/institution/members/${id}`);
    await load();
  };

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">Institution Dashboard</div>
          <div className="page-sub">{members.length} registered students</div>
        </div>
        {tab === 'members' && <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add Student</button>}
      </div>

      <div className="chip-row" style={{ marginBottom: 20 }}>
        <button className={`chip ${tab === 'members' ? 'active' : ''}`} onClick={() => setTab('members')}>Students</button>
        <button className={`chip ${tab === 'categories' ? 'active' : ''}`} onClick={() => setTab('categories')}>Categories</button>
      </div>

      {tab === 'members' ? (
        <div className="card" style={{ padding: 0 }}>
          {loading ? <div className="empty-state">Loading…</div> : members.length === 0 ? <div className="empty-state">No students added yet.</div> : (
            <table className="data-table">
              <thead><tr><th>Name</th><th>Membership No.</th><th>Category</th><th>Region</th><th>Status</th><th>Subscription Expiry</th><th></th></tr></thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td style={{ fontWeight: 600 }}>{m.name}</td>
                    <td>{m.membershipNo || '—'}</td>
                    <td>{m.branch}</td>
                    <td>{m.region || '—'}</td>
                    <td><span className={`badge badge-${m.status}`}>{m.status}</span></td>
                    <td>{m.subscriptionExpiry}</td>
                    <td><button className="btn btn-danger btn-sm" onClick={() => removeMember(m.id)}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="card">
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input className="input" placeholder="New category name…" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
            <button className="btn btn-primary btn-sm" onClick={addCategory}>Add</button>
          </div>
          <div className="section-divider">Default Categories</div>
          <div className="chip-row" style={{ marginBottom: 16 }}>
            {DEFAULT_BRANCHES.map((b) => <span key={b} className="chip">{b}</span>)}
          </div>
          <div className="section-divider">Your Custom Categories</div>
          {categories.length === 0 ? <p style={{ fontSize: 13, color: 'var(--muted)' }}>No custom categories yet.</p> : (
            <div className="chip-row">
              {categories.map((c) => (
                <span key={c.id} className="chip" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {c.name}
                  <button onClick={() => removeCategory(c.id)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--danger)', fontWeight: 700 }}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {showAdd && <AddStudentModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
    </div>
  );
}

function AddStudentModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', dob: '', phone: '', email: '', region: '', guardianName: '', guardianPhone: '', membershipNo: '', interests: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const age = form.dob ? (() => {
    const birth = new Date(`${form.dob}T00:00:00`);
    if (Number.isNaN(birth.getTime())) return null;
    const now = new Date();
    let value = now.getFullYear() - birth.getFullYear();
    if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) value--;
    return value;
  })() : null;
  const unit = age === null ? 'Enter date of birth' : UNIT_AGES.find((u) => age >= u.min && age <= u.max)?.name || 'Not eligible for a unit';

  const submit = async () => {
    if (!form.name.trim()) { setErr('Student name is required.'); return; }
    setSaving(true); setErr('');
    try {
      await api.post('/api/institution/members', form);
      onSaved();
    } catch { setErr('Could not add student.'); } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Add Student</div>
        <div className="field"><label className="field-label">Full Name *</label><input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
        <div className="field-grid">
          <div><label className="field-label">Date of Birth *</label><input type="date" required max={new Date().toISOString().slice(0, 10)} className="input" value={form.dob} onChange={(e) => set('dob', e.target.value)} /></div>
          <div><label className="field-label">Guide unit (assigned by age)</label><input className="input" readOnly value={unit} /></div>
        </div>
        <div className="field-grid">
          <div><label className="field-label">Membership No.</label><input className="input" value={form.membershipNo} onChange={(e) => set('membershipNo', e.target.value)} /></div>
          <div><label className="field-label">Region / County</label><input className="input" value={form.region} onChange={(e) => set('region', e.target.value)} /></div>
        </div>
        <div className="field-grid">
          <div><label className="field-label">Guardian Name</label><input className="input" value={form.guardianName} onChange={(e) => set('guardianName', e.target.value)} /></div>
          <div><label className="field-label">Guardian Phone</label><input className="input" value={form.guardianPhone} onChange={(e) => set('guardianPhone', e.target.value)} /></div>
        </div>
        <div className="field-grid">
          <div><label className="field-label">Phone</label><input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
          <div><label className="field-label">Email</label><input className="input" value={form.email} onChange={(e) => set('email', e.target.value)} /></div>
        </div>
        <div className="field"><label className="field-label">Interests / Hobbies</label><input className="input" value={form.interests} onChange={(e) => set('interests', e.target.value)} /></div>
        {err && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{err}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Add Student'}</button>
        </div>
      </div>
    </div>
  );
}
