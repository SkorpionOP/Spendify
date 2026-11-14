import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addMonths, currentMonth, monthLabel } from '../lib/dates';

export function MonthSwitcher({ value, onChange }) {
  const isCurrent = value >= currentMonth();
  return (
    <div className="month-switch">
      <button className="icon-btn" onClick={() => onChange(addMonths(value, -1))} aria-label="Previous month">
        <ChevronLeft size={20} />
      </button>
      <span className="month-switch__label" aria-live="polite">
        {monthLabel(value)}
      </span>
      <button
        className="icon-btn"
        onClick={() => onChange(addMonths(value, 1))}
        disabled={isCurrent}
        aria-label="Next month"
      >
        <ChevronRight size={20} />
      </button>
    </div>
  );
}
