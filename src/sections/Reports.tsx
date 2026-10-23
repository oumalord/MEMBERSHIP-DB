import { useEffect, useState } from 'react';
import { api } from '../local-client';

interface Summary {
  totalMembers: number;
  byBranch: Record<string, number>;
  byStatus: Record<string, number>;
  byRegion: Record<string, number>;
  revenueCollected: number;
  pendingInvoicesAmount: number;
  overdueCount: number;
  upcomingEvents: number;
}

export default function Reports() {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => { api.get('/api/admin/reports/summary').then((r) => setSummary(r.data)); }, []);

  const downloadCsv = async () => {
    const r = await api.get('/api/admin/export/transactions.csv');
    const blob = new Blob([r.data.csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'kgga-transactions.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  if (!summary) return <div className="empty-state">Loading report…</div>;

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">Reports</div>
          <div className="page-sub">General real-time membership report</div>
        </div>
        <button className="btn btn-secondary" onClick={downloadCsv}>Export Ledger (CSV)</button>
      </div>

      <div className="stat-grid">
        <div className="stat-card"><div className="stat-value">{summary.totalMembers}</div><div className="stat-label">Total Members</div></div>
        <div className="stat-card"><div className="stat-value">{summary.byStatus.suspended || 0}</div><div className="stat-label">Suspended</div></div>
        <div className="stat-card"><div className="stat-value">{summary.byStatus.expelled || 0}</div><div className="stat-label">Expelled</div></div>
        <div className="stat-card"><div className="stat-value">{summary.upcomingEvents}</div><div className="stat-label">Upcoming Events</div></div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>By Branch</h3>
          {Object.entries(summary.byBranch).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, padding: '6px 0', borderBottom: '1px solid #f0f0f2' }}><span>{k}</span><span style={{ fontWeight: 600 }}>{v}</span></div>
          ))}
        </div>
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>By Region</h3>
          {Object.keys(summary.byRegion).length === 0 ? <p style={{ fontSize: 13, color: 'var(--muted)' }}>No region data yet.</p> : Object.entries(summary.byRegion).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, padding: '6px 0', borderBottom: '1px solid #f0f0f2' }}><span>{k}</span><span style={{ fontWeight: 600 }}>{v}</span></div>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginTop: 20, fontSize: 13, color: 'var(--muted)' }}>
        The CSV export mirrors the invoice and receipt ledger so it can be imported into your Finance accounting system.
      </div>
    </div>
  );
}
