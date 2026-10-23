import { useEffect, useState } from 'react';
import { api } from '../local-client';
import type { Transaction } from '../types';

export default function Transactions({ canEdit }: { canEdit: boolean }) {
  const [items, setItems] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'paid'>('all');

  const load = async () => {
    const r = await api.get('/api/admin/transactions');
    setItems(r.data.items || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const markPaid = async (id: string) => {
    await api.post(`/api/admin/transactions/${id}/pay`, {});
    await load();
  };

  const filtered = items.filter((t) => (filter === 'all' ? true : t.type === 'invoice' ? t.status === filter : filter === 'paid'));

  const totalPaid = items.filter((t) => t.status === 'paid').reduce((s, t) => s + t.amount, 0);
  const totalPending = items.filter((t) => t.type === 'invoice' && t.status === 'pending').reduce((s, t) => s + t.amount, 0);

  const downloadCsv = async () => {
    const r = await api.get('/api/admin/export/transactions.csv');
    const blob = new Blob([r.data.csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'kgga-transactions.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">Invoices & Receipts</div>
          <div className="page-sub">Ledger of member subscription billing</div>
        </div>
        <button className="btn btn-secondary" onClick={downloadCsv}>Export for Accounting (CSV)</button>
      </div>

      {!canEdit && <div className="card" style={{ marginBottom: 16, padding: '12px 18px', fontSize: 13.5, color: 'var(--muted)' }}>You have view-only access to this ledger.</div>}

      <div className="stat-grid">
        <div className="stat-card"><div className="stat-value">KES {totalPaid.toLocaleString()}</div><div className="stat-label">Total Collected</div></div>
        <div className="stat-card"><div className="stat-value">KES {totalPending.toLocaleString()}</div><div className="stat-label">Pending Invoices</div></div>
      </div>

      <div className="chip-row" style={{ marginBottom: 16 }}>
        {(['all', 'pending', 'paid'] as const).map((f) => (
          <button key={f} className={`chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</button>
        ))}
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? <div className="empty-state">Loading…</div> : filtered.length === 0 ? <div className="empty-state">No transactions found.</div> : (
          <table className="data-table">
            <thead><tr><th>Member</th><th>Type</th><th>Description</th><th>Date</th><th>Amount</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 600 }}>{t.memberName}</td>
                  <td><span className={`badge ${t.type === 'invoice' ? 'badge-invoice' : 'badge-paid'}`}>{t.type}</span></td>
                  <td>{t.description}</td>
                  <td>{t.date}</td>
                  <td>KES {t.amount.toLocaleString()}</td>
                  <td><span className={`badge ${t.status === 'paid' ? 'badge-paid' : 'badge-pending'}`}>{t.status}</span></td>
                  <td>{canEdit && t.type === 'invoice' && t.status === 'pending' && <button className="btn btn-primary btn-sm" onClick={() => markPaid(t.id)}>Mark Paid</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
