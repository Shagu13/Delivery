import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthProvider';
import { LanguageProvider } from './contexts/LanguageProvider';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';

// Route components are lazy-loaded so each area ships as its own chunk and the
// initial bundle stays small — e.g. a customer never downloads the admin code.
// These are named exports, so map them to a default for React.lazy.
const HomePage             = lazy(() => import('./pages/Home/HomePage').then(m => ({ default: m.HomePage })));
const FaqPage              = lazy(() => import('./pages/Faq/FaqPage').then(m => ({ default: m.FaqPage })));
const LoginPage            = lazy(() => import('./pages/Login/LoginPage').then(m => ({ default: m.LoginPage })));
const RegisterPage         = lazy(() => import('./pages/Register/RegisterPage').then(m => ({ default: m.RegisterPage })));
const ContactPage          = lazy(() => import('./pages/Contact/ContactPage').then(m => ({ default: m.ContactPage })));
const ForgotPasswordPage   = lazy(() => import('./pages/ForgotPassword/ForgotPasswordPage').then(m => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage    = lazy(() => import('./pages/ResetPassword/ResetPasswordPage').then(m => ({ default: m.ResetPasswordPage })));
const CreateGroupOrderPage = lazy(() => import('./pages/CreateGroupOrder/CreateGroupOrderPage').then(m => ({ default: m.CreateGroupOrderPage })));
const AdminDashboard       = lazy(() => import('./pages/Admin/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const CourierDashboard     = lazy(() => import('./pages/Courier/CourierDashboard').then(m => ({ default: m.CourierDashboard })));
const CustomerDashboard    = lazy(() => import('./pages/Customer/CustomerDashboard').then(m => ({ default: m.CustomerDashboard })));

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
    return (
        <LanguageProvider>
            <AuthProvider>
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

                                {/* Admin only */}
                                <Route
                                    path="/admin/*"
                                    element={
                                        <ProtectedRoute role="Admin">
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

                                {/* Fallback */}
                                <Route path="*" element={<Navigate to="/" replace />} />
                            </Routes>
                        </Suspense>
                    </AppLayout>
                </BrowserRouter>
            </AuthProvider>
        </LanguageProvider>
    );
}
