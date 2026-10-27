import { useEffect, useState } from 'react';
import { api } from '../local-client';
import type { Communication } from '../types';

export default function Notices({ refreshKey = 0 }: { refreshKey?: number }) {
  const [notices, setNotices] = useState<Communication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/notices').then((r) => setNotices(r.data.items || [])).catch(() => setNotices([])).finally(() => setLoading(false));
  }, [refreshKey]);

  return (
    <section>
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Notices</h3>
      {loading ? <div className="empty-state">Loading…</div> : notices.length === 0 ? (
        <div className="card empty-state">No notices posted.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {notices.map((notice) => (
            <article className="card" key={notice.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                <strong>{notice.subject}</strong>
                <time style={{ color: 'var(--muted)', fontSize: 12.5, whiteSpace: 'nowrap' }}>{notice.date}</time>
              </div>
              <p style={{ color: 'var(--muted)', fontSize: 13.5, whiteSpace: 'pre-wrap' }}>{notice.body}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}