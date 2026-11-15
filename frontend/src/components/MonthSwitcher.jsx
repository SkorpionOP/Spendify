import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addMonths, currentMonth, cycleRange, monthLabel } from '../lib/dates';
import { t } from '../lib/i18n';

/** `current` is the latest month you can go to; `showRange` adds the pay-period dates under the name. */
export function MonthSwitcher({ value, onChange, current = currentMonth(), showRange = true }) {
  const isCurrent = value >= current;
  return (
    <div className="month-switch">
      <button className="icon-btn" onClick={() => onChange(addMonths(value, -1))} aria-label={t('Previous month')}>
        <ChevronLeft size={20} />
      </button>
      <span className="month-switch__label" aria-live="polite">
        {monthLabel(value)}
        {showRange && cycleRange(value) && <span className="month-switch__range">{cycleRange(value)}</span>}
      </span>
      <button className="icon-btn" onClick={() => onChange(addMonths(value, 1))} disabled={isCurrent} aria-label={t('Next month')}>
        <ChevronRight size={20} />
      </button>
    </div>
  );
}
