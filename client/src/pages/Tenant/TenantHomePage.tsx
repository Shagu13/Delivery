import { Link } from 'react-router-dom';
import { useBranding } from '../../contexts/BrandingContext';
import { useLanguage } from '../../contexts/useLanguage';
import { parseHomepage } from '../../types/homepage';
import type { HomepageBlock } from '../../types/homepage';

/**
 * The tenant's white-label homepage skeleton. Renders the co-admin's content blocks
 * (hero / text / image), themed by the tenant's primary color (already applied to the
 * accent CSS vars by BrandingProvider). Falls back to a default hero when no blocks exist.
 *
 * Accepts optional overrides so the editor can render a live preview of an unsaved draft.
 */
export function TenantHomePage({ brandName, sections }: { brandName?: string; sections?: HomepageBlock[] }) {
  const branding = useBranding();
  const { t } = useLanguage();
  const name   = brandName ?? branding.brandName;
  const blocks = sections ?? parseHomepage(branding.homepageJson).sections;

  const ctas = (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
      <Link to="/register" className="btn-primary" style={{ padding: '12px 26px', fontSize: '0.95rem' }}>
        {t.createAccount}
      </Link>
      <Link to="/login" className="btn-ghost" style={{ padding: '12px 26px', fontSize: '0.95rem' }}>
        {t.loginSubmit}
      </Link>
    </div>
  );

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 20px 60px' }}>
      {blocks.length === 0 ? (
        // Default skeleton when the tenant hasn't authored anything yet.
        <section style={{ textAlign: 'center', padding: '80px 16px 48px' }}>
          <h1 style={{ fontSize: '2.6rem', fontWeight: 800, color: 'var(--color-text)', margin: '0 0 28px' }}>{name}</h1>
          {ctas}
        </section>
      ) : (
        blocks.map(b => <Block key={b.id} block={b} ctas={ctas} />)
      )}
    </div>
  );
}

function Block({ block, ctas }: { block: HomepageBlock; ctas: React.ReactNode }) {
  if (block.type === 'hero') {
    return (
      <section style={{
        position: 'relative', borderRadius: 18, overflow: 'hidden', margin: '32px 0',
        minHeight: 360, display: 'flex', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', padding: '56px 24px',
        background: block.imageUrl
          ? `linear-gradient(rgba(20,18,16,0.55), rgba(20,18,16,0.55)), url("${block.imageUrl}") center/cover no-repeat`
          : 'var(--color-bg-2)',
      }}>
        <div>
          {block.title && <h1 style={{ fontSize: '2.6rem', fontWeight: 800, color: block.imageUrl ? '#fff' : 'var(--color-text)', margin: '0 0 14px' }}>{block.title}</h1>}
          {block.subtitle && <p style={{ fontSize: '1.1rem', color: block.imageUrl ? 'rgba(255,255,255,0.9)' : 'var(--color-text-muted)', maxWidth: 620, margin: '0 auto 26px' }}>{block.subtitle}</p>}
          {ctas}
        </div>
      </section>
    );
  }
  if (block.type === 'text') {
    return (
      <section style={{ padding: '28px 0', maxWidth: 760, margin: '0 auto' }}>
        {block.heading && <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--color-text)', margin: '0 0 12px' }}>{block.heading}</h2>}
        {block.body && <p style={{ fontSize: '1rem', lineHeight: 1.7, color: 'var(--color-text-muted)', whiteSpace: 'pre-wrap', margin: 0 }}>{block.body}</p>}
      </section>
    );
  }
  // image
  return (
    <section style={{ padding: '20px 0', textAlign: 'center' }}>
      {block.imageUrl && <img src={block.imageUrl} alt={block.caption || ''} style={{ maxWidth: '100%', borderRadius: 14 }} />}
      {block.caption && <div style={{ fontSize: '0.85rem', color: 'var(--color-text-subtle)', marginTop: 8 }}>{block.caption}</div>}
    </section>
  );
}
