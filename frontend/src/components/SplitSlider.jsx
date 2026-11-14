import { money } from '../lib/format';

/** One slider that splits income into "to spend" and "to save". */
export function SplitSlider({ value, onChange, income }) {
  return (
    <div className="split">
      <div className="split__legend">
        <div>
          <span className="split__dot split__dot--spend" />
          To spend <strong>{value}%</strong>
          {income > 0 && <span className="split__amt">{money(income * (value / 100))}</span>}
        </div>
        <div>
          <span className="split__dot split__dot--save" />
          To save <strong>{100 - value}%</strong>
          {income > 0 && <span className="split__amt">{money(income * ((100 - value) / 100))}</span>}
        </div>
      </div>
      <input
        type="range"
        min="10"
        max="100"
        step="5"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="split__range"
        style={{ '--p': `${((value - 10) / 90) * 100}%` }}
        aria-label="Share of income to spend"
        aria-valuetext={`${value}% to spend, ${100 - value}% to save`}
      />
    </div>
  );
}
