import { useRef, useState } from 'react';
import { ImagePlus, Trash2, Save } from 'lucide-react';
import { api } from '../local-client';
import { useBranding } from '../branding';

const MAX_SIDE = 256;
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

// Downscale raster logos so the stored data URL stays small.
async function prepareLogo(file: File): Promise<string> {
  const dataUrl = await readAsDataUrl(file);
  if (file.type === 'image/svg+xml') return dataUrl;
  const img = new Image();
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('Invalid image')); img.src = dataUrl; });
  const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

export default function Settings() {
  const { branding, setBranding } = useBranding();
  const [orgName, setOrgName] = useState(branding.orgName);
  const [tagline, setTagline] = useState(branding.tagline);
  const [logo, setLogo] = useState(branding.logo);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty = orgName !== branding.orgName || tagline !== branding.tagline || logo !== branding.logo;

  const onFile = async (file?: File) => {
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) { setMsg({ ok: false, text: 'Please choose a PNG, JPEG, WebP or SVG image.' }); return; }
    if (file.size > 2 * 1024 * 1024) { setMsg({ ok: false, text: 'Image is too large. Please choose a file under 2 MB.' }); return; }
    try {
      setLogo(await prepareLogo(file));
      setMsg(null);
    } catch {
      setMsg({ ok: false, text: 'Could not process that image.' });
    }
  };

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const r = await api.put('/api/admin/branding', { orgName, tagline, logo });
      setBranding(r.data);
      setMsg({ ok: true, text: 'Branding saved.' });
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || 'Could not save changes.' });
    } finally { setSaving(false); }
  };

  return (
    <div>
      <div className="topbar">
        <div>
          <div className="page-title">Settings</div>
          <div className="page-sub">Organisation branding · Super Admin only</div>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={saving || !dirty}><Save size={15} /> {saving ? 'Saving…' : 'Save Changes'}</button>
      </div>

      {msg && <div className={msg.ok ? 'notice notice-ok' : 'notice notice-err'}>{msg.text}</div>}

      <div className="settings-grid">
        <div className="card">
          <div className="section-title">Logo</div>
          <div className="logo-uploader">
            <div className={`logo-preview ${logo ? 'has-logo' : 'is-empty'}`}>
              {logo && <img src={logo} alt="Logo preview" />}
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 12px' }}>PNG, JPEG, WebP or SVG. A square image on a transparent background works best.</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}><ImagePlus size={14} /> {logo ? 'Replace' : 'Upload logo'}</button>
                {logo && <button className="btn btn-danger btn-sm" onClick={() => setLogo('')}><Trash2 size={14} /> Remove</button>}
              </div>
              <input ref={fileRef} type="file" accept={ACCEPTED.join(',')} hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="section-title">Organisation</div>
          <div className="field"><label className="field-label">Name</label><input className="input" value={orgName} onChange={(e) => setOrgName(e.target.value)} maxLength={40} /></div>
          <div className="field"><label className="field-label">Tagline</label><input className="input" value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={80} /></div>
        </div>

        <div className="card settings-preview">
          <div className="section-title">Preview</div>
          <div className="preview-sidebar">
            <div className="brand" style={{ border: 'none', margin: 0, padding: 0 }}>
              <div className={`brand-badge ${logo ? 'has-logo' : 'is-empty'}`}>{logo && <img src={logo} alt="" />}</div>
              <div><div className="brand-title">{orgName || 'KGGA'}</div><div className="brand-sub">Admin Portal</div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
