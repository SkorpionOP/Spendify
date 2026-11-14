import { useState } from 'react';
import { useStore } from '../lib/store';
import { money } from '../lib/format';
import { SplitSlider } from '../components/SplitSlider';

export default function Onboarding() {
  const { setup, importData } = useStore();
  const [name, setName] = useState('');
  const [salary, setSalary] = useState('');
  const [needsPercent, setNeedsPercent] = useState(70);
  const [error, setError] = useState('');

  const income = parseFloat(salary) || 0;

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return setError('Add your name so the app can greet you.');
    if (income <= 0) return setError('Enter your monthly income to plan your budget.');
    setup({ name, salary: income, needsPercent });
  };

  const restore = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      importData(await file.text());
    } catch (err) {
      setError(err.message || 'That file could not be read.');
    }
  };

  return (
    <div className="onboard">
      <div className="onboard__intro">
        <div className="jar-illo" aria-hidden="true">
          <div className="jar-illo__fill" />
        </div>
        <h1>Know what’s left, every day of the month.</h1>
        <p>
          Spendify keeps everything on this phone. There’s no account and no password, and nothing is sent to a
          server.
        </p>
      </div>

      <form className="card onboard__form" onSubmit={submit} noValidate>
        <label className="field">
          <span className="field-label">What should we call you?</span>
          <input value={name} onChange={(e) => (setName(e.target.value), setError(''))} autoComplete="given-name" />
        </label>

        <label className="field">
          <span className="field-label">Monthly income</span>
          <div className="input-prefix">
            <span aria-hidden="true">₹</span>
            <input
              inputMode="decimal"
              value={salary}
              onChange={(e) => (setSalary(e.target.value.replace(/[^\d.]/g, '')), setError(''))}
              placeholder="40,000"
            />
          </div>
        </label>

        <SplitSlider value={needsPercent} onChange={setNeedsPercent} income={income} />

        {error && <p className="field-error">{error}</p>}

        <button className="btn btn--primary btn--block" type="submit">
          Start tracking
        </button>
        <p className="onboard__fine">
          {income > 0
            ? `${money(income * (needsPercent / 100))} a month to spend, ${money(income * ((100 - needsPercent) / 100))} to save. You can change this any time.`
            : 'You can change these any time in Settings.'}
        </p>
      </form>

      <label className="link-btn onboard__restore">
        Restore from a backup file
        <input type="file" accept="application/json,.json" onChange={restore} hidden />
      </label>
    </div>
  );
}
