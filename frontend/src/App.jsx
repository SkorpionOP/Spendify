import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { StoreProvider, useStore } from './lib/store';
import { ToastProvider } from './components/Toasts';
import { ExpenseSheetProvider } from './components/ExpenseSheet';
import { AppShell } from './components/AppShell';
import Onboarding from './pages/Onboarding';
import Home from './pages/Home';
import CalendarPage from './pages/CalendarPage';
import Insights from './pages/Insights';
import History from './pages/History';
import Settings from './pages/Settings';

function Routed() {
  const { state } = useStore();

  if (!state.profile) return <Onboarding />;

  return (
    <ExpenseSheetProvider>
      <AppShell>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/insights" element={<Insights />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </ExpenseSheetProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <StoreProvider>
        <ToastProvider>
          <Routed />
        </ToastProvider>
      </StoreProvider>
    </BrowserRouter>
  );
}
