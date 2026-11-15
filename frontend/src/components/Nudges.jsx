import { useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { useInstall } from '../lib/install';
import { useStore } from '../lib/store';
import { canShareFiles, downloadBackup, shareBackup } from '../lib/backup';
import { useToast } from './Toasts';
import { ordinal, t, tn } from '../lib/i18n';
import { periodPreview } from '../lib/dates';
import { PaydayPicker } from './PaydayPicker';

const DAY = 864e5;

const dismissedUntil = (key) => {
  try {
    return Number(localStorage.getItem(`spendify:dismiss:${key}`)) || 0;
  } catch {
    return 0;
  }
};
const dismissFor = (key, ms) => {
  try {
    localStorage.setItem(`spendify:dismiss:${key}`, String(Date.now() + ms));
  } catch {
    /* ignore */
  }
};

/** Asked once on Home for people who set up before the payday question was in setup. */
export function PaydayCard() {
  const { state, updateSettings } = useStore();
  const toast = useToast();
  const [day, setDay] = useState(25);
  if (!state.profile || state.settings.paydayAsked) return null;

  const save = () => {
    updateSettings({ payday: day, paydayAsked: true });
    toast(day === 1 ? t('Budget months now follow the calendar') : t('payday-saved', { ord: ordinal(day), period: periodPreview(day) }));
  };

  return (
    <section className="nudge nudge--payday" aria-labelledby="payday-title">
      <button
        className="icon-btn icon-btn--sm nudge__close"
        onClick={() => updateSettings({ paydayAsked: true })}
        aria-label={t('Not now')}
      >
        <X size={16} />
      </button>
      <h2 id="payday-title" className="nudge__title">
        {t('payday-card-title')}
      </h2>
      <p className="nudge__body">{t('payday-card-body')}</p>
      <PaydayPicker value={day} onChange={setDay} id="home-payday" />
      <button className="btn btn--primary btn--sm" onClick={save}>
        {t('Save payday')}
      </button>
    </section>
  );
}

/** Step-by-step install instructions; also used in Settings. */
export function InstallHelp({ compact = false }) {
  const { mode, install } = useInstall();
  const toast = useToast();

  if (mode === 'installed') return <p className="muted">{t('Spendify is installed on this device.')}</p>;

  if (mode === 'prompt')
    return (
      <button
        className={`btn btn--primary ${compact ? '' : 'btn--block'}`}
        onClick={async () => (await install()) && toast(t('Installed. Open Spendify from your home screen.'))}
      >
        <Smartphone size={18} /> {t('Install app')}
      </button>
    );

  const steps =
    mode === 'ios'
      ? ['Tap the Share button in Safari’s toolbar.', 'Scroll down and tap Add to Home Screen.', 'Tap Add.']
      : mode === 'ios-other'
        ? ['Tap the Share button (or open this page in Safari).', 'Tap Add to Home Screen, then Add.']
        : ['Open your browser’s menu.', 'Tap Install app or Add to Home screen.'];

  return (
    <ol className="steps">
      {steps.map((k) => (
        <li key={k}>
          <RichText text={t(k)} />
        </li>
      ))}
    </ol>
  );
}

/** Renders <b>…</b> and an {icon} placeholder from translated strings, without innerHTML. */
function RichText({ text }) {
  return text.split(/(<b>.*?<\/b>|\{icon\})/).map((part, i) => {
    if (part === '{icon}') return <Share key={i} size={15} aria-hidden="true" className="inline-icon" />;
    const m = part.match(/^<b>(.*)<\/b>$/);
    return m ? <strong key={i}>{m[1]}</strong> : part;
  });
}

export function InstallCard() {
  const { mode } = useInstall();
  const [hidden, setHidden] = useState(() => dismissedUntil('install') > Date.now());
  if (mode === 'installed' || hidden) return null;

  return (
    <section className="nudge" aria-labelledby="install-title">
      <button
        className="icon-btn icon-btn--sm nudge__close"
        onClick={() => (dismissFor('install', 14 * DAY), setHidden(true))}
        aria-label={t('Hide for now')}
      >
        <X size={16} />
      </button>
      <h2 id="install-title" className="nudge__title">
        {t('Put Spendify on your home screen')}
      </h2>
      <p className="nudge__body">{t('It opens like a normal app, works offline, and your phone is less likely to clear its data.')}</p>
      <InstallHelp compact />
    </section>
  );
}

export function BackupCard() {
  const { state, exportData, markBackedUp } = useStore();
  const toast = useToast();
  const [hidden, setHidden] = useState(() => dismissedUntil('backup') > Date.now());
  const [now] = useState(() => Date.now());

  const count = state.expenses.length;
  const last = state.lastBackupAt;
  const due = count >= 5 && (!last || now - last > 7 * DAY);
  if (!due || hidden) return null;

  const share = canShareFiles();
  const run = async () => {
    const json = await exportData();
    const ok = share ? await shareBackup(json) : (downloadBackup(json), true);
    if (ok) {
      markBackedUp();
      toast(t('Backup saved'));
    }
  };

  return (
    <section className="nudge nudge--backup" aria-labelledby="backup-title">
      <button
        className="icon-btn icon-btn--sm nudge__close"
        onClick={() => (dismissFor('backup', 3 * DAY), setHidden(true))}
        aria-label={t('Remind me in 3 days')}
      >
        <X size={16} />
      </button>
      <h2 id="backup-title" className="nudge__title">
        {last ? t('Time for a backup') : t('Keep a copy somewhere safe')}
      </h2>
      <p className="nudge__body">
        {tn(count, '{n} expenses live only on this phone.', '{n} expenses live only on this phone.')}{' '}
        {share ? t('Save a copy to Google Drive, WhatsApp or Files.') : t('Download a copy to keep somewhere safe.')}
      </p>
      <button className="btn btn--ghost btn--sm" onClick={run}>
        {share ? <Share size={16} /> : <Download size={16} />} {share ? t('Save a backup') : t('Download backup')}
      </button>
    </section>
  );
}
