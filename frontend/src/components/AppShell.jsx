import { NavLink, useLocation } from 'react-router-dom';
import { CalendarDays, Home, ListOrdered, PieChart, Plus, Settings } from 'lucide-react';
import { useExpenseSheet } from './ExpenseSheet';

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/insights', label: 'Insights', icon: PieChart },
  { to: '/history', label: 'History', icon: ListOrdered },
];

export function AppShell({ children }) {
  const open = useExpenseSheet();
  const { pathname } = useLocation();

  return (
    <div className="shell">
      <aside className="rail" aria-label="Main">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="28" height="28">
              <rect x="6" y="5" width="20" height="24" rx="6" fill="currentColor" opacity=".18" />
              <rect x="6" y="15" width="20" height="14" rx="6" fill="currentColor" />
              <rect x="10" y="2" width="12" height="5" rx="2.5" fill="currentColor" />
            </svg>
          </span>
          Spendify
        </div>
        <button className="btn btn--primary rail__add" onClick={() => open()}>
          <Plus size={18} strokeWidth={2.5} /> Add expense
        </button>
        <nav className="rail__nav">
          {[...NAV, { to: '/settings', label: 'Settings', icon: Settings }].map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className="rail__link">
              <Icon size={20} /> {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="main" key={pathname}>
        {children}
      </main>

      <nav className="tabbar" aria-label="Main">
        {NAV.slice(0, 2).map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className="tabbar__link">
            <Icon size={22} />
            <span>{label}</span>
          </NavLink>
        ))}
        <button className="tabbar__add" onClick={() => open()} aria-label="Add expense">
          <Plus size={26} strokeWidth={2.5} />
        </button>
        {NAV.slice(2).map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className="tabbar__link">
            <Icon size={22} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
