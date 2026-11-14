import { useEffect, useState } from 'react';
import { ChevronLeft, History } from 'lucide-react';
import { useStore } from '../lib/store';
import { listSnapshots } from '../lib/persist';
import { amountInWords, currencySymbol, formatAmountInput, money, parseAmountInput } from '../lib/format';
import { CURRENCIES, getConfig, t } from '../lib/i18n';
import { dateTime } from '../lib/dates';
import { SplitSlider } from '../components/SplitSlider';
import { PaydayPicker } from '../components/PaydayPicker';
import { LangSwitch } from '../components/LangSwitch';
import { InstallHelp } from '../components/Nudges';
import { GoalIllo, InstallIllo, PayIllo, PrivacyIllo } from '../components/Illustrations';
import { useInstall } from '../lib/install';

export default function Onboarding() {
  const { state, setup, importData, restoreSnapshot, updateSettings, addGoal } = useStore();
  const { mode: installMode } = useInstall();
  const [step, setStep] = useState(1);
  const [trackPayment, setTrackPayment] = useState(false);
  const [hideAmounts, setHideAmounts] = useState(false);
  const [wantGoal, setWantGoal] = useState(false);
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('');
  const [latestCopy, setLatestCopy] = useState(null);
  const [name, setName] = useState('');
  const [salary, setSalary] = useState('');
  const [needsPercent, setNeedsPercent] = useState(70);
  // Most private employers in Indonesia pay on the 25th, so start there.
  const [payday, setPayday] = useState(state.settings.payday > 1 ? state.settings.payday : 25);
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
    setError('');
    setStep(2);
    window.scrollTo(0, 0);
  };

  // Step 2: optional choices. Everything here can be changed later.
  const finish = (useChoices) => {
    const target = parseAmountInput(goalTarget);
    if (useChoices && wantGoal && goalName.trim() && !(target > 0)) return setError(t('Enter an amount above zero.'));
    setup({ name, salary: income, needsPercent, payday });
    if (useChoices) {
      updateSettings({ trackPayment, hideAmounts });
      if (wantGoal && goalName.trim() && target > 0) addGoal({ name: goalName, target });
    }
  };

  if (step === 2) {
    return (
      <div className="onboard">
        <div className="onboard__nav">
          <button type="button" className="icon-btn" onClick={() => setStep(1)} aria-label={t('Back')}>
            <ChevronLeft size={22} />
          </button>
          <span className="onboard__step">{t('Step {n} of {total}', { n: 2, total: 2 })}</span>
          <LangSwitch />
        </div>

        <div className="onboard__intro onboard__intro--small">
          <h1>{t('Make it yours')}</h1>
          <p>{t('A few optional extras. Turn on what you like, or skip.')}</p>
        </div>

        <ul className="choices">
          <Choice
            illo={<PayIllo />}
            title={t('Ask how I paid')}
            body={t('setup-pay')}
            where={t('You can change this any time in Settings.')}
            on={trackPayment}
            onToggle={() => setTrackPayment((v) => !v)}
          />
          <Choice
            illo={<PrivacyIllo />}
            title={t('Hide amounts in public')}
            body={t('setup-privacy')}
            where={t('You can change this any time in Settings.')}
            on={hideAmounts}
            onToggle={() => setHideAmounts((v) => !v)}
          />
          <Choice
            illo={<GoalIllo />}
            title={t('Save for something')}
            body={t('Pick a goal and watch your savings fill it up.')}
            where={t('You can add or change goals any time from Home.')}
            on={wantGoal}
            onToggle={() => setWantGoal((v) => !v)}
          >
            {wantGoal && (
              <div className="choice-goal">
                <div className="goal-ideas" role="group" aria-label={t('Ideas')}>
                  {['Holiday', 'New phone', 'Emergency fund'].map((idea) => (
                    <button
                      type="button"
                      key={idea}
                      className={`chip ${goalName === t(idea) ? 'is-on' : ''}`}
                      onClick={() => setGoalName(t(idea))}
                    >
                      {t(idea)}
                    </button>
                  ))}
                </div>
                <label className="field">
                  <span className="field-label">{t('What are you saving for?')}</span>
                  <input value={goalName} onChange={(e) => setGoalName(e.target.value)} placeholder={t('e.g. Holiday in Bali')} maxLength={40} />
                </label>
                <label className="field">
                  <span className="field-label">{t('Amount needed')}</span>
                  <div className="input-prefix">
                    <span aria-hidden="true">{currencySymbol()}</span>
                    <input
                      inputMode="numeric"
                      value={goalTarget}
                      onChange={(e) => (setGoalTarget(formatAmountInput(e.target.value)), setError(''))}
                      placeholder={getConfig().currency === 'IDR' ? '5.000.000' : '1,000'}
                    />
                  </div>
                </label>
              </div>
            )}
          </Choice>
          {installMode !== 'installed' && (
            <li className="choice-card">
              <InstallIllo />
              <div className="choice-card__text">
                <h2 className="choice-card__title">{t('Put Spendify on your home screen')}</h2>
                <p className="choice-card__body">{t('It opens like a normal app, works offline, and your data is safer.')}</p>
                <InstallHelp compact />
                <p className="choice-card__where">{t('You can also do this later from Settings.')}</p>
              </div>
            </li>
          )}
        </ul>

        {error && <p className="field-error">{error}</p>}

        <div className="onboard__actions">
          <button className="btn btn--primary btn--block" onClick={() => finish(true)}>
            {t('Start tracking')}
          </button>
          <button className="link-btn" onClick={() => finish(false)}>
            {t('Skip for now')}
          </button>
        </div>
      </div>
    );
  }

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
        <span className="onboard__step">{t('Step {n} of {total}', { n: 1, total: 2 })}</span>
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
            <span className="field-label">{t('Monthly take-home pay')}</span>
            <div className="input-prefix">
              <span aria-hidden="true">{currencySymbol()}</span>
              <input
                inputMode="numeric"
                value={salary}
                onChange={(e) => (setSalary(formatAmountInput(e.target.value)), setError(''))}
                placeholder={getConfig().currency === 'IDR' ? '5.000.000' : '2,000'}
              />
            </div>
            {income > 0 && amountInWords(income) && <span className="onboard__amount-words">{amountInWords(income)}</span>}
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

        <p className="muted small onboard__take-home">{t('take-home-hint')}</p>

        <PaydayPicker value={payday} onChange={setPayday} id="setup-payday" />

        <SplitSlider value={needsPercent} onChange={setNeedsPercent} income={income} />

        {error && <p className="field-error">{error}</p>}

        <button className="btn btn--primary btn--block" type="submit">
          {t('Next')}
        </button>
        <p className="onboard__fine">
          {income > 0
            ? t(payday === 1 ? '{spend} a month to spend, {save} to save. You can change this any time.' : 'payday-split', {
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

/** One optional setting on the setup screen: drawing, explanation, switch, and where to find it later. */
function Choice({ illo, title, body, where, on, onToggle, children }) {
  return (
    <li className={`choice-card ${on ? 'is-on' : ''}`}>
      {illo}
      <div className="choice-card__text">
        <div className="choice-card__head">
          <h2 className="choice-card__title">{title}</h2>
          <button type="button" role="switch" aria-checked={on} aria-label={title} className="switch" onClick={onToggle}>
            <span className="switch__knob" />
          </button>
        </div>
        <p className="choice-card__body">{body}</p>
        {children}
        <p className="choice-card__where">{where}</p>
      </div>
    </li>
  );
}
