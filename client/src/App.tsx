import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, persister, QUERY_CACHE_BUSTER } from './queryClient';
import { AuthProvider } from './contexts/AuthProvider';
import { CartProvider } from './contexts/CartProvider';
import { LanguageProvider } from './contexts/LanguageProvider';
import { BrandingProvider } from './contexts/BrandingProvider';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';

// Route components are lazy-loaded so each area ships as its own chunk and the
// initial bundle stays small — e.g. a customer never downloads the admin code.
// These are named exports, so map them to a default for React.lazy.
const HomePage             = lazy(() => import('./pages/Home/HomeRoute').then(m => ({ default: m.HomeRoute })));
const FaqPage              = lazy(() => import('./pages/Faq/FaqPage').then(m => ({ default: m.FaqPage })));
const LoginPage            = lazy(() => import('./pages/Login/LoginPage').then(m => ({ default: m.LoginPage })));
const RegisterPage         = lazy(() => import('./pages/Register/RegisterPage').then(m => ({ default: m.RegisterPage })));
const ContactPage          = lazy(() => import('./pages/Contact/ContactPage').then(m => ({ default: m.ContactPage })));
const ForgotPasswordPage   = lazy(() => import('./pages/ForgotPassword/ForgotPasswordPage').then(m => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage    = lazy(() => import('./pages/ResetPassword/ResetPasswordPage').then(m => ({ default: m.ResetPasswordPage })));
const CreateGroupOrderPage = lazy(() => import('./pages/CreateGroupOrder/CreateGroupOrderPage').then(m => ({ default: m.CreateGroupOrderPage })));
const CartPage             = lazy(() => import('./pages/Cart/CartPage').then(m => ({ default: m.CartPage })));
const AdminDashboard       = lazy(() => import('./pages/Admin/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const CourierDashboard     = lazy(() => import('./pages/Courier/CourierDashboard').then(m => ({ default: m.CourierDashboard })));
const CustomerDashboard    = lazy(() => import('./pages/Customer/CustomerDashboard').then(m => ({ default: m.CustomerDashboard })));
const TenantDashboard      = lazy(() => import('./pages/Tenant/TenantDashboard').then(m => ({ default: m.TenantDashboard })));

// Self-contained loader shown while a route chunk is being fetched.
function RouteFallback() {
    return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
            <div style={{
                width: 28, height: 28, borderRadius: '50%',
                border: '3px solid var(--color-border, #e5e7eb)',
                borderTopColor: 'var(--color-accent, #c47f17)',
                animation: 'app-route-spin 0.7s linear infinite',
            }} />
            <style>{`@keyframes app-route-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}

export default function App() {
    // Stop the mouse wheel from changing a focused number input's value (a browser
    // default that silently edits amount fields while the user scrolls the page).
    useEffect(() => {
        const onWheel = (e: WheelEvent) => {
            const el = document.activeElement;
            if (el instanceof HTMLInputElement && el.type === 'number' && el === e.target) {
                el.blur();
            }
        };
        document.addEventListener('wheel', onWheel, { passive: true });
        return () => document.removeEventListener('wheel', onWheel);
    }, []);

    return (
        <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{ persister, buster: QUERY_CACHE_BUSTER, maxAge: 24 * 60 * 60_000 }}
        >
        <LanguageProvider>
            <BrandingProvider>
            <AuthProvider>
                <CartProvider>
                <BrowserRouter>
                    <AppLayout>
                        <Suspense fallback={<RouteFallback />}>
                            <Routes>
                                {/* Public */}
                                <Route path="/"                  element={<HomePage />} />
                                <Route path="/faq"               element={<FaqPage />} />
                                <Route path="/login"             element={<LoginPage />} />
                                <Route path="/register" element={<RegisterPage />} />
                                <Route path="/contact" element={<ContactPage />} />
                                <Route path="/forgot-password"   element={<ForgotPasswordPage />} />
                                <Route path="/reset-password"    element={<ResetPasswordPage />} />

                                {/* Send packages — Customer only */}
                                <Route
                                    path="/send"
                                    element={
                                        <ProtectedRoute role="Customer">
                                            <CreateGroupOrderPage />
                                        </ProtectedRoute>
                                    }
                                />

                                {/* Cart — Customer only */}
                                <Route
                                    path="/cart"
                                    element={
                                        <ProtectedRoute role="Customer">
                                            <CartPage />
                                        </ProtectedRoute>
                                    }
                                />

                                {/* Admin + Operator + TenantAdmin (each sees a restricted subset) */}
                                <Route
                                    path="/admin/*"
                                    element={
                                        <ProtectedRoute role={['Admin', 'Operator', 'TenantAdmin']}>
                                            <AdminDashboard />
                                        </ProtectedRoute>
                                    }
                                />

                                {/* Courier only */}
                                <Route
                                    path="/courier/*"
                                    element={
                                        <ProtectedRoute role="Courier">
                                            <CourierDashboard />
                                        </ProtectedRoute>
                                    }
                                />

                                {/* Customer only */}
                                <Route
                                    path="/customer/*"
                                    element={
                                        <ProtectedRoute role="Customer">
                                            <CustomerDashboard />
                                        </ProtectedRoute>
                                    }
                                />

                                {/* Tenant co-admin only */}
                                <Route
                                    path="/tenant/*"
                                    element={
                                        <ProtectedRoute role="TenantAdmin">
                                            <TenantDashboard />
                                        </ProtectedRoute>
                                    }
                                />

                                {/* Fallback */}
                                <Route path="*" element={<Navigate to="/" replace />} />
                            </Routes>
                        </Suspense>
                    </AppLayout>
                </BrowserRouter>
                </CartProvider>
            </AuthProvider>
            </BrandingProvider>
        </LanguageProvider>
        </PersistQueryClientProvider>
    );
}
