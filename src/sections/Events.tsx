import { useEffect, useState } from 'react';
import { api } from '../local-client';
import type { EventItem, Member, Participation } from '../types';

export default function Events({ canEdit }: { canEdit: boolean }) {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Record<string, Participation[]>>({});
  const [selectMember, setSelectMember] = useState('');

  const load = async () => {
    const [er, mr] = await Promise.all([api.get('/api/admin/events'), api.get('/api/admin/members')]);
    setEvents(er.data.items || []);
    setMembers(mr.data.items || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggle = async (id: string) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!participants[id]) {
      const r = await api.get(`/api/admin/events/${id}/participants`);
      setParticipants((p) => ({ ...p, [id]: r.data.items || [] }));
    }
  };

  const register = async (eventId: string) => {
    if (!selectMember) return;
    await api.post(`/api/admin/events/${eventId}/participants`, { memberId: selectMember });
    const r = await api.get(`/api/admin/events/${eventId}/participants`);
    setParticipants((p) => ({ ...p, [eventId]: r.data.items || [] }));
    setSelectMember('');
  };

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">Events</div>
          <div className="page-sub">Schedule activities and track participation</div>
        </div>
        {canEdit && <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Schedule Event</button>}
      </div>

      {loading ? <div className="empty-state">Loading…</div> : events.length === 0 ? <div className="empty-state">No events scheduled yet.</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {events.map((ev) => (
            <div className="card" key={ev.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => toggle(ev.id)}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{ev.title}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 13 }}>{ev.date} {ev.location ? `· ${ev.location}` : ''}</div>
                </div>
                <span style={{ color: 'var(--accent)', fontSize: 12.5, fontWeight: 600 }}>{expanded === ev.id ? 'Hide' : 'Manage'} →</span>
              </div>
              {expanded === ev.id && (
                <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                  {ev.description && <p style={{ fontSize: 13.5, color: 'var(--muted)', marginBottom: 14 }}>{ev.description}</p>}
                  {canEdit && (
                    <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                      <select className="input" style={{ maxWidth: 260 }} value={selectMember} onChange={(e) => setSelectMember(e.target.value)}>
                        <option value="">Select member to register…</option>
                        {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                      <button className="btn btn-secondary btn-sm" onClick={() => register(ev.id)}>Register</button>
                    </div>
                  )}
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Participants ({(participants[ev.id] || []).length})</div>
                  {(participants[ev.id] || []).length === 0 ? <p style={{ fontSize: 13, color: 'var(--muted)' }}>No participants registered.</p> : (
                    <div className="chip-row">
                      {(participants[ev.id] || []).map((p) => <span key={p.id} className="chip">{p.memberName}</span>)}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showAdd && <AddEventModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />}
    </div>
  );
}

function AddEventModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ title: '', date: '', location: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.title.trim() || !form.date) { setErr('Title and date are required.'); return; }
    setSaving(true);
    try {
      await api.post('/api/admin/events', form);
      onSaved();
    } catch {
      setErr('Could not save event.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Schedule Event</div>
        <div className="field"><label className="field-label">Title *</label><input className="input" value={form.title} onChange={(e) => set('title', e.target.value)} /></div>
        <div className="field-grid">
          <div><label className="field-label">Date *</label><input type="date" className="input" value={form.date} onChange={(e) => set('date', e.target.value)} /></div>
          <div><label className="field-label">Location</label><input className="input" value={form.location} onChange={(e) => set('location', e.target.value)} /></div>
        </div>
        <div className="field"><label className="field-label">Description</label><textarea className="input" rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} /></div>
        {err && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{err}</p>}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Schedule'}</button>
        </div>
      </div>
    </div>
  );
}
