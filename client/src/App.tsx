import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthProvider';
import { LanguageProvider } from './contexts/LanguageProvider';
import { ProtectedRoute } from './components/ProtectedRoute';
import { CreateGroupOrderPage } from './pages/CreateGroupOrder/CreateGroupOrderPage';
import { LoginPage } from './pages/Login/LoginPage';
import { ForgotPasswordPage } from './pages/ForgotPassword/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPassword/ResetPasswordPage';
import { AdminDashboard } from './pages/Admin/AdminDashboard';
import { CourierDashboard } from './pages/Courier/CourierDashboard';
import { CustomerDashboard } from './pages/Customer/CustomerDashboard';
import { HomePage } from './pages/Home/HomePage';
import { RegisterPage } from './pages/Register/RegisterPage';
import { FaqPage } from './pages/Faq/FaqPage';
import { AppLayout } from './components/layout/AppLayout';
import { ContactPage } from './pages/Contact/ContactPage';

export default function App() {
    return (
        <LanguageProvider>
            <AuthProvider>
                <BrowserRouter>
                    <AppLayout>
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
                    </AppLayout>
                </BrowserRouter>
            </AuthProvider>
        </LanguageProvider>
    );
}
