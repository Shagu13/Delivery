import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/useAuth';
import '../../styles/dashboard.css';

type CourierView = 'pickups' | 'myorders';

export function CourierDashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState<CourierView>('pickups');

  const handleSignOut = () => {
    signOut();
    navigate('/login', { replace: true });
  };

  const initials = user
    ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
    : 'C';

  return (
    <div className="dashboard">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar__logo">
          <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="6" fill="currentColor" />
            <path
              d="M7 14h14M7 9h8M7 19h10"
              stroke="var(--color-bg)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          Delivery
        </div>
        <span className="sidebar__role-badge">Courier</span>

        <div className="sidebar__divider" />
        <p className="sidebar__section-label">My Work</p>

        <nav className="sidebar__nav">
          <button
            className={`sidebar__link ${activeView === 'pickups' ? 'sidebar__link--active' : ''}`}
            onClick={() => setActiveView('pickups')}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              <path d="M8 1v14M2 4.5l6 3.5 6-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Available Pickups
          </button>

          <button
            className={`sidebar__link ${activeView === 'myorders' ? 'sidebar__link--active' : ''}`}
            onClick={() => setActiveView('myorders')}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.4" />
              <path d="M4.5 5.5h7M4.5 8h5M4.5 10.5h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            My Orders
          </button>
        </nav>

        <div className="sidebar__footer">
          <div className="sidebar__user">
            <div className="sidebar__avatar">{initials}</div>
            <div className="sidebar__user-info">
              <div className="sidebar__user-name">
                {user?.firstName} {user?.lastName}
              </div>
              <div className="sidebar__user-handle">@{user?.username}</div>
            </div>
          </div>
          <button className="sidebar__logout" onClick={handleSignOut}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path
                d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M10 11l3-3-3-3M13 8H6"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="dashboard__body">
        <div className="dashboard__topbar">
          <span className="dashboard__topbar-title">
            {activeView === 'pickups' && 'Available Pickups'}
            {activeView === 'myorders' && 'My Orders'}
          </span>
        </div>

        <main className="dashboard__content">
          {activeView === 'pickups' && <CourierPickups />}
          {activeView === 'myorders' && <CourierOrders />}
        </main>
      </div>
    </div>
  );
}

// ── Sub-views ────────────────────────────────────────────────────────────────

function CourierPickups() {
  return (
    <>
      <div className="stat-grid">
        {[
          { label: 'Available in My Area', value: '—', sub: 'Pending pickup' },
          { label: 'Accepted Today', value: '—', sub: 'By me' },
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
          <span className="content-card__title">Pending Group Orders in Your Area</span>
        </div>
        <div className="empty-state">
          <svg className="empty-state__icon" viewBox="0 0 40 40" fill="none">
            <path
              d="M20 4L36 12V28L20 36L4 28V12L20 4Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <path d="M20 4v32M4 12l16 8 16-8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="empty-state__text">No pickups available in your area right now</span>
        </div>
      </div>
    </>
  );
}

function CourierOrders() {
  return (
    <>
      <div className="stat-grid">
        {[
          { label: 'In Progress', value: '—', sub: 'Active deliveries' },
          { label: 'Delivered Today', value: '—', sub: 'Completed' },
          { label: 'Failed', value: '—', sub: 'This week' },
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
          <span className="content-card__title">My Assigned Orders</span>
        </div>
        <div className="empty-state">
          <svg className="empty-state__icon" viewBox="0 0 40 40" fill="none">
            <rect x="4" y="8" width="32" height="28" rx="3" stroke="currentColor" strokeWidth="1.5" />
            <path d="M12 16h16M12 22h10M12 28h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span className="empty-state__text">No orders assigned yet</span>
        </div>
      </div>
    </>
  );
}
