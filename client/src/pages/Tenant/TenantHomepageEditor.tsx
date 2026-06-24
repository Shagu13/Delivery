import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/useAuth';
import { getMyBranding, updateMyBranding } from '../../api/tenantBranding';
import { parseHomepage, emptyBlock } from '../../types/homepage';
import type { HomepageBlock, HomepageBlockType } from '../../types/homepage';
import { TenantHomePage } from './TenantHomePage';

const input: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--color-border)',
  background: 'var(--color-bg-3)', color: 'var(--color-text)', fontSize: '0.88rem', boxSizing: 'border-box',
};
const label: React.CSSProperties = { fontSize: '0.75rem', fontWeight: 600, marginBottom: 4, display: 'block', color: 'var(--color-text-subtle)' };
const iconBtn: React.CSSProperties = {
  padding: '3px 8px', borderRadius: 6, border: '1px solid var(--color-border)',
  background: 'var(--color-bg-2)', color: 'var(--color-text)', cursor: 'pointer', fontSize: '0.78rem',
};

export function TenantHomepageEditor() {
  const { token } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [logoUrl, setLogoUrl]         = useState('');
  const [primaryColor, setPrimaryColor] = useState('');
  const [sections, setSections]       = useState<HomepageBlock[]>([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [msg, setMsg]                 = useState<string | null>(null);
  const [err, setErr]                 = useState<string | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    getMyBranding(token)
      .then(b => {
        setDisplayName(b.displayName);
        setLogoUrl(b.logoUrl ?? '');
        setPrimaryColor(b.primaryColor ?? '');
        setSections(parseHomepage(b.homepageJson).sections);
      })
      .catch(() => setErr('Failed to load.'))
      .finally(() => setLoading(false));
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const addBlock = (type: HomepageBlockType) => setSections(s => [...s, emptyBlock(type)]);
  const removeBlock = (id: string) => setSections(s => s.filter(b => b.id !== id));
  const patchBlock = (id: string, patch: Partial<HomepageBlock>) =>
    setSections(s => s.map(b => (b.id === id ? { ...b, ...patch } as HomepageBlock : b)));
  const move = (id: string, dir: -1 | 1) => setSections(s => {
    const i = s.findIndex(b => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= s.length) return s;
    const copy = [...s];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    return copy;
  });

  const save = async () => {
    if (!token) return;
    setSaving(true); setMsg(null); setErr(null);
    try {
      await updateMyBranding(token, {
        displayName: displayName.trim(),
        logoUrl: logoUrl.trim() || null,
        primaryColor: primaryColor.trim() || null,
        homepageJson: JSON.stringify({ sections }),
      });
      setMsg('Saved. Changes are live on your homepage.');
    } catch {
      setErr('Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  // Primary color must be a 6-digit hex (e.g. #EFD22A). An invalid value (like a
  // 3- or 4-digit hex) is silently ignored by the browser, so flag it here.
  const trimmedColor = primaryColor.trim();
  const colorValid   = /^#?[0-9a-f]{6}$/i.test(trimmedColor);

  if (loading) return <div style={{ padding: 24, color: 'var(--color-text-subtle)' }}>Loading…</div>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 460px) 1fr', gap: 24, alignItems: 'start' }}>
      {/* ── Editor ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>Homepage</h2>
        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-subtle)' }}>
          Your storefront on your own domain. Edit the header, color, and content blocks; changes go live on save.{' '}
          <a href="/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)', fontWeight: 600 }}>
            Open my live homepage ↗
          </a>
        </p>

        <div className="content-card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div><span style={label}>Header name</span><input style={input} value={displayName} onChange={e => setDisplayName(e.target.value)} /></div>
          <div><span style={label}>Logo URL</span><input style={input} value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://…" /></div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}><span style={label}>Primary color (hex)</span><input style={input} value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} placeholder="#0F62FE" /></div>
            {trimmedColor && colorValid && <div style={{ width: 34, height: 34, borderRadius: 6, border: '1px solid var(--color-border)', background: trimmedColor }} />}
          </div>
          {trimmedColor && !colorValid && (
            <div style={{ color: '#ef4444', fontSize: '0.78rem' }}>
              Enter a 6-digit hex color, e.g. <code>#EFD22A</code>. “{trimmedColor}” is not valid and will be ignored.
            </div>
          )}
        </div>

        {/* Blocks */}
        {sections.map((b, i) => (
          <div key={b.id} className="content-card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-subtle)' }}>{b.type}</strong>
              <div style={{ display: 'flex', gap: 4 }}>
                <button style={iconBtn} disabled={i === 0} onClick={() => move(b.id, -1)}>↑</button>
                <button style={iconBtn} disabled={i === sections.length - 1} onClick={() => move(b.id, 1)}>↓</button>
                <button style={{ ...iconBtn, color: '#ef4444' }} onClick={() => removeBlock(b.id)}>✕</button>
              </div>
            </div>
            {b.type === 'hero' && <>
              <input style={input} placeholder="Title" value={b.title} onChange={e => patchBlock(b.id, { title: e.target.value })} />
              <input style={input} placeholder="Subtitle" value={b.subtitle} onChange={e => patchBlock(b.id, { subtitle: e.target.value })} />
              <input style={input} placeholder="Background image URL" value={b.imageUrl} onChange={e => patchBlock(b.id, { imageUrl: e.target.value })} />
            </>}
            {b.type === 'text' && <>
              <input style={input} placeholder="Heading" value={b.heading} onChange={e => patchBlock(b.id, { heading: e.target.value })} />
              <textarea style={{ ...input, minHeight: 90, resize: 'vertical' }} placeholder="Body text" value={b.body} onChange={e => patchBlock(b.id, { body: e.target.value })} />
            </>}
            {b.type === 'image' && <>
              <input style={input} placeholder="Image URL" value={b.imageUrl} onChange={e => patchBlock(b.id, { imageUrl: e.target.value })} />
              <input style={input} placeholder="Caption" value={b.caption} onChange={e => patchBlock(b.id, { caption: e.target.value })} />
            </>}
          </div>
        ))}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {(['hero', 'text', 'image'] as HomepageBlockType[]).map(t => (
            <button key={t} style={iconBtn} onClick={() => addBlock(t)}>+ {t}</button>
          ))}
        </div>

        {msg && <div style={{ color: '#059669', fontSize: '0.85rem' }}>{msg}</div>}
        {err && <div style={{ color: '#ef4444', fontSize: '0.85rem' }}>{err}</div>}
        <div><button className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save homepage'}</button></div>
      </div>

      {/* ── Live preview (draft color applied locally) ── */}
      <div style={{ position: 'sticky', top: 16 }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-subtle)', marginBottom: 8 }}>Preview</div>
        <div style={{
          border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden', background: 'var(--color-bg)',
          ...(colorValid ? ({ ['--color-accent' as string]: trimmedColor }) : {}),
        }}>
          <TenantHomePage brandName={displayName} sections={sections} />
        </div>
      </div>
    </div>
  );
}
