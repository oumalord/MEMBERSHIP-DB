import { useEffect, useState } from 'react';
import { api } from '../local-client';
import type { Member, Transaction, Participation } from '../types';

export default function IndividualDashboard({ member, onUpdated }: { member: Member; onUpdated: (m: Member) => void }) {
  const [tx, setTx] = useState<Transaction[]>([]);
  const [participations, setParticipations] = useState<Participation[]>([]);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ phone: member.phone || '', email: member.email || '', region: member.region || '', guardianName: member.guardianName || '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/api/individual/transactions').then((r) => setTx(r.data.items || []));
    api.get('/api/individual/participations').then((r) => setParticipations(r.data.items || []));
  }, []);

  const save = async () => {
    setSaving(true);
    const r = await api.put('/api/individual/me', form);
    onUpdated(r.data);
    setEditing(false);
    setSaving(false);
  };

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">My Membership</div>
          <div className="page-sub">{member.branch} · <span className={`badge badge-${member.status}`}>{member.status}</span></div>
        </div>
        <button className="btn btn-secondary" onClick={() => setEditing((s) => !s)}>{editing ? 'Cancel' : 'Edit My Details'}</button>
      </div>

      {editing ? (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="field-grid">
            <div><label className="field-label">Phone</label><input className="input" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
            <div><label className="field-label">Email</label><input className="input" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
          </div>
          <div className="field-grid">
            <div><label className="field-label">Region / County</label><input className="input" value={form.region} onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))} /></div>
            <div><label className="field-label">Guardian Name</label><input className="input" value={form.guardianName} onChange={(e) => setForm((f) => ({ ...f, guardianName: e.target.value }))} /></div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
        </div>
      ) : (
        <div className="stat-grid">
          <div className="stat-card"><div className="stat-value">{member.subscriptionExpiry}</div><div className="stat-label">Subscription Expiry</div></div>
          <div className="stat-card"><div className="stat-value">{member.region || '—'}</div><div className="stat-label">Region</div></div>
          <div className="stat-card"><div className="stat-value">{member.phone || '—'}</div><div className="stat-label">Phone</div></div>
        </div>
      )}

      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>My Statement</h3>
      <div className="card" style={{ padding: 0, marginBottom: 24 }}>
        {tx.length === 0 ? <div className="empty-state">No invoices or receipts yet.</div> : (
          <table className="data-table">
            <thead><tr><th>Type</th><th>Description</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
              {tx.map((t) => (
                <tr key={t.id}>
                  <td><span className={`badge ${t.type === 'invoice' ? 'badge-invoice' : 'badge-paid'}`}>{t.type}</span></td>
                  <td>{t.description}</td>
                  <td>{t.date}</td>
                  <td>KES {t.amount.toLocaleString()}</td>
                  <td><span className={`badge ${t.status === 'paid' ? 'badge-paid' : 'badge-pending'}`}>{t.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>My Events</h3>
      <div className="card" style={{ padding: 0 }}>
        {participations.length === 0 ? <div className="empty-state">No event participation yet.</div> : (
          <table className="data-table">
            <thead><tr><th>Event</th><th>Date Registered</th></tr></thead>
            <tbody>
              {participations.map((p) => (
                <tr key={p.id}><td style={{ fontWeight: 600 }}>{p.eventTitle}</td><td>{p.date}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
