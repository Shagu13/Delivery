import { useEffect, useState } from 'react';
import { getCustomers, type AdminCustomer } from '../../api/customers';
import {
  type PartnerApiKey,
  type PartnerWebhook,
  type IssuedApiKey,
  getPartnerApiKeys,
  issuePartnerApiKey,
  revokePartnerApiKey,
  getPartnerWebhooks,
  createPartnerWebhook,
  deletePartnerWebhook,
} from '../../api/partners';

interface Props { token: string; }

// ── Small UI helpers ────────────────────────────────────────────────────────────
const INPUT: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '0.45rem 0.65rem', borderRadius: 7,
  border: '1px solid var(--color-border)', fontSize: '0.88rem',
  background: 'var(--color-bg)', color: 'var(--color-text)',
};

const BTN_PRIMARY: React.CSSProperties = {
  padding: '0.45rem 1rem', borderRadius: 8, background: 'var(--color-accent, #c47f17)',
  color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem',
};

const DROPDOWN_ITEM: React.CSSProperties = {
  padding: '0.55rem 0.8rem', cursor: 'pointer', fontSize: '0.85rem',
  borderBottom: '1px solid var(--color-border)',
};

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode; }) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--color-bg)', borderRadius: 12, padding: '1.5rem', width: 460, maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: 'var(--color-text-subtle)' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-subtle)', marginBottom: 4 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <code style={{ flex: 1, padding: '0.5rem 0.65rem', borderRadius: 7, background: 'var(--color-bg-3)', border: '1px solid var(--color-border)', fontFamily: 'Courier New, monospace', fontSize: '0.8rem', wordBreak: 'break-all' }}>{value}</code>
        <button onClick={copy} style={{ ...BTN_PRIMARY, padding: '0 0.8rem', whiteSpace: 'nowrap' }}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AdminPartnersPage({ token }: Props) {
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [keys, setKeys] = useState<PartnerApiKey[]>([]);
  const [webhooks, setWebhooks] = useState<PartnerWebhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // "Show once" secrets returned on creation.
  const [issuedKey, setIssuedKey] = useState<IssuedApiKey | null>(null);
  const [createdWebhook, setCreatedWebhook] = useState<PartnerWebhook | null>(null);

  const [showKeyModal, setShowKeyModal] = useState(false);
  const [showWebhookModal, setShowWebhookModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getCustomers(token, 1, 200).then(r => r.items).catch(() => [] as AdminCustomer[]),
      getPartnerApiKeys(token).catch(() => [] as PartnerApiKey[]),
      getPartnerWebhooks(token).catch(() => [] as PartnerWebhook[]),
    ]).then(([cs, ks, ws]) => {
      if (cancelled) return;
      setCustomers(cs);
      setKeys(ks);
      setWebhooks(ws);
      setLoading(false);
    }).catch(() => { if (!cancelled) { setError('Failed to load partner data.'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [token]);

  const filteredCustomers = search.trim()
    ? customers.filter(c => c.businessName.toLowerCase().includes(search.trim().toLowerCase()))
    : customers;

  const visibleKeys = selectedCustomerId ? keys.filter(k => k.customerId === selectedCustomerId) : keys;
  const visibleWebhooks = selectedCustomerId ? webhooks.filter(w => w.customerId === selectedCustomerId) : webhooks;
  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

  async function handleRevokeKey(id: string) {
    if (!window.confirm('Revoke this API key? The partner will immediately lose access.')) return;
    try {
      await revokePartnerApiKey(id, token);
      setKeys(prev => prev.map(k => k.id === id ? { ...k, isActive: false, revokedAt: new Date().toISOString() } : k));
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to revoke key.'); }
  }

  async function handleDeleteWebhook(id: string) {
    if (!window.confirm('Deactivate this webhook? Status updates will stop being sent.')) return;
    try {
      await deletePartnerWebhook(id, token);
      setWebhooks(prev => prev.map(w => w.id === id ? { ...w, isActive: false } : w));
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to delete webhook.'); }
  }

  return (
    <div style={{ padding: '0 0 2rem' }}>
      <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--color-text-subtle)' }}>
        Issue API keys and webhooks so partner businesses can place orders into the system and receive status updates.
      </p>

      {/* Partner selector — typable search by business name */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-subtle)' }}>Partner (Customer):</label>
        <div style={{ position: 'relative', width: 320, maxWidth: '100%' }}>
          <input
            style={INPUT}
            value={search}
            placeholder="Type a business name…"
            onChange={e => {
              setSearch(e.target.value);
              setShowDropdown(true);
              if (selectedCustomerId) setSelectedCustomerId('');
            }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
          />
          {selectedCustomerId && (
            <button
              onClick={() => { setSelectedCustomerId(''); setSearch(''); }}
              title="Clear selection"
              style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-subtle)', fontSize: '0.9rem' }}
            >✕</button>
          )}
          {showDropdown && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 4, maxHeight: 260, overflowY: 'auto', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}>
              <div onMouseDown={() => { setSelectedCustomerId(''); setSearch(''); setShowDropdown(false); }} style={DROPDOWN_ITEM}>
                — All partners —
              </div>
              {filteredCustomers.length === 0 ? (
                <div style={{ padding: '0.6rem 0.8rem', fontSize: '0.82rem', color: 'var(--color-text-subtle)' }}>No matches.</div>
              ) : filteredCustomers.map(c => (
                <div key={c.id} onMouseDown={() => { setSelectedCustomerId(c.id); setSearch(c.businessName); setShowDropdown(false); }} style={DROPDOWN_ITEM}>
                  {c.businessName} <span style={{ color: 'var(--color-text-subtle)' }}>— {c.firstName} {c.lastName}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div style={{ padding: '0.7rem 1rem', borderRadius: 8, background: '#fee2e2', color: '#991b1b', fontSize: '0.85rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-subtle)' }}>
          <div className="go-spinner" style={{ margin: '0 auto 0.5rem' }} /> Loading…
        </div>
      ) : (
        <>
          {/* ── API KEYS ─────────────────────────────────────────────── */}
          <section style={{ marginBottom: '2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem' }}>API Keys</h3>
              <button
                onClick={() => selectedCustomerId ? setShowKeyModal(true) : setError('Select a partner first to generate a key.')}
                style={{ ...BTN_PRIMARY, opacity: selectedCustomerId ? 1 : 0.55 }}
              >
                + Generate key
              </button>
            </div>

            {visibleKeys.length === 0 ? (
              <EmptyRow text="No API keys yet." />
            ) : (
              <Table headers={['Partner', 'Name', 'Key', 'Status', 'Last used', '']}>
                {visibleKeys.map(k => (
                  <tr key={k.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <Td>{k.customerBusinessName}</Td>
                    <Td>{k.name}</Td>
                    <Td><code style={{ fontFamily: 'Courier New, monospace', fontSize: '0.78rem' }}>{k.keyPrefix}…</code></Td>
                    <Td><StatusPill active={k.isActive} activeLabel="Active" inactiveLabel="Revoked" /></Td>
                    <Td>{k.lastUsedAt ? formatDate(k.lastUsedAt) : <Dim>never</Dim>}</Td>
                    <Td>
                      {k.isActive && (
                        <button onClick={() => handleRevokeKey(k.id)} style={revokeBtn}>Revoke</button>
                      )}
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </section>

          {/* ── WEBHOOKS ─────────────────────────────────────────────── */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem' }}>Webhooks</h3>
              <button
                onClick={() => selectedCustomerId ? setShowWebhookModal(true) : setError('Select a partner first to add a webhook.')}
                style={{ ...BTN_PRIMARY, opacity: selectedCustomerId ? 1 : 0.55 }}
              >
                + Add webhook
              </button>
            </div>

            {visibleWebhooks.length === 0 ? (
              <EmptyRow text="No webhooks yet." />
            ) : (
              <Table headers={['Partner', 'URL', 'Secret', 'Status', 'Created', '']}>
                {visibleWebhooks.map(w => (
                  <tr key={w.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <Td>{w.customerBusinessName}</Td>
                    <Td><code style={{ fontFamily: 'Courier New, monospace', fontSize: '0.78rem', wordBreak: 'break-all' }}>{w.url}</code></Td>
                    <Td><WebhookSecretCell secret={w.secret} /></Td>
                    <Td><StatusPill active={w.isActive} activeLabel="Active" inactiveLabel="Inactive" /></Td>
                    <Td>{formatDate(w.createdAt)}</Td>
                    <Td>
                      {w.isActive && (
                        <button onClick={() => handleDeleteWebhook(w.id)} style={revokeBtn}>Delete</button>
                      )}
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </section>
        </>
      )}

      {/* ── Generate-key modal ─────────────────────────────────────── */}
      {showKeyModal && selectedCustomer && (
        <GenerateKeyModal
          token={token}
          customer={selectedCustomer}
          onClose={() => setShowKeyModal(false)}
          onIssued={(issued, listRow) => {
            setKeys(prev => [listRow, ...prev]);
            setIssuedKey(issued);
            setShowKeyModal(false);
          }}
        />
      )}

      {/* ── Add-webhook modal ──────────────────────────────────────── */}
      {showWebhookModal && selectedCustomer && (
        <AddWebhookModal
          token={token}
          customer={selectedCustomer}
          onClose={() => setShowWebhookModal(false)}
          onCreated={(wh) => {
            setWebhooks(prev => [wh, ...prev]);
            setCreatedWebhook(wh);
            setShowWebhookModal(false);
          }}
        />
      )}

      {/* ── "Show once" secret reveals ─────────────────────────────── */}
      {issuedKey && (
        <Modal title="API key created" onClose={() => setIssuedKey(null)}>
          <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--color-text-subtle)' }}>
            Copy this key now and send it to the partner — it cannot be shown again. If lost, revoke it and issue a new one.
          </p>
          <CopyField label="API key" value={issuedKey.apiKey} />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => setIssuedKey(null)} style={BTN_PRIMARY}>Done</button>
          </div>
        </Modal>
      )}

      {createdWebhook && (
        <Modal title="Webhook created" onClose={() => setCreatedWebhook(null)}>
          <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--color-text-subtle)' }}>
            Share this signing secret with the partner so they can verify webhook signatures.
          </p>
          <CopyField label="Endpoint URL" value={createdWebhook.url} />
          <CopyField label="Signing secret" value={createdWebhook.secret} />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => setCreatedWebhook(null)} style={BTN_PRIMARY}>Done</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Modals ──────────────────────────────────────────────────────────────────────
function GenerateKeyModal({ token, customer, onClose, onIssued }: {
  token: string; customer: AdminCustomer;
  onClose: () => void;
  onIssued: (issued: IssuedApiKey, listRow: PartnerApiKey) => void;
}) {
  const [name, setName] = useState(`${customer.businessName} key`);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!name.trim()) { setError('Name is required.'); return; }
    setSubmitting(true); setError('');
    try {
      const issued = await issuePartnerApiKey({ customerId: customer.id, name: name.trim() }, token);
      const listRow: PartnerApiKey = {
        id: issued.id, customerId: issued.customerId, customerBusinessName: customer.businessName,
        name: issued.name, keyPrefix: issued.keyPrefix, isActive: true,
        createdAt: new Date().toISOString(), lastUsedAt: null, revokedAt: null,
      };
      onIssued(issued, listRow);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to create key.'); setSubmitting(false); }
  }

  return (
    <Modal title={`Generate API key — ${customer.businessName}`} onClose={onClose}>
      <div style={{ marginBottom: '0.9rem' }}>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Key name</label>
        <input style={INPUT} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. livo.ge production" maxLength={150} autoFocus />
      </div>
      {error && <p style={{ color: '#dc2626', fontSize: '0.82rem', margin: '0 0 0.75rem' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={ghostBtn}>Cancel</button>
        <button onClick={submit} disabled={submitting} style={{ ...BTN_PRIMARY, opacity: submitting ? 0.6 : 1 }}>
          {submitting ? 'Creating…' : 'Generate'}
        </button>
      </div>
    </Modal>
  );
}

function AddWebhookModal({ token, customer, onClose, onCreated }: {
  token: string; customer: AdminCustomer;
  onClose: () => void;
  onCreated: (wh: PartnerWebhook) => void;
}) {
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!/^https?:\/\/.+/i.test(url.trim())) { setError('Enter a valid http(s) URL.'); return; }
    setSubmitting(true); setError('');
    try {
      const wh = await createPartnerWebhook({ customerId: customer.id, url: url.trim() }, token);
      onCreated(wh);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to create webhook.'); setSubmitting(false); }
  }

  return (
    <Modal title={`Add webhook — ${customer.businessName}`} onClose={onClose}>
      <div style={{ marginBottom: '0.9rem' }}>
        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>Endpoint URL</label>
        <input style={INPUT} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://partner.ge/hooks/delivery" maxLength={500} autoFocus />
      </div>
      {error && <p style={{ color: '#dc2626', fontSize: '0.82rem', margin: '0 0 0.75rem' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={ghostBtn}>Cancel</button>
        <button onClick={submit} disabled={submitting} style={{ ...BTN_PRIMARY, opacity: submitting ? 0.6 : 1 }}>
          {submitting ? 'Creating…' : 'Add webhook'}
        </button>
      </div>
    </Modal>
  );
}

// ── Tiny presentational helpers ───────────────────────────────────────────────────
const ghostBtn: React.CSSProperties = {
  padding: '0.4rem 0.9rem', borderRadius: 7, background: 'var(--color-bg-3)',
  border: '1px solid var(--color-border)', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--color-text)',
};
const revokeBtn: React.CSSProperties = {
  padding: '4px 12px', borderRadius: 6, background: '#fee2e2', border: '1px solid #fecaca',
  color: '#dc2626', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
};
const miniBtn: React.CSSProperties = {
  padding: '3px 9px', borderRadius: 6, background: 'var(--color-bg-3)', border: '1px solid var(--color-border)',
  color: 'var(--color-text)', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
};

// Reveal / copy a webhook's signing secret on demand (it's stored in clear so we can re-show it).
function WebhookSecretCell({ secret }: { secret: string }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(secret); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {shown ? (
        <>
          <code title={secret} style={{ fontFamily: 'Courier New, monospace', fontSize: '0.75rem', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{secret}</code>
          <button onClick={copy} style={miniBtn}>{copied ? 'Copied' : 'Copy'}</button>
          <button onClick={() => setShown(false)} style={miniBtn}>Hide</button>
        </>
      ) : (
        <>
          <span style={{ fontFamily: 'Courier New, monospace', fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>whsec_••••••</span>
          <button onClick={() => setShown(true)} style={miniBtn}>Reveal</button>
        </>
      )}
    </div>
  );
}

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 10 }}>
      <table style={{ width: '100%', minWidth: 620, borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ background: 'var(--color-bg-3)' }}>
            {headers.map(h => (
              <th key={h} style={{ padding: '0.6rem 1rem', textAlign: 'left', fontWeight: 700, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-subtle)', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: '0.7rem 1rem', verticalAlign: 'middle' }}>{children}</td>;
}
function Dim({ children }: { children: React.ReactNode }) {
  return <span style={{ color: 'var(--color-text-subtle)', fontStyle: 'italic' }}>{children}</span>;
}
function EmptyRow({ text }: { text: string }) {
  return (
    <div style={{ padding: '1.5rem', textAlign: 'center', border: '2px dashed var(--color-border)', borderRadius: 10, color: 'var(--color-text-subtle)', fontSize: '0.85rem' }}>
      {text}
    </div>
  );
}
function StatusPill({ active, activeLabel, inactiveLabel }: { active: boolean; activeLabel: string; inactiveLabel: string }) {
  return (
    <span style={{
      display: 'inline-block', fontSize: '0.7rem', fontWeight: 700, padding: '2px 9px', borderRadius: 100,
      background: active ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
      color: active ? '#10b981' : '#ef4444',
    }}>{active ? activeLabel : inactiveLabel}</span>
  );
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
