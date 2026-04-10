import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from './store';
import Spinner from './components/Spinner';
import OfflineBanner from './components/OfflineBanner';
import { useWebSocket } from './hooks/useWebSocket';
import ReconnectBanner from './components/ReconnectBanner';
import Login from './pages/Login';
import OperatorDashboard from './pages/OperatorDashboard';
import ChecklistFill from './pages/ChecklistFill';
import ChecklistDetail from './pages/ChecklistDetail';
import Settings from './pages/Settings';

// Admin-only pages — lazy loaded for code splitting
const AdminDashboard = React.lazy(() => import('./pages/AdminDashboard'));
const SubmissionReview = React.lazy(() => import('./pages/SubmissionReview'));
const CreateTemplate = React.lazy(() => import('./pages/CreateTemplate'));
const RoleAssignment = React.lazy(() => import('./pages/RoleAssignment'));

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const user = useSelector((s: RootState) => s.auth.user);
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function HomeRedirect() {
  const user = useSelector((s: RootState) => s.auth.user);
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'admin') return <Navigate to="/admin" replace />;
  return <OperatorDashboard />;
}

function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const { reconnecting } = useWebSocket();
  return (
    <>
      <ReconnectBanner visible={reconnecting} />
      {children}
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <WebSocketProvider>
        <OfflineBanner />
        <Suspense fallback={<Spinner label="Loading..." />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<HomeRedirect />} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/checklist/:id/fill"
              element={
                <ProtectedRoute>
                  <ChecklistFill />
                </ProtectedRoute>
              }
            />
            <Route
              path="/checklist/:id/review"
              element={
                <ProtectedRoute>
                  <SubmissionReview />
                </ProtectedRoute>
              }
            />
            <Route
              path="/checklist/:id"
              element={
                <ProtectedRoute>
                  <ChecklistDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/templates/create"
              element={
                <ProtectedRoute>
                  <CreateTemplate />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/roles"
              element={
                <ProtectedRoute>
                  <RoleAssignment />
                </ProtectedRoute>
              }
            />
          </Routes>
        </Suspense>
      </WebSocketProvider>
    </BrowserRouter>
  );
}
