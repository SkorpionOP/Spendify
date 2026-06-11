import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ToastProvider } from './hooks/useToast';
import { LayoutProvider, Layout } from './components/Layout';
import { DateRangeProvider } from './hooks/useDateRange';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Calendar from './pages/Calendar';
import Analysis from './pages/Analysis';
import History from './pages/History';
import Setup from './pages/Setup';
import EditExpense from './pages/EditExpense';

// Private Route Guard
const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="text-center" style={{ marginTop: '5rem' }}>Verifying credentials...</div>;
  }

  return user ? children : <Navigate to="/login" replace />;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      
      {/* Protected Routes */}
      <Route path="/dashboard" element={
        <PrivateRoute>
          <Dashboard />
        </PrivateRoute>
      } />
      <Route path="/setup" element={
        <PrivateRoute>
          <Setup />
        </PrivateRoute>
      } />
      <Route path="/calendar" element={
        <PrivateRoute>
          <Calendar />
        </PrivateRoute>
      } />
      <Route path="/analysis" element={
        <PrivateRoute>
          <Analysis />
        </PrivateRoute>
      } />
      <Route path="/history" element={
        <PrivateRoute>
          <History />
        </PrivateRoute>
      } />
      <Route path="/edit/:id" element={
        <PrivateRoute>
          <EditExpense />
        </PrivateRoute>
      } />

      {/* Fallback route */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <ToastProvider>
          <DateRangeProvider>
            <LayoutProvider>
              <Layout>
                <AppRoutes />
              </Layout>
            </LayoutProvider>
          </DateRangeProvider>
        </ToastProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
