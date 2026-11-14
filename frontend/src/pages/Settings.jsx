import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Download, Eye, EyeOff, History as HistoryIcon, Share, ShieldCheck, ShieldAlert, Upload } from 'lucide-react';
import { planFor, useStore } from '../lib/store';
import { currentMonth, dateTime } from '../lib/dates';
import { amountToInput, currencySymbol, formatAmountInput, parseAmountInput } from '../lib/format';
import { CURRENCIES, LANGS, t, tn } from '../lib/i18n';
import { canShareFiles, downloadBackup, shareBackup } from '../lib/backup';
import { isPersisted, listSnapshots, requestPersistence } from '../lib/persist';
import { useInstall } from '../lib/install';
import { SplitSlider } from '../components/SplitSlider';
import { RepeatsPanel, TopupPanel } from '../components/MoneyTools';
import { InstallHelp } from '../components/Nudges';
import { useToast } from '../components/Toasts';

const ago = (ms, now) => {
  if (!ms) return t('never');
  const d = Math.floor((now - ms) / 864e5);
  if (d <= 0) return t('today');
  if (d === 1) return t('yesterday');
  return t('{n} days ago', { n: d });
};

export default function Settings() {
  const { state, updateProfile, updatePlan, updateSettings } = useStore();
  const toast = useToast();
  const plan = planFor(state, currentMonth());
  const { mode: installMode } = useInstall();

  const [name, setName] = useState(state.profile?.name || '');
  const [salary, setSalary] = useState(() => amountToInput(plan.salary || ''));
  const [needsPercent, setNeedsPercent] = useState(plan.needsPercent);

  const income = parseAmountInput(salary) || 0;
  const planChanged = income !== plan.salary || needsPercent !== plan.needsPercent;

  const savePlan = (e) => {
    e.preventDefault();
    if (income <= 0) return toast(t('Enter an income above zero.'), { tone: 'warn' });
    updatePlan({ salary: income, needsPercent });
    toast(t('Budget updated for this month onward'));
  };

  return (
    <div className="page settings">
      <header className="page__head">
        <Link to="/" className="icon-btn settings__back" aria-label={t('Back to home')}>
          <ChevronLeft size={22} />
        </Link>
        <h1>{t('Settings')}</h1>
      </header>

      <BackupSection />

      {installMode !== 'installed' && (
        <section className="card section">
          <h2>{t('Install the app')}</h2>
          <p className="muted">
            {t('Adds Spendify to your home screen. It opens full screen, works offline, and your data is safer from automatic clean-ups.')}
          </p>
          <InstallHelp />
        </section>
      )}

      <section className="card section">
        <h2>{t('You')}</h2>
        <label className="field">
          <span className="field-label">{t('Name')}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name.trim() && name.trim() !== state.profile?.name && (updateProfile({ name: name.trim() }), toast(t('Name saved')))}
          />
        </label>

        <div className="field">
          <span className="field-label" id="lang-label">
            {t('Language')}
          </span>
          <div className="segmented segmented--2" role="radiogroup" aria-labelledby="lang-label">
            {LANGS.map((l) => (
              <button
                key={l.code}
                type="button"
                role="radio"
                lang={l.code}
                aria-checked={state.settings.lang === l.code}
                className={state.settings.lang === l.code ? 'is-on' : ''}
                onClick={() => updateSettings({ lang: l.code })}
              >
                {l.name}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span className="field-label">{t('Currency')}</span>
          <select value={state.settings.currency} onChange={(e) => updateSettings({ currency: e.target.value })}>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          <span className="muted small">
            {t('Changing the currency only changes the symbol. Amounts you already entered stay the same numbers.')}
          </span>
        </label>

        <div className="field">
          <span className="field-label" id="theme-label">
            {t('Appearance')}
          </span>
          <div className="segmented" role="radiogroup" aria-labelledby="theme-label">
            {[
              ['system', 'Automatic'],
              ['light', 'Light'],
              ['dark', 'Dark'],
            ].map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={state.settings.theme === v}
                className={state.settings.theme === v ? 'is-on' : ''}
                onClick={() => updateSettings({ theme: v })}
              >
                {t(label)}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">{t('Privacy')}</span>
          <button
            type="button"
            className={`btn btn--ghost btn--block ${state.settings.hideAmounts ? 'is-on' : ''}`}
            onClick={() => updateSettings({ hideAmounts: !state.settings.hideAmounts })}
            aria-pressed={!!state.settings.hideAmounts}
          >
            {state.settings.hideAmounts ? <EyeOff size={18} /> : <Eye size={18} />}
            {state.settings.hideAmounts ? t('Amounts are hidden') : t('Hide amounts in public')}
          </button>
          <span className="muted small">
            {t('Blurs numbers across the app so people nearby cannot see your finances.')}
          </span>
        </div>
      </section>

      <form className="card section" onSubmit={savePlan}>
        <h2>{t('Monthly plan')}</h2>
        <p className="muted">{t('Changes apply from this month. Earlier months keep the plan they had.')}</p>
        <label className="field">
          <span className="field-label">{t('Monthly income')}</span>
          <div className="input-prefix">
            <span aria-hidden="true">{currencySymbol()}</span>
            <input inputMode="numeric" value={salary} onChange={(e) => setSalary(formatAmountInput(e.target.value))} />
          </div>
        </label>
        <SplitSlider value={needsPercent} onChange={setNeedsPercent} income={income} />
        <button className="btn btn--primary btn--block" type="submit" disabled={!planChanged}>
          {t('Save plan')}
        </button>
      </form>

      <section className="card section">
        <h2>{t('Monthly repeats')}</h2>
        <RepeatsPanel />
      </section>

      <section className="card section">
        <h2>{t('Extra money this month')}</h2>
        <TopupPanel />
      </section>

      <DangerSection />

      <p className="settings__foot">{t('Spendify works offline. Nothing you enter ever leaves this device unless you save a backup.')}</p>
    </div>
  );
}

/* ---------- backup & safety ---------- */

function BackupSection() {
  const { state, exportData, markBackedUp, importData, restoreSnapshot } = useStore();
  const toast = useToast();
  const [persisted, setPersisted] = useState(null);
  const [snaps, setSnaps] = useState([]);
  const [showSnaps, setShowSnaps] = useState(false);
  const [now] = useState(() => Date.now());
  const share = canShareFiles();

  useEffect(() => {
    isPersisted().then(setPersisted);
  }, []);

  useEffect(() => {
    if (showSnaps) listSnapshots().then(setSnaps);
  }, [showSnaps, state.savedAt]);

  const save = async (viaShare) => {
    const json = exportData();
    const ok = viaShare ? await shareBackup(json) : (downloadBackup(json), true);
    if (ok) {
      markBackedUp();
      toast(t('Backup saved'));
    }
  };

  const restoreFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (state.expenses.length && !window.confirm(t('Replace what’s in the app with this backup? A copy of the current data is kept, so you can switch back.')))
      return;
    try {
      await importData(await file.text());
      toast(t('Backup restored'));
    } catch (err) {
      toast(err.message || t('That file could not be read.'), { tone: 'warn' });
    }
  };

  const restoreCopy = async (s) => {
    if (!window.confirm(t('Go back to the copy from {when} ({n} expenses)? Your current data is kept as another copy.', { when: dateTime(s.at), n: s.count })))
      return;
    try {
      await restoreSnapshot(s.id);
      toast(t('Earlier copy restored'));
    } catch (err) {
      toast(err.message, { tone: 'warn' });
    }
  };

  const stale = state.expenses.length > 0 && (!state.lastBackupAt || now - state.lastBackupAt > 7 * 864e5);

  return (
    <section className="card section">
      <h2>{t('Your data')}</h2>

      <ul className="safety">
        <li className={persisted ? 'is-good' : 'is-warn'}>
          {persisted ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}
          <span>
            {persisted ? (
              t('Protected: this browser won’t clear Spendify to free up space.')
            ) : (
              <>
                {t('Not yet protected from automatic clean-up.')}{' '}
                <button
                  className="link-btn"
                  onClick={async () => {
                    const ok = await requestPersistence();
                    setPersisted(ok);
                    toast(ok ? t('Storage protected') : t('Your browser decides this on its own. Installing the app usually helps.'), {
                      tone: ok ? 'plain' : 'warn',
                    });
                  }}
                >
                  {t('Protect now')}
                </button>
              </>
            )}
          </span>
        </li>
        <li className="is-good">
          <ShieldCheck size={18} />
          <span>{t('Saved twice on this device, with a daily copy for the last 14 days.')}</span>
        </li>
        <li className={stale ? 'is-warn' : 'is-good'}>
          {stale ? <ShieldAlert size={18} /> : <ShieldCheck size={18} />}
          <span>{t('Last backup file: {when}.', { when: ago(state.lastBackupAt, now) })}</span>
        </li>
      </ul>

      <p className="muted">
        {t('A backup file is the only thing that survives losing or resetting this phone. Save one now and then to Google Drive, WhatsApp or Files.')}
      </p>

      <div className="btn-pair">
        {share ? (
          <button className="btn btn--primary" onClick={() => save(true)}>
            <Share size={18} /> {t('Save backup')}
          </button>
        ) : (
          <button className="btn btn--primary" onClick={() => save(false)}>
            <Download size={18} /> {t('Download backup')}
          </button>
        )}
        <label className="btn btn--ghost" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.querySelector('input').click()}>
          <Upload size={18} /> {t('Restore from file')}
          <input type="file" accept="application/json,.json" onChange={restoreFile} hidden />
        </label>
      </div>
      {share && (
        <button className="link-btn" onClick={() => save(false)}>
          {t('Download the file instead')}
        </button>
      )}

      <button className="link-btn" onClick={() => setShowSnaps((v) => !v)} aria-expanded={showSnaps}>
        <HistoryIcon size={15} className="inline-icon" /> {showSnaps ? t('Hide earlier copies') : t('Go back to an earlier copy')}
      </button>
      {showSnaps && (
        <ul className="snaps">
          {snaps.length === 0 && <li className="muted">{t('No copies yet. One is saved each day you use the app.')}</li>}
          {snaps.map((s) => (
            <li key={s.id}>
              <span>
                <strong>{dateTime(s.at)}</strong>
                <span className="snaps__meta">
                  {tn(s.count, '{n} expense', '{n} expenses')}
                  {s.reason ? `, ${t(s.reason)}` : ''}
                </span>
              </span>
              <button className="btn btn--ghost btn--sm" onClick={() => restoreCopy(s)}>
                {t('Restore')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------- reset ---------- */

function DangerSection() {
  const { resetAll } = useStore();
  const toast = useToast();
  const [confirm, setConfirm] = useState('');
  const word = t('delete-word');
  return (
    <section className="card section danger-zone">
      <h2>{t('Start over')}</h2>
      <p className="muted">
        {t('Clears every expense and your plan. A copy is kept under “Go back to an earlier copy” in case you change your mind.')}
      </p>
      <label className="field">
        <span className="field-label">{t('Type “delete” to confirm')}</span>
        <input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
      </label>
      <button
        className="btn btn--danger"
        disabled={confirm.trim().toLowerCase() !== word}
        onClick={async () => {
          await resetAll();
          toast(t('All data cleared'));
        }}
      >
        {t('Delete all data')}
      </button>
    </section>
  );
}
