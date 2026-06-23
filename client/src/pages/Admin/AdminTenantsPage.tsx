import { useState, useEffect, useCallback } from 'react';
import { getTenants, createTenant, updateTenant, TenantApiError } from '../../api/tenants';
import type { Tenant } from '../../api/tenants';

type Mode = { kind: 'list' } | { kind: 'create' } | { kind: 'edit'; tenant: Tenant };

interface FormState {
  host: string; displayName: string; logoUrl: string; primaryColor: string; isActive: boolean;
  coAdminFirstName: string; coAdminLastName: string; coAdminEmail: string; coAdminPassword: string;
}
const EMPTY: FormState = {
  host: '', displayName: '', logoUrl: '', primaryColor: '', isActive: true,
  coAdminFirstName: '', coAdminLastName: '', coAdminEmail: '', coAdminPassword: '',
};

const input: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--color-border)',
  background: 'var(--color-bg-3)', color: 'var(--color-text)', fontSize: '0.88rem', boxSizing: 'border-box',
};
const label: React.CSSProperties = { fontSize: '0.78rem', fontWeight: 600, marginBottom: 4, display: 'block' };

export default function AdminTenantsPage({ token }: { token: string }) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode]       = useState<Mode>({ kind: 'list' });
  const [form, setForm]       = useState<FormState>(EMPTY);
  const [error, setError]     = useState<string | null>(null);
  const [saving, setSaving]   = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    getTenants(token).then(setTenants).catch(() => setError('Failed to load tenants.')).finally(() => setLoading(false));
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const startCreate = () => { setForm(EMPTY); setError(null); setMode({ kind: 'create' }); };
  const startEdit = (t: Tenant) => {
    setForm({ ...EMPTY, host: t.host, displayName: t.displayName, logoUrl: t.logoUrl ?? '', primaryColor: t.primaryColor ?? '', isActive: t.isActive });
    setError(null); setMode({ kind: 'edit', tenant: t });
  };
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const save = async () => {
    setSaving(true); setError(null);
    try {
      if (mode.kind === 'create') {
        await createTenant(token, {
          host: form.host.trim(), displayName: form.displayName.trim(),
          logoUrl: form.logoUrl.trim() || null, primaryColor: form.primaryColor.trim() || null,
          coAdminFirstName: form.coAdminFirstName.trim(), coAdminLastName: form.coAdminLastName.trim(),
          coAdminEmail: form.coAdminEmail.trim(), coAdminPassword: form.coAdminPassword,
        });
      } else if (mode.kind === 'edit') {
        await updateTenant(token, mode.tenant.id, {
          host: form.host.trim(), displayName: form.displayName.trim(),
          logoUrl: form.logoUrl.trim() || null, primaryColor: form.primaryColor.trim() || null,
          isActive: form.isActive,
        });
      }
      setMode({ kind: 'list' });
      load();
    } catch (e) {
      const msg = e instanceof TenantApiError && e.errors
        ? Object.values(e.errors).flat()[0]
        : e instanceof Error ? e.message : 'Failed to save.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  if (mode.kind !== 'list') {
    const isCreate = mode.kind === 'create';
    return (
      <div style={{ maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>{isCreate ? 'New tenant' : 'Edit tenant'}</h2>

        <div><span style={label}>Host (e.g. livoexpress.ge)</span><input style={input} value={form.host} onChange={set('host')} /></div>
        <div><span style={label}>Display name</span><input style={input} value={form.displayName} onChange={set('displayName')} /></div>
        <div><span style={label}>Logo URL (optional)</span><input style={input} value={form.logoUrl} onChange={set('logoUrl')} placeholder="https://…" /></div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}><span style={label}>Primary color (hex, optional)</span><input style={input} value={form.primaryColor} onChange={set('primaryColor')} placeholder="#0F62FE" /></div>
          {form.primaryColor.trim() && <div style={{ width: 34, height: 34, borderRadius: 6, border: '1px solid var(--color-border)', background: form.primaryColor.trim() }} />}
        </div>

        {isCreate && (
          <>
            <div style={{ height: 1, background: 'var(--color-border)', margin: '4px 0' }} />
            <p style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-subtle)', margin: 0 }}>Co-admin login</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}><span style={label}>First name</span><input style={input} value={form.coAdminFirstName} onChange={set('coAdminFirstName')} /></div>
              <div style={{ flex: 1 }}><span style={label}>Last name</span><input style={input} value={form.coAdminLastName} onChange={set('coAdminLastName')} /></div>
            </div>
            <div><span style={label}>Email (login)</span><input style={input} type="email" value={form.coAdminEmail} onChange={set('coAdminEmail')} /></div>
            <div><span style={label}>Password</span><input style={input} type="password" value={form.coAdminPassword} onChange={set('coAdminPassword')} /></div>
          </>
        )}

        {!isCreate && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={form.isActive} onChange={set('isActive')} /> Active
          </label>
        )}

        {error && <div style={{ color: '#ef4444', fontSize: '0.85rem' }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving…' : isCreate ? 'Create tenant' : 'Save'}</button>
          <button className="btn-ghost" disabled={saving} onClick={() => setMode({ kind: 'list' })}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 760 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>Tenants</h2>
          <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--color-text-subtle)' }}>White-label brands and their co-admin logins.</p>
        </div>
        <button className="btn-primary" onClick={startCreate}>+ New tenant</button>
      </div>

      {error && <div style={{ color: '#ef4444', fontSize: '0.85rem' }}>{error}</div>}

      {loading ? (
        <div style={{ padding: 24, color: 'var(--color-text-subtle)' }}>Loading…</div>
      ) : tenants.length === 0 ? (
        <div style={{ padding: 24, color: 'var(--color-text-subtle)', fontSize: '0.9rem' }}>No tenants yet.</div>
      ) : (
        <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg-2)' }}>
                {['Brand', 'Host', 'Color', 'Active', ''].map((h, i) => (
                  <th key={h} style={{ padding: '9px 12px', textAlign: i === 4 ? 'right' : 'left', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-subtle)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenants.map(t => (
                <tr key={t.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '9px 12px', fontWeight: 600 }}>{t.displayName}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--color-text-subtle)' }}>{t.host}</td>
                  <td style={{ padding: '9px 12px' }}>
                    {t.primaryColor ? <span style={{ display: 'inline-block', width: 18, height: 18, borderRadius: 4, border: '1px solid var(--color-border)', background: t.primaryColor, verticalAlign: 'middle' }} /> : '—'}
                  </td>
                  <td style={{ padding: '9px 12px' }}>{t.isActive ? '✓' : '✗'}</td>
                  <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                    <button className="btn-ghost btn-ghost--sm" onClick={() => startEdit(t)}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
