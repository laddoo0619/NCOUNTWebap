import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import UploadPage from './pages/UploadPage';
import InventoryPage from './pages/InventoryPage';
import ReconciliationPage from './pages/ReconciliationPage';
import ReconciliationDetailPage from './pages/ReconciliationDetailPage';
import AuditLogPage from './pages/AuditLogPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardPage />} />
          <Route path="upload" element={<UploadPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="reconciliation" element={<ReconciliationPage />} />
          <Route path="reconciliation/:id" element={<ReconciliationDetailPage />} />
          <Route path="audit" element={<AuditLogPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
