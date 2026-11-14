import { NavLink, useLocation } from 'react-router-dom';
import { CalendarDays, Eye, EyeOff, Home, PieChart, Plus, ReceiptText, Settings } from 'lucide-react';
import { t } from '../lib/i18n';
import { useStore } from '../lib/store';
import { useExpenseSheet } from './ExpenseSheet';
import { LangSwitch } from './LangSwitch';

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/insights', label: 'Insights', icon: PieChart },
  { to: '/history', label: 'History', icon: ReceiptText },
];

export function AppShell({ children }) {
  const { state, updateSettings } = useStore();
  const open = useExpenseSheet();
  const { pathname } = useLocation();
  const hidden = !!state.settings?.hideAmounts;

  return (
    <div className={`shell ${hidden ? 'is-private' : ''}`}>
      <aside className="rail" aria-label="Main">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="28" height="28" fill="none">
              <rect x="3" y="3" width="26" height="26" rx="9" fill="url(#brandGrad)" />
              <path d="M10 16.5C10 13.5 12.5 11 16 11C19.5 11 22 13.5 22 16.5C22 19.5 19.5 22 16 22" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="16" cy="16.5" r="2" fill="white" />
              <defs>
                <linearGradient id="brandGrad" x1="3" y1="3" x2="29" y2="29" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#ff4b72" />
                  <stop offset="1" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
            </svg>
          </span>
          Spendify
        </div>
        <button className="btn btn--primary rail__add" onClick={() => open()}>
          <Plus size={18} strokeWidth={2.5} /> {t('Add expense')}
        </button>
        <nav className="rail__nav">
          {[...NAV, { to: '/settings', label: 'Settings', icon: Settings }].map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className="rail__link">
              <Icon size={20} /> {t(label)}
            </NavLink>
          ))}
        </nav>
        <div className="rail__foot">
          <LangSwitch />
          <button
            className="icon-btn"
            onClick={() => updateSettings({ hideAmounts: !hidden })}
            aria-pressed={hidden}
            aria-label={hidden ? t('Show amounts') : t('Hide amounts')}
            title={hidden ? t('Show amounts') : t('Hide amounts')}
          >
            {hidden ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      </aside>

      <main className="main" key={pathname}>
        {children}
      </main>

      <nav className="tabbar" aria-label="Main">
        {NAV.slice(0, 2).map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className="tabbar__link">
            <Icon size={22} />
            <span>{t(label)}</span>
          </NavLink>
        ))}
        <button className="tabbar__add" onClick={() => open()} aria-label={t('Add expense')}>
          <Plus size={26} strokeWidth={2.5} />
        </button>
        {NAV.slice(2).map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className="tabbar__link">
            <Icon size={22} />
            <span>{t(label)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
