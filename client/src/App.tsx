import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthProvider';
import { ProtectedRoute } from './components/ProtectedRoute';
import { CreateGroupOrderPage } from './pages/CreateGroupOrder/CreateGroupOrderPage';
import { LoginPage } from './pages/Login/LoginPage';
import { AdminDashboard } from './pages/Admin/AdminDashboard';
import { CourierDashboard } from './pages/Courier/CourierDashboard';
import { CustomerDashboard } from './pages/Customer/CustomerDashboard';
import { HomePage } from './pages/Home/HomePage';
import { RegisterPage } from './pages/Register/RegisterPage';
import { AppLayout } from './components/layout/AppLayout';

export default function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <AppLayout>
                    <Routes>
                        {/* Public */}
                        <Route path="/"         element={<HomePage />} />
                        <Route path="/login"    element={<LoginPage />} />
                        <Route path="/register" element={<RegisterPage />} />

                        {/* Send packages — Customer only.
                            Unauthenticated → redirected to /login (then back here after sign-in).
                            Wrong role (Admin/Courier) → redirected to their own dashboard. */}
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
    );
}
