import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { StoreProvider, useStore } from './lib/store';
import { ToastProvider, useToast } from './components/Toasts';
import { catName, t } from './lib/i18n';
import { money } from './lib/format';
import { sendNotification } from './lib/notifications';
import { ExpenseSheetProvider } from './components/ExpenseSheet';
import { AppShell } from './components/AppShell';
import Onboarding from './pages/Onboarding';
import Home from './pages/Home';
import CalendarPage from './pages/CalendarPage';
import Insights from './pages/Insights';
import History from './pages/History';
import Settings from './pages/Settings';

function useTheme(theme) {
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
    else delete root.dataset.theme;
    const bg = getComputedStyle(root).getPropertyValue('--paper').trim();
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', bg));
  }, [theme]);
}

function Routed() {
  const { state, ready, recovered, clearRecovered, autoAddedRecurring, clearAutoAdded } = useStore();
  const toast = useToast();
  useTheme(state.settings.theme);
  useEffect(() => {
    document.documentElement.lang = state.settings.lang || 'id';
  }, [state.settings.lang]);

  useEffect(() => {
    if (recovered) {
      toast(recovered, { duration: 8000 });
      clearRecovered();
    }
  }, [recovered, toast, clearRecovered]);

  useEffect(() => {
    if (autoAddedRecurring && autoAddedRecurring.length > 0) {
      const names = autoAddedRecurring
        .slice(0, 3)
        .map((e) => e.note || catName(e.category))
        .join(', ');
      const total = autoAddedRecurring.reduce((s, e) => s + e.amount, 0);
      const msg = t('Added {count} monthly repeat: {names} ({total})', {
        count: autoAddedRecurring.length,
        names: names + (autoAddedRecurring.length > 3 ? '…' : ''),
        total: money(total),
      });
      toast(msg, { duration: 7000 });
      if (state.settings?.notifyRecurring) {
        sendNotification(t('Spendify: Monthly repeat added'), { body: msg });
      }
      clearAutoAdded();
    }
  }, [autoAddedRecurring, clearAutoAdded, state.settings?.notifyRecurring, toast]);

  if (!ready) return <div className="splash" aria-label={t('Loading')} />;
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
