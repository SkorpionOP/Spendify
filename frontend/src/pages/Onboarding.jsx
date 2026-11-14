import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { useStore } from '../lib/store';
import { listSnapshots } from '../lib/persist';
import { currencySymbol, formatAmountInput, money, parseAmountInput } from '../lib/format';
import { CURRENCIES, getConfig, t } from '../lib/i18n';
import { dateTime } from '../lib/dates';
import { SplitSlider } from '../components/SplitSlider';
import { LangSwitch } from '../components/LangSwitch';

export default function Onboarding() {
  const { state, setup, importData, restoreSnapshot, updateSettings } = useStore();
  const [latestCopy, setLatestCopy] = useState(null);
  const [name, setName] = useState('');
  const [salary, setSalary] = useState('');
  const [needsPercent, setNeedsPercent] = useState(70);
  const [error, setError] = useState('');

  // If this device has an automatic copy (e.g. after "Delete all data"), offer it first.
  useEffect(() => {
    listSnapshots().then((list) => setLatestCopy(list.find((x) => x.count > 0) || null));
  }, []);

  const income = parseAmountInput(salary) || 0;

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return setError(t('Add your name so the app can greet you.'));
    if (income <= 0) return setError(t('Enter your monthly income to plan your budget.'));
    setup({ name, salary: income, needsPercent });
  };

  const restore = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      await importData(await file.text());
    } catch (err) {
      setError(err.message || t('That file could not be read.'));
    }
  };

  return (
    <div className="onboard">
      <div className="onboard__top">
        <LangSwitch />
      </div>

      {latestCopy && (
        <section className="nudge nudge--backup">
          <h2 className="nudge__title">{t('Your earlier data is still here')}</h2>
          <p className="nudge__body">
            {t('A copy with {n} expenses from {date} was found on this device.', { n: latestCopy.count, date: dateTime(latestCopy.at) })}
          </p>
          <button className="btn btn--primary btn--sm" onClick={() => restoreSnapshot(latestCopy.id).catch((err) => setError(err.message))}>
            <History size={16} /> {t('Restore it')}
          </button>
        </section>
      )}

      <div className="onboard__intro">
        <div className="jar-illo" aria-hidden="true">
          <div className="jar-illo__fill" />
        </div>
        <h1>{t('Know what’s left, every day of the month.')}</h1>
        <p>{t('Spendify keeps everything on this phone. There’s no account and no password, and nothing is sent to a server.')}</p>
      </div>

      <form className="card onboard__form" onSubmit={submit} noValidate>
        <label className="field">
          <span className="field-label">{t('What should we call you?')}</span>
          <input value={name} onChange={(e) => (setName(e.target.value), setError(''))} autoComplete="given-name" />
        </label>

        <div className="sheet__row onboard__money">
          <label className="field">
            <span className="field-label">{t('Monthly income')}</span>
            <div className="input-prefix">
              <span aria-hidden="true">{currencySymbol()}</span>
              <input
                inputMode="numeric"
                value={salary}
                onChange={(e) => (setSalary(formatAmountInput(e.target.value)), setError(''))}
                placeholder={getConfig().currency === 'IDR' ? '5.000.000' : '2,000'}
              />
            </div>
          </label>
          <label className="field">
            <span className="field-label">{t('Currency')}</span>
            <select
              value={state.settings.currency}
              onChange={(e) => {
                updateSettings({ currency: e.target.value });
                setSalary('');
              }}
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
          </label>
        </div>

        <SplitSlider value={needsPercent} onChange={setNeedsPercent} income={income} />

        {error && <p className="field-error">{error}</p>}

        <button className="btn btn--primary btn--block" type="submit">
          {t('Start tracking')}
        </button>
        <p className="onboard__fine">
          {income > 0
            ? t('{spend} a month to spend, {save} to save. You can change this any time.', {
                spend: money(income * (needsPercent / 100)),
                save: money(income * ((100 - needsPercent) / 100)),
              })
            : t('You can change these any time in Settings.')}
        </p>
      </form>

      <label className="link-btn onboard__restore">
        {t('Restore from a backup file')}
        <input type="file" accept="application/json,.json" onChange={restore} hidden />
      </label>
    </div>
  );
}
