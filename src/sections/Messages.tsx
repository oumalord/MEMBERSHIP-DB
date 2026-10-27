import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { api } from '../local-client';
import type { Communication } from '../types';
import { MEMBERSHIP_CATEGORY_NAMES } from '../../membership-categories';
import { downloadCsv } from '../csv';
import Notices from './Notices';

const BRANCHES = MEMBERSHIP_CATEGORY_NAMES;

export default function Messages({ canEdit, isSuperAdmin }: { canEdit: boolean; isSuperAdmin: boolean }) {
  const [items, setItems] = useState<Communication[]>([]);
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState('all');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [noticeTitle, setNoticeTitle] = useState('');
  const [noticeBody, setNoticeBody] = useState('');
  const [publishingNotice, setPublishingNotice] = useState(false);
  const [noticeRefresh, setNoticeRefresh] = useState(0);
  const [publishFeedback, setPublishFeedback] = useState('');

  const load = async () => {
    const r = await api.get('/api/admin/messages');
    setItems(r.data.items || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const exportMessages = () => downloadCsv('kgga-message-history.csv', [
    { label: 'Subject', value: (message: Communication) => message.subject || '(Renewal Reminder)' },
    { label: 'Audience', value: (message: Communication) => message.audience },
    { label: 'Recipients', value: (message: Communication) => message.recipientCount },
    { label: 'Date', value: (message: Communication) => message.date },
  ], items);

  const send = async () => {
    if (!subject.trim() || !body.trim()) return;
    setSending(true);
    const r = await api.post('/api/admin/messages/bulk', { subject, body, audience });
    setNotice(`Message queued to ${r.data.recipientCount} member(s).`);
    setSubject(''); setBody('');
    await load();
    setSending(false);
    setTimeout(() => setNotice(''), 5000);
  };

  const publishNotice = async () => {
    if (!noticeTitle.trim() || !noticeBody.trim()) return;
    setPublishingNotice(true);
    setPublishFeedback('');
    try {
      await api.post('/api/admin/notices', { subject: noticeTitle, body: noticeBody });
      setNoticeTitle('');
      setNoticeBody('');
      setNoticeRefresh((value) => value + 1);
      setPublishFeedback('Notice published to all members and admins.');
    } catch (error: any) {
      setPublishFeedback(error?.response?.data?.error || 'Could not publish notice.');
    } finally {
      setPublishingNotice(false);
    }
  };

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">Bulk Messages</div>
          <div className="page-sub">Send updates and reminders to your members</div>
        </div>
        <button className="btn btn-secondary" onClick={exportMessages} disabled={loading || items.length === 0}><Download size={15} /> Download History</button>
      </div>

      {isSuperAdmin && <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Publish Notice</h3>
        <div className="field"><label className="field-label">Title</label><input className="input" value={noticeTitle} onChange={(e) => setNoticeTitle(e.target.value)} /></div>
        <div className="field"><label className="field-label">Notice</label><textarea className="input" rows={3} value={noticeBody} onChange={(e) => setNoticeBody(e.target.value)} /></div>
        {publishFeedback && <p style={{ color: publishFeedback.startsWith('Could not') ? 'var(--danger)' : 'var(--accent)', fontSize: 13, marginBottom: 10 }}>{publishFeedback}</p>}
        <button className="btn btn-primary" onClick={publishNotice} disabled={publishingNotice || !noticeTitle.trim() || !noticeBody.trim()}>{publishingNotice ? 'Publishing…' : 'Publish to Everyone'}</button>
      </div>}

      <div style={{ marginBottom: 24 }}><Notices refreshKey={noticeRefresh} /></div>

      {canEdit ? (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="field"><label className="field-label">Audience</label>
            <select className="input" value={audience} onChange={(e) => setAudience(e.target.value)}>
              <option value="all">All Members</option>
              {BRANCHES.map((b) => <option key={b} value={`branch:${b}`}>{b} only</option>)}
              <option value="status:pending">Pending Members</option>
              <option value="status:suspended">Suspended Members</option>
            </select>
          </div>
          <div className="field"><label className="field-label">Subject</label><input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
          <div className="field"><label className="field-label">Message</label><textarea className="input" rows={4} value={body} onChange={(e) => setBody(e.target.value)} /></div>
          {notice && <p style={{ color: 'var(--accent)', fontSize: 13, marginBottom: 10 }}>{notice}</p>}
          <button className="btn btn-primary" onClick={send} disabled={sending}>{sending ? 'Sending…' : 'Send to Members'}</button>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 24, fontSize: 13.5, color: 'var(--muted)' }}>You have view-only access. Ask a Super Admin for editing rights to send messages.</div>
      )}

      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Message History</h3>
      <div className="card" style={{ padding: 0 }}>
        {loading ? <div className="empty-state">Loading…</div> : items.length === 0 ? <div className="empty-state">No messages sent yet.</div> : (
          <table className="data-table">
            <thead><tr><th>Subject</th><th>Audience</th><th>Recipients</th><th>Date</th></tr></thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id}>
                  <td style={{ fontWeight: 600 }}>{m.subject || '(Renewal Reminder)'}</td>
                  <td>{m.audience}</td>
                  <td>{m.recipientCount}</td>
                  <td>{m.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
