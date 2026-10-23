import { useEffect, useState } from 'react';
import { api } from '../local-client';
import { Users, UserCheck, AlertTriangle, Wallet, FileClock, CalendarDays } from 'lucide-react';

interface Summary {
  totalMembers: number;
  byBranch: Record<string, number>;
  byStatus: Record<string, number>;
  revenueCollected: number;
  pendingInvoicesAmount: number;
  overdueCount: number;
  upcomingEvents: number;
}

export default function Dashboard() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/admin/reports/summary').then((r) => setSummary(r.data)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="empty-state">Loading dashboard…</div>;
  if (!summary) return <div className="empty-state">Could not load dashboard.</div>;

  const branchEntries = Object.entries(summary.byBranch);
  const maxBranch = Math.max(1, ...branchEntries.map(([, v]) => v));

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">Dashboard</div>
          <div className="page-sub">Real-time membership overview</div>
        </div>
      </div>

      <div className="stat-grid">
        {[
          { icon: Users, tone: '', value: summary.totalMembers, label: 'Total Members' },
          { icon: UserCheck, tone: 'green', value: summary.byStatus.active || 0, label: 'Active' },
          { icon: AlertTriangle, tone: 'red', value: summary.overdueCount, label: 'Overdue Subscriptions' },
          { icon: Wallet, tone: 'gold', value: `KES ${summary.revenueCollected.toLocaleString()}`, label: 'Revenue Collected' },
          { icon: FileClock, tone: 'amber', value: `KES ${summary.pendingInvoicesAmount.toLocaleString()}`, label: 'Pending Invoices' },
          { icon: CalendarDays, tone: '', value: summary.upcomingEvents, label: 'Upcoming Events' },
        ].map((s) => (
          <div className="stat-card" key={s.label}>
            <div className={`stat-icon ${s.tone}`}><s.icon size={19} /></div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Membership by Branch</h3>
        {branchEntries.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13.5 }}>No members yet.</p>}
        {branchEntries.map(([branch, count]) => (
          <div className="branch-bar-row" key={branch}>
            <div style={{ width: 120, fontSize: 13, fontWeight: 500 }}>{branch}</div>
            <div className="branch-bar-track"><div className="branch-bar-fill" style={{ width: `${(count / maxBranch) * 100}%` }} /></div>
            <div style={{ width: 30, fontSize: 13, color: 'var(--muted)', textAlign: 'right' }}>{count}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
