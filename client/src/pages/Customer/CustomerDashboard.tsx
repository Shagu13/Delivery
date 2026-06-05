import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/useAuth';
import { useLanguage } from '../../contexts/useLanguage';
import { FormField } from '../../components/ui/FormField';
import { CityDistrictPicker } from '../../components/ui/CityDistrictPicker';
import {
  getMyProfile, getMyOrders,
  updateMyProfile, changePassword,
  CustomerApiError,
} from '../../api/customers';
import type { Customer, CustomerGroupOrder } from '../../api/customers';
import { getStatusMeta } from '../../utils/statusMeta';
import { STATUS_COLORS } from '../../utils/statusColors';
import { PriceCalculatorCard } from '../Home/PriceCalculatorModal';
import { CustomerStatisticsPage } from './CustomerStatisticsPage';
import '../../styles/dashboard.css';


type View = 'overview' | 'shipments' | 'statistics' | 'profile' | 'password' | 'calculator';

// ── Status helpers ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const { lang } = useLanguage();
  const meta = getStatusMeta(status, lang);
  const [bg, color] = STATUS_COLORS[status] ?? ['rgba(107,114,128,0.12)', '#6b7280'];
  return (
    <span
      title={meta.description}
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 100,
        fontSize: '0.72rem',
        fontWeight: 700,
        background: bg,
        color,
        cursor: 'default',
      }}
    >
      {meta.short}
    </span>
  );
}

// ── Main dashboard ─────────────────────────────────────────────────────────────

export function CustomerDashboard() {
  const { user, token, signOut } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [view, setView] = useState<View>('overview');

  // shared state fetched once
  const [profile,  setProfile]  = useState<Customer | null>(null);
  const [orders,   setOrders]   = useState<CustomerGroupOrder[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!token) return;
    Promise.all([getMyProfile(token), getMyOrders(token)])
      .then(([p, o]) => { setProfile(p); setOrders(o); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const handleSignOut = () => { signOut(); navigate('/login', { replace: true }); };

  const initials = profile
    ? `${profile.firstName[0]}${profile.lastName[0]}`.toUpperCase()
    : (user ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase() : 'C');

  // Stats derived from orders
  const totalPackages  = orders.reduce((s, g) => s + g.numberOfPackages, 0);
  const delivered      = orders.filter(g => g.status === 'Delivered').length;
  const active         = orders.filter(g => !['Delivered','Cancelled'].includes(g.status)).length;

  return (
    <div className="dashboard">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar__logo">
          <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="6" fill="currentColor" />
            <path d="M7 14h14M7 9h8M7 19h10" stroke="var(--color-bg)" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Delivery
        </div>
        <span className="sidebar__role-badge">{t.custRoleBadge}</span>

        <div className="sidebar__divider" />
        <p className="sidebar__section-label">{t.custMyAccount}</p>

        <nav className="sidebar__nav">
          {([
            ['overview',    t.sidebarOverview,      overviewIcon],
            ['shipments',   t.custNavShipments,      shipmentsIcon],
            ['statistics',  t.navFinance,            statisticsIcon],
            ['calculator',  t.custNavCalculator,     calcIcon],
            ['profile',     t.custNavProfile,        profileIcon],
            ['password',    t.custNavPassword,       lockIcon],
          ] as [View, string, React.ReactNode][]).map(([v, label, icon]) => (
            <button
              key={v}
              className={`sidebar__link ${view === v ? 'sidebar__link--active' : ''}`}
              onClick={() => setView(v)}
            >
              {icon}{label}
            </button>
          ))}
        </nav>

          <div className="sidebar__footer">
          <div className="sidebar__user">
            <div className="sidebar__avatar">{initials}</div>
            <div className="sidebar__user-info">
              <div className="sidebar__user-name">
                {profile?.firstName ?? user?.firstName} {profile?.lastName ?? user?.lastName}
              </div>
              <div className="sidebar__user-handle">{profile?.email ?? user?.username}</div>
            </div>
          </div>
          <button className="sidebar__logout" onClick={handleSignOut}>
            {logoutIcon} {t.signOut}
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="dashboard__body">
        <div className="dashboard__topbar">
          <span className="dashboard__topbar-title">
            {view === 'overview'    && t.sidebarOverview}
            {view === 'shipments'   && t.custNavShipments}
            {view === 'statistics'  && t.navFinance}
            {view === 'calculator'  && t.custTopbarCalculator}
            {view === 'profile'     && t.custNavProfile}
            {view === 'password'    && t.custTopbarPassword}
          </span>
          {view === 'shipments' && (
            <a href="/send" className="btn-primary">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              {t.custNewShipment}
            </a>
          )}
        </div>

        <main className="dashboard__content">
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
              <div className="go-spinner" />
            </div>
          ) : (
            <>
              {view === 'overview'  && (
                <OverviewView
                  profile={profile}
                  totalPackages={totalPackages}
                  active={active}
                  delivered={delivered}
                  recentOrders={orders.slice(0, 3)}
                  onViewAll={() => setView('shipments')}
                />
              )}
              {view === 'shipments'   && <ShipmentsView orders={orders} />}
              {view === 'statistics'  && <CustomerStatisticsPage />}
              {view === 'calculator'  && token && <PriceCalculatorCard token={token} />}
              {view === 'profile'   && profile && token && (
                <EditProfileView
                  profile={profile}
                  token={token}
                  onSaved={updated => setProfile(updated)}
                />
              )}
              {view === 'password'  && token && (
                <ChangePasswordView token={token} />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────

function OverviewView({
  profile, totalPackages, active, delivered, recentOrders, onViewAll,
}: {
  profile: Customer | null;
  totalPackages: number; active: number; delivered: number;
  recentOrders: CustomerGroupOrder[];
  onViewAll: () => void;
}) {
  const { t } = useLanguage();
  return (
    <>
      <div className="stat-grid">
        {[
          { label: t.custStatTotalShipments, value: totalPackages, sub: t.custStatAllTime },
          { label: t.custStatActive,         value: active,        sub: t.custStatInTransit },
          { label: t.custStatDelivered,      value: delivered,     sub: t.custStatCompleted },
        ].map((s, i) => (
          <div className="stat-card" key={s.label} style={{ animationDelay: `${i * 60}ms` }}>
            <div className="stat-card__label">{s.label}</div>
            <div className="stat-card__value">{s.value}</div>
            <div className="stat-card__sub">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="content-card">
        <div className="content-card__header">
          <span className="content-card__title">
            {profile ? t.custWelcomeBack(profile.firstName) : t.custWelcomeBackAnon}
          </span>
          {recentOrders.length > 0 && (
            <button className="btn-ghost" onClick={onViewAll} style={{ fontSize: '0.8rem' }}>
              {t.custViewAll}
            </button>
          )}
        </div>

        {recentOrders.length === 0 ? (
          <div className="empty-state">
            <svg className="empty-state__icon" viewBox="0 0 40 40" fill="none">
              <path d="M20 4L36 12V28L20 36L4 28V12L20 4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M20 4v32M4 12l16 8 16-8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="empty-state__text">{t.custNoShipmentsYet}</span>
            <a href="/send" className="btn-primary" style={{ marginTop: 12 }}>{t.custSendPackage}</a>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <GroupOrderTable orders={recentOrders} />
          </div>
        )}
      </div>
    </>
  );
}

// ── Shipments ─────────────────────────────────────────────────────────────────

function ShipmentsView({ orders }: { orders: CustomerGroupOrder[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const { lang, t } = useLanguage();
  const cityName     = (en: string, geo?: string) => lang === 'ka' && geo ? geo : en;
  const districtName = (en: string, geo?: string) => lang === 'ka' && geo ? geo : en;

  if (orders.length === 0) {
    return (
      <div className="content-card">
        <div className="content-card__header">
          <span className="content-card__title">{t.custNavShipments}</span>
        </div>
        <div className="empty-state">
          <svg className="empty-state__icon" viewBox="0 0 40 40" fill="none">
            <rect x="4" y="8" width="32" height="28" rx="3" stroke="currentColor" strokeWidth="1.5" />
            <path d="M12 16h16M12 22h10M12 28h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="empty-state__text">{t.custNoShipmentsHint}</span>
          <a href="/send" className="btn-primary" style={{ marginTop: 12 }}>{t.custSendPackage}</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {orders.map(go => (
        <div key={go.id} className="content-card">
          {/* Group order header */}
          <div className="content-card__header" style={{ cursor: 'pointer' }}
               onClick={() => setExpanded(expanded === go.id ? null : go.id)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
              <StatusBadge status={go.status} />
              <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-text)' }}>
                {go.senderBusinessName}
              </span>
              <span style={{ color: 'var(--color-text-subtle)', fontSize: '0.8rem' }}>
                {t.custPkg(go.numberOfPackages)}
                {' · '}{cityName(go.pickUpCity, go.pickUpCityGeo)}, {districtName(go.pickUpDistrict, go.pickUpDistrictGeo)}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--color-text-subtle)' }}>
                {new Date(go.createdAt).toLocaleDateString()}
              </span>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
                   style={{ transform: expanded === go.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}>
                <path d="M3 6l5 5 5-5" stroke="var(--color-text-subtle)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>

          {/* Expanded: individual packages */}
          {expanded === go.id && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                    {[t.custThTracking, t.custThRecipient, t.custThCity, t.custThAddress, t.custThStatus, t.custThPaid, t.custThServiceFee].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600,
                        fontSize: '0.72rem', letterSpacing: '0.06em', textTransform: 'uppercase',
                        color: 'var(--color-text-subtle)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {go.orders.map(o => (
                    <tr key={o.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: '0.8rem',
                        color: 'var(--color-accent)', fontWeight: 600 }}>
                        {o.trackingNumber}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ fontWeight: 500 }}>{o.recipientFirstName} {o.recipientLastName}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>{o.recipientPhone}</div>
                      </td>
                      <td style={{ padding: '10px 16px', color: 'var(--color-text-subtle)', fontSize: '0.82rem' }}>
                        {cityName(o.recipientCity, o.recipientCityGeo)}, {districtName(o.recipientDistrict, o.recipientDistrictGeo)}
                      </td>
                      <td style={{ padding: '10px 16px', color: 'var(--color-text-subtle)', fontSize: '0.82rem' }}>
                        {o.recipientAddress}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <StatusBadge status={o.status} />
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 100, fontSize: '0.72rem', fontWeight: 700,
                          background: o.isPaid ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                          color: o.isPaid ? '#10b981' : '#ef4444',
                        }}>
                          {o.isPaid ? t.custPaid : t.custUnpaid}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', color: 'var(--color-text-subtle)', fontSize: '0.82rem' }}>
                        {o.companyServicePrice != null ? `₾${o.companyServicePrice.toFixed(2)}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Small overview table ───────────────────────────────────────────────────────

function GroupOrderTable({ orders }: { orders: CustomerGroupOrder[] }) {
  const { lang, t } = useLanguage();
  const cityName = (en: string, geo?: string) => lang === 'ka' && geo ? geo : en;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
      <thead>
        <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
          {[t.custThBusiness, t.custThPackages, t.custThCityDistrict, t.custThStatus, t.custThDate].map(h => (
            <th key={h} style={{ padding: '10px 20px', textAlign: 'left', fontWeight: 600,
              fontSize: '0.72rem', letterSpacing: '0.06em', textTransform: 'uppercase',
              color: 'var(--color-text-subtle)' }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {orders.map(go => (
          <tr key={go.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
            <td style={{ padding: '12px 20px', fontWeight: 500 }}>{go.senderBusinessName}</td>
            <td style={{ padding: '12px 20px', color: 'var(--color-text-subtle)' }}>{go.numberOfPackages}</td>
            <td style={{ padding: '12px 20px', color: 'var(--color-text-subtle)' }}>{cityName(go.pickUpCity, go.pickUpCityGeo)}</td>
            <td style={{ padding: '12px 20px' }}><StatusBadge status={go.status} /></td>
            <td style={{ padding: '12px 20px', color: 'var(--color-text-subtle)', fontSize: '0.8rem' }}>
              {new Date(go.createdAt).toLocaleDateString()}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Edit Profile ──────────────────────────────────────────────────────────────

interface ProfileForm {
  firstName: string; lastName: string; idNumber: string;
  businessName: string; phoneNumber: string;
  city: string; district: string; address: string;
}

function EditProfileView({
  profile, token, onSaved,
}: {
  profile: Customer;
  token: string;
  onSaved: (updated: Customer) => void;
}) {
  const { t } = useLanguage();
  const [form, setForm] = useState<ProfileForm>({
    firstName:    profile.firstName,
    lastName:     profile.lastName,
    idNumber:     profile.idNumber ?? '',
    businessName: profile.businessName,
    phoneNumber:  profile.phoneNumber,
    city:         profile.city,
    district:     profile.district,
    address:      profile.address,
  });
  const [errors,   setErrors]   = useState<Partial<Record<keyof ProfileForm, string>>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);

  const set = (field: keyof ProfileForm) => (ev: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [field]: ev.target.value }));
    setErrors(e => ({ ...e, [field]: undefined }));
    setApiError(null);
    setSaved(false);
  };

  const validate = (): boolean => {
    const e: Partial<Record<keyof ProfileForm, string>> = {};
    if (!form.firstName.trim())    e.firstName    = t.custRequired;
    if (!form.lastName.trim())     e.lastName     = t.custRequired;
    if (!form.businessName.trim()) e.businessName = t.custRequired;
    if (!form.phoneNumber.trim())  e.phoneNumber  = t.custRequired;
    if (!form.city.trim())         e.city         = t.custRequired;
    if (!form.district.trim())     e.district     = t.custRequired;
    if (!form.address.trim())      e.address      = t.custRequired;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = useCallback(async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await updateMyProfile(
        { ...form, idNumber: form.idNumber.trim() || undefined },
        token,
      );
      // Re-fetch profile to get the latest data back
      const updated = await getMyProfile(token);
      onSaved(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setApiError(err instanceof CustomerApiError ? err.message : t.custSaveFailed);
    } finally {
      setSaving(false);
    }
  }, [form, token, onSaved]);

  return (
    <div className="content-card" style={{ maxWidth: 640 }}>
      <div className="content-card__header">
        <span className="content-card__title">{t.custEditProfileTitle}</span>
        {saved && (
          <span style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
              <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t.custSaved}
          </span>
        )}
      </div>

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 0 }}>
        {apiError && (
          <div className="register-form__error" role="alert" style={{ marginBottom: 16 }}>{apiError}</div>
        )}

        <p style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: 'var(--color-text-subtle)', marginBottom: 12 }}>
          {t.custPersonalInfo}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <FormField label={t.firstName}  value={form.firstName}  onChange={set('firstName')}  error={errors.firstName} />
          <FormField label={t.lastName}   value={form.lastName}   onChange={set('lastName')}   error={errors.lastName} />
        </div>
        <FormField label={t.businessName} value={form.businessName} onChange={set('businessName')} error={errors.businessName} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <FormField label={t.custIdNumberOpt} value={form.idNumber}    onChange={set('idNumber')}    error={errors.idNumber} />
          <FormField label={t.phoneNumber}     value={form.phoneNumber} onChange={set('phoneNumber')} error={errors.phoneNumber} />
        </div>

        <div style={{ height: 1, background: 'var(--color-border)', margin: '8px 0 20px' }} />

        <p style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: 'var(--color-text-subtle)', marginBottom: 12 }}>
          {t.custDefaultPickup}
        </p>
        <CityDistrictPicker
          cityValue={form.city}
          districtValue={form.district}
          onCityChange={cityName => { setForm(f => ({ ...f, city: cityName, district: '' })); setErrors(e => ({ ...e, city: undefined, district: undefined })); setApiError(null); setSaved(false); }}
          onDistrictChange={districtName => { setForm(f => ({ ...f, district: districtName })); setErrors(e => ({ ...e, district: undefined })); setApiError(null); setSaved(false); }}
          cityError={errors.city}
          districtError={errors.district}
        />
        <FormField label={t.streetAddress} value={form.address} onChange={set('address')} error={errors.address} placeholder={t.phStreetAddress} />

        <div style={{ marginTop: 8 }}>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? t.custSaving : t.custSaveChanges}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Change Password ───────────────────────────────────────────────────────────

function ChangePasswordView({ token }: { token: string }) {
  const { t } = useLanguage();
  const [form, setForm] = useState({
    currentPassword: '', newPassword: '', confirmNewPassword: '',
  });
  const [errors,   setErrors]   = useState<Partial<typeof form>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [saving,   setSaving]   = useState(false);
  const [done,     setDone]     = useState(false);

  const set = (field: keyof typeof form) => (ev: React.ChangeEvent<HTMLInputElement>) => {
    setForm(f => ({ ...f, [field]: ev.target.value }));
    setErrors(e => ({ ...e, [field]: undefined }));
    setApiError(null);
    setDone(false);
  };

  const validate = (): boolean => {
    const e: Partial<typeof form> = {};
    if (!form.currentPassword)                         e.currentPassword    = t.custErrCurrentPwdRequired;
    if (form.newPassword.length < 8)                   e.newPassword        = t.custErrNewPwdShort;
    else if (!/[A-Z]/.test(form.newPassword))          e.newPassword        = t.custErrNewPwdUppercase;
    else if (!/[0-9]/.test(form.newPassword))          e.newPassword        = t.custErrNewPwdNumber;
    if (form.newPassword !== form.confirmNewPassword)  e.confirmNewPassword = t.errPasswordMismatch;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await changePassword(form, token);
      setForm({ currentPassword: '', newPassword: '', confirmNewPassword: '' });
      setDone(true);
    } catch (err) {
      setApiError(err instanceof CustomerApiError ? err.message : t.custChangePwdFailed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="content-card" style={{ maxWidth: 480 }}>
      <div className="content-card__header">
        <span className="content-card__title">{t.custChangePassword}</span>
        {done && (
          <span style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
              <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t.custPasswordUpdated}
          </span>
        )}
      </div>

      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 0 }}>
        {apiError && (
          <div className="register-form__error" role="alert" style={{ marginBottom: 16 }}>{apiError}</div>
        )}

        <FormField
          label={t.custCurrentPassword} type="password"
          value={form.currentPassword} onChange={set('currentPassword')}
          error={errors.currentPassword} autoComplete="current-password"
        />
        <FormField
          label={t.custNewPassword} type="password"
          value={form.newPassword} onChange={set('newPassword')}
          error={errors.newPassword}
          placeholder={t.custNewPasswordPh}
          autoComplete="new-password"
        />
        <FormField
          label={t.custConfirmNewPassword} type="password"
          value={form.confirmNewPassword} onChange={set('confirmNewPassword')}
          error={errors.confirmNewPassword}
          placeholder={t.custRepeatNewPassword}
          autoComplete="new-password"
        />

        <div style={{ marginTop: 8 }}>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? t.custUpdating : t.custUpdatePassword}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── SVG icons ─────────────────────────────────────────────────────────────────

const overviewIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="1" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
    <rect x="9" y="1" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
    <rect x="1" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
    <rect x="9" y="9" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
  </svg>
);

const shipmentsIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    <path d="M8 1v14M2 4.5l6 3.5 6-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const calcIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="1.5" y="1.5" width="13" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.4"/>
    <path d="M4.5 5h7M4.5 8h3.5M10 7v3M11.5 8.5H9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);

const statisticsIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M2 14V2M2 14h12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <rect x="4.5" y="8" width="2.2" height="4" rx="0.6" stroke="currentColor" strokeWidth="1.2" />
    <rect x="8.2" y="5" width="2.2" height="7" rx="0.6" stroke="currentColor" strokeWidth="1.2" />
    <rect x="11.9" y="9.5" width="2.2" height="2.5" rx="0.6" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

const profileIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.4" />
    <path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

const lockIcon = (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="2.5" y="7" width="11" height="8" rx="2" stroke="currentColor" strokeWidth="1.4" />
    <path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    <circle cx="8" cy="11" r="1" fill="currentColor" />
  </svg>
);

const logoutIcon = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
    <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M10 11l3-3-3-3M13 8H6"
      stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
