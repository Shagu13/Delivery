import { useState, useEffect } from 'react';
import { useEditCourier, isDefaultSalaryEligibleCourier } from '../../hooks/useEditCourier';
import type { Courier } from '../../api/couriers';

interface Props {
    open: boolean;
    courier: Courier | null;
    token: string;
    onClose: () => void;
    onUpdated: (courierId: string, newFirstName: string, newLastName: string, newUsername: string, newPhone: string, newIdNumber: string, newDefaultSalary: number | null) => void;
}

export function EditCourierModal({ open, courier, token, onClose, onUpdated }: Props) {
    const [showPassword, setShowPassword] = useState(false);
    const { form, errors, globalError, submitting, success, handleChange, handleSubmit } =
        useEditCourier(courier, token, onUpdated);

    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, onClose]);

    if (!open || !courier) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={() => { setShowPassword(false); onClose(); }}
                style={{
                    position: 'fixed', inset: 0,
                    background: 'rgba(26,23,20,0.45)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 100,
                    animation: 'ecm-fade-in 0.18s ease both',
                }}
            />

            {/* Dialog */}
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="ecm-title"
                style={{
                    position: 'fixed', top: '50%', left: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 101,
                    width: 'min(460px, calc(100vw - 32px))',
                    maxHeight: 'calc(100dvh - 32px)',
                    display: 'flex', flexDirection: 'column',
                    background: 'var(--color-bg-2)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.14), 0 4px 16px rgba(0,0,0,0.08)',
                    overflow: 'hidden',
                    animation: 'ecm-slide-up 0.22s ease both',
                }}
            >
                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                    padding: '20px 24px 16px',
                    borderBottom: '1px solid var(--color-border)',
                    background: 'var(--color-bg-2)',
                    flexShrink: 0,
                }}>
                    <div>
                        <p style={{
                            fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.12em',
                            textTransform: 'uppercase', color: 'var(--color-accent)',
                            margin: '0 0 4px',
                        }}>
                            Edit Account
                        </p>
                        <h2 id="ecm-title" style={{
                            fontFamily: 'var(--font-display)', fontSize: '1.2rem',
                            fontWeight: 800, letterSpacing: '-0.025em',
                            color: 'var(--color-text)', margin: 0,
                        }}>
                            Edit Courier
                        </h2>
                    </div>
                    <button
                        onClick={() => { setShowPassword(false); onClose(); }}
                        style={{
                            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'var(--color-bg-3)', border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-sm)', color: 'var(--color-text-muted)',
                            cursor: 'pointer', flexShrink: 0, transition: 'background 0.15s, color 0.15s',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(192,57,43,0.08)'; (e.currentTarget as HTMLButtonElement).style.color = '#c0392b'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--color-bg-3)'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-muted)'; }}
                    >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                            <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                        </svg>
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} noValidate style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto', minHeight: 0 }}>

                    {/* Courier name hint */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        background: 'var(--color-bg-3)', border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-sm)', padding: '10px 14px',
                    }}>
                        <div style={{
                            width: 32, height: 32, borderRadius: '50%',
                            background: 'var(--color-accent-dim)', border: '1px solid rgba(196,127,23,0.2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0, fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-accent)',
                        }}>
                            {courier.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.3 }}>
                                {courier.fullName}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>
                                {courier.assignedCity}, {courier.assignedDistrict}
                            </div>
                        </div>
                    </div>

                    {/* Error banner */}
                    {globalError && !success && (
                        <div role="alert" style={{
                            display: 'flex', alignItems: 'center', gap: 9,
                            background: 'var(--color-error-bg)', border: '1px solid rgba(192,57,43,0.2)',
                            borderRadius: 'var(--radius-sm)', color: 'var(--color-error)',
                            fontSize: '0.84rem', fontWeight: 500, padding: '10px 14px',
                        }}>
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
                                <path d="M8 5v3.5M8 10.5v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                            </svg>
                            {globalError}
                        </div>
                    )}

                    {/* Success banner */}
                    {success && (
                        <div role="status" style={{
                            display: 'flex', alignItems: 'center', gap: 9,
                            background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)',
                            borderRadius: 'var(--radius-sm)', color: '#10b981',
                            fontSize: '0.84rem', fontWeight: 500, padding: '10px 14px',
                        }}>
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
                                <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            Courier updated successfully.
                        </div>
                    )}

                    {/* Section label */}
                    <p style={{
                        fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em',
                        textTransform: 'uppercase', color: 'var(--color-text-subtle)',
                        margin: '4px 0 0',
                    }}>
                        Name
                    </p>

                    {/* First / Last Name */}
                    <div style={{ display: 'flex', gap: 12 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
                            <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text)' }}>
                                First Name <span style={{ color: 'var(--color-accent)' }}>*</span>
                            </label>
                            <input
                                type="text"
                                value={form.firstName}
                                onChange={e => handleChange('firstName', e.target.value)}
                                placeholder="e.g. George"
                                maxLength={100}
                                autoComplete="off"
                                autoFocus
                                style={{
                                    background: 'var(--color-bg)', border: `1px solid ${errors.firstName ? 'var(--color-error)' : 'var(--color-border)'}`,
                                    borderRadius: 'var(--radius-sm)', color: 'var(--color-text)',
                                    fontSize: '0.875rem', padding: '9px 12px', outline: 'none',
                                    transition: 'border-color 0.15s',
                                }}
                                onFocus={e => { if (!errors.firstName) e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
                                onBlur={e => { if (!errors.firstName) e.currentTarget.style.borderColor = 'var(--color-border)'; }}
                            />
                            {errors.firstName && (
                                <span style={{ fontSize: '0.78rem', color: 'var(--color-error)' }}>{errors.firstName}</span>
                            )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
                            <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text)' }}>
                                Last Name <span style={{ color: 'var(--color-accent)' }}>*</span>
                            </label>
                            <input
                                type="text"
                                value={form.lastName}
                                onChange={e => handleChange('lastName', e.target.value)}
                                placeholder="e.g. Doe"
                                maxLength={100}
                                autoComplete="off"
                                style={{
                                    background: 'var(--color-bg)', border: `1px solid ${errors.lastName ? 'var(--color-error)' : 'var(--color-border)'}`,
                                    borderRadius: 'var(--radius-sm)', color: 'var(--color-text)',
                                    fontSize: '0.875rem', padding: '9px 12px', outline: 'none',
                                    transition: 'border-color 0.15s',
                                }}
                                onFocus={e => { if (!errors.lastName) e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
                                onBlur={e => { if (!errors.lastName) e.currentTarget.style.borderColor = 'var(--color-border)'; }}
                            />
                            {errors.lastName && (
                                <span style={{ fontSize: '0.78rem', color: 'var(--color-error)' }}>{errors.lastName}</span>
                            )}
                        </div>
                    </div>

                    {/* Section label */}
                    <p style={{
                        fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em',
                        textTransform: 'uppercase', color: 'var(--color-text-subtle)',
                        margin: '4px 0 0',
                    }}>
                        Contact Info
                    </p>

                    {/* Phone Number */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text)' }}>
                            Phone Number <span style={{ color: 'var(--color-accent)' }}>*</span>
                        </label>
                        <input
                            type="tel"
                            value={form.phoneNumber}
                            onChange={e => handleChange('phoneNumber', e.target.value)}
                            placeholder="e.g. 599123456"
                            maxLength={15}
                            autoComplete="off"
                            style={{
                                background: 'var(--color-bg)', border: `1px solid ${errors.phoneNumber ? 'var(--color-error)' : 'var(--color-border)'}`,
                                borderRadius: 'var(--radius-sm)', color: 'var(--color-text)',
                                fontSize: '0.875rem', padding: '9px 12px', outline: 'none',
                                transition: 'border-color 0.15s',
                            }}
                            onFocus={e => { if (!errors.phoneNumber) e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
                            onBlur={e => { if (!errors.phoneNumber) e.currentTarget.style.borderColor = 'var(--color-border)'; }}
                        />
                        {errors.phoneNumber && (
                            <span style={{ fontSize: '0.78rem', color: 'var(--color-error)' }}>{errors.phoneNumber}</span>
                        )}
                    </div>

                    {/* ID Number */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text)' }}>
                            ID Number <span style={{ color: 'var(--color-accent)' }}>*</span>
                        </label>
                        <input
                            type="text"
                            value={form.idNumber}
                            onChange={e => handleChange('idNumber', e.target.value)}
                            placeholder="e.g. 01234567890"
                            maxLength={20}
                            autoComplete="off"
                            style={{
                                background: 'var(--color-bg)', border: `1px solid ${errors.idNumber ? 'var(--color-error)' : 'var(--color-border)'}`,
                                borderRadius: 'var(--radius-sm)', color: 'var(--color-text)',
                                fontSize: '0.875rem', padding: '9px 12px', outline: 'none',
                                transition: 'border-color 0.15s',
                            }}
                            onFocus={e => { if (!errors.idNumber) e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
                            onBlur={e => { if (!errors.idNumber) e.currentTarget.style.borderColor = 'var(--color-border)'; }}
                        />
                        {errors.idNumber && (
                            <span style={{ fontSize: '0.78rem', color: 'var(--color-error)' }}>{errors.idNumber}</span>
                        )}
                    </div>

                    {/* Default Salary — eligible-city couriers only (Tbilisi, Rustavi) */}
                    {isDefaultSalaryEligibleCourier(courier) && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                            <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text)' }}>
                                Default Salary
                            </label>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={form.defaultSalary}
                                onChange={e => handleChange('defaultSalary', e.target.value)}
                                placeholder="e.g. 15.00"
                                style={{
                                    background: 'var(--color-bg)', border: `1px solid ${errors.defaultSalary ? 'var(--color-error)' : 'var(--color-border)'}`,
                                    borderRadius: 'var(--radius-sm)', color: 'var(--color-text)',
                                    fontSize: '0.875rem', padding: '9px 12px', outline: 'none',
                                    transition: 'border-color 0.15s',
                                }}
                                onFocus={e => { if (!errors.defaultSalary) e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
                                onBlur={e => { if (!errors.defaultSalary) e.currentTarget.style.borderColor = 'var(--color-border)'; }}
                            />
                            {errors.defaultSalary
                                ? <span style={{ fontSize: '0.78rem', color: 'var(--color-error)' }}>{errors.defaultSalary}</span>
                                : <span style={{ fontSize: '0.75rem', color: 'var(--color-text-subtle)' }}>
                                    Auto-applied to this courier's deliveries when assigned from the Packages page.
                                  </span>}
                        </div>
                    )}

                    {/* Section label */}
                    <p style={{
                        fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em',
                        textTransform: 'uppercase', color: 'var(--color-text-subtle)',
                        margin: '4px 0 0',
                    }}>
                        Login Credentials
                    </p>

                    {/* Username */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text)' }}>
                            Username <span style={{ color: 'var(--color-accent)' }}>*</span>
                        </label>
                        <input
                            type="text"
                            value={form.username}
                            onChange={e => handleChange('username', e.target.value)}
                            placeholder="e.g. courier_giorgi"
                            maxLength={50}
                            autoComplete="off"
                            style={{
                                background: 'var(--color-bg)', border: `1px solid ${errors.username ? 'var(--color-error)' : 'var(--color-border)'}`,
                                borderRadius: 'var(--radius-sm)', color: 'var(--color-text)',
                                fontSize: '0.875rem', padding: '9px 12px', outline: 'none',
                                transition: 'border-color 0.15s',
                            }}
                            onFocus={e => { if (!errors.username) e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
                            onBlur={e => { if (!errors.username) e.currentTarget.style.borderColor = 'var(--color-border)'; }}
                        />
                        {errors.username && (
                            <span style={{ fontSize: '0.78rem', color: 'var(--color-error)' }}>{errors.username}</span>
                        )}
                    </div>

                    {/* Password */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--color-text)' }}>
                            New Password{' '}
                            <span style={{ fontWeight: 400, color: 'var(--color-text-subtle)', fontSize: '0.75rem' }}>
                                (leave blank to keep current)
                            </span>
                        </label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                value={form.newPassword}
                                onChange={e => handleChange('newPassword', e.target.value)}
                                placeholder="Min. 8 characters"
                                autoComplete="new-password"
                                style={{
                                    width: '100%', background: 'var(--color-bg)',
                                    border: `1px solid ${errors.newPassword ? 'var(--color-error)' : 'var(--color-border)'}`,
                                    borderRadius: 'var(--radius-sm)', color: 'var(--color-text)',
                                    fontSize: '0.875rem', padding: '9px 42px 9px 12px', outline: 'none',
                                    transition: 'border-color 0.15s', boxSizing: 'border-box',
                                }}
                                onFocus={e => { if (!errors.newPassword) e.currentTarget.style.borderColor = 'var(--color-accent)'; }}
                                onBlur={e => { if (!errors.newPassword) e.currentTarget.style.borderColor = 'var(--color-border)'; }}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(p => !p)}
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                                style={{
                                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    color: 'var(--color-text-subtle)', display: 'flex', alignItems: 'center', padding: 2,
                                    transition: 'color 0.15s',
                                }}
                            >
                                {showPassword
                                    ? <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 2l12 12M6.5 6.6A2 2 0 0010 9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><path d="M3.5 4.6C2.2 5.6 1 7 1 8c0 0 2.5 5 7 5a7.3 7.3 0 003.4-.9M6 3.2A7 7 0 0115 8c-.4 1-1 2-1.7 2.7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
                                    : <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.4" /></svg>
                                }
                            </button>
                        </div>
                        {errors.newPassword && (
                            <span style={{ fontSize: '0.78rem', color: 'var(--color-error)' }}>{errors.newPassword}</span>
                        )}
                    </div>

                    {/* Footer */}
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
                        <button
                            type="button"
                            onClick={() => { setShowPassword(false); onClose(); }}
                            style={{
                                background: 'var(--color-bg-3)', border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-sm)', color: 'var(--color-text-muted)',
                                fontSize: '0.875rem', fontWeight: 500, padding: '9px 18px',
                                cursor: 'pointer', transition: 'background 0.15s, color 0.15s',
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 7,
                                background: submitting ? 'var(--color-accent-dim)' : 'var(--color-accent)',
                                border: 'none', borderRadius: 'var(--radius-sm)',
                                color: submitting ? 'var(--color-accent)' : '#fff',
                                fontSize: '0.875rem', fontWeight: 600, padding: '9px 20px',
                                cursor: submitting ? 'not-allowed' : 'pointer',
                                transition: 'opacity 0.15s',
                                opacity: submitting ? 0.7 : 1,
                            }}
                        >
                            {submitting ? (
                                <>
                                    <span style={{
                                        width: 13, height: 13, border: '2px solid rgba(196,127,23,0.3)',
                                        borderTopColor: 'var(--color-accent)', borderRadius: '50%',
                                        animation: 'ecm-spin 0.7s linear infinite', display: 'inline-block',
                                    }} />
                                    Saving…
                                </>
                            ) : (
                                <>
                                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                                        <path d="M13 3L6 11l-3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                    Save Changes
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>

            <style>{`
                @keyframes ecm-fade-in  { from { opacity:0 } to { opacity:1 } }
                @keyframes ecm-slide-up { from { opacity:0; transform:translate(-50%,-48%) } to { opacity:1; transform:translate(-50%,-50%) } }
                @keyframes ecm-spin     { to { transform: rotate(360deg) } }
            `}</style>
        </>
    );
}
