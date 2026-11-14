import { ordinal, t } from '../lib/i18n';
import { periodPreview } from '../lib/dates';

// "25th" / "Tgl 25"
const chipLabel = (d) => t('payday-chip', { day: d, ord: ordinal(d).replace(/^the /, '') });

// Common paydays in Indonesia: the 25th (most private companies), the 1st (PNS / civil servants), the 28th.
const QUICK = [25, 1, 28];
const DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

/** Pick the day the salary arrives. Budget months then run from that day to the day before the next one. */
export function PaydayPicker({ value, onChange, id = 'payday' }) {
  const isQuick = QUICK.includes(value);
  return (
    <div className="field payday">
      <span className="field-label" id={`${id}-label`}>
        {t('When do you get paid?')}
      </span>
      <div className="payday__chips" role="radiogroup" aria-labelledby={`${id}-label`}>
        {QUICK.map((d) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={value === d}
            className={`chip ${value === d ? 'is-on' : ''}`}
            onClick={() => onChange(d)}
          >
            {chipLabel(d)}
          </button>
        ))}
        <label className={`chip payday__other ${!isQuick ? 'is-on' : ''}`}>
          <span>{isQuick ? t('Other date') : chipLabel(value)}</span>
          <select value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={t('Other date')}>
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
      </div>
      <span className="muted small">
        {value === 1
          ? t('payday-hint-calendar')
          : t('payday-hint', { ord: ordinal(value), period: periodPreview(value) })}
      </span>
    </div>
  );
}
