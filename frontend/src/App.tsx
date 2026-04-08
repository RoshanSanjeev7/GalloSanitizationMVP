import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import type { RootState } from './store';
import Login from './pages/Login';
import OperatorDashboard from './pages/OperatorDashboard';
import AdminDashboard from './pages/AdminDashboard';
import ChecklistFill from './pages/ChecklistFill';
import ChecklistDetail from './pages/ChecklistDetail';
import SubmissionReview from './pages/SubmissionReview';
import CreateTemplate from './pages/CreateTemplate';
import Settings from './pages/Settings';
import RoleAssignment from './pages/RoleAssignment';

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

export default function App() {
  return (
    <BrowserRouter>
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
    </BrowserRouter>
  );
}
