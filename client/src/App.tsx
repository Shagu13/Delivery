import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthProvider';
import { ProtectedRoute } from './components/ProtectedRoute';
import { CreateGroupOrderPage } from './pages/CreateGroupOrder/CreateGroupOrderPage';
import { LoginPage } from './pages/Login/LoginPage';
import { AdminDashboard } from './pages/Admin/AdminDashboard';
import { CourierDashboard } from './pages/Courier/CourierDashboard';
import { HomePage } from './pages/Home/HomePage';
import { RegisterPage } from './pages/Register/RegisterPage';
import { AppLayout } from './components/layout/AppLayout';   // ← add

export default function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <AppLayout>                                    {/* ← add */}
                    <Routes>
                        {/* Public */}
                        <Route path="/" element={<HomePage />} />
                        <Route path="/send" element={<CreateGroupOrderPage />} />
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/register" element={<RegisterPage />} />

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

                        {/* Fallback */}
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                </AppLayout>                                   {/* ← add */}
            </BrowserRouter>
        </AuthProvider>
    );
}