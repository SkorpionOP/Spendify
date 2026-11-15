/* eslint-disable react-refresh/only-export-components -- the auto-backup hook lives with its screens */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, CloudDownload, CloudUpload, Copy, KeyRound, Loader2, Lock, Share2, X } from 'lucide-react';
import { backupDue, cloudAvailable, cloudBackup, listCloudBackups, OWNER_NAME, restoreCloudBackup } from '../lib/cloud';
import { deviceIdFor, newRecoveryCode, normalizeCode } from '../lib/vault';
import { dateTime, today } from '../lib/dates';
import { t } from '../lib/i18n';
import { useStore } from '../lib/store';
import { Sheet } from './Sheet';
import { useToast } from './Toasts';

/*
 * Automatic, encrypted backups to the app owner's Google Drive. See lib/cloud.js and lib/vault.js.
 * She agrees once (one tap, no sign-in). After that it runs by itself whenever the app is opened.
 */

const owner = () => OWNER_NAME || t('the app owner');
const kb = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

const ERRORS = {
  offline: 'cloud-err-offline',
  limited: 'cloud-err-limited',
  'not-configured': 'cloud-err-setup',
  'google-auth': 'cloud-err-setup',
  device: 'cloud-err-device',
  'drive-full': 'cloud-err-full',
  'wrong-code': 'cloud-err-code',
  damaged: 'cloud-err-damaged',
};
const explain = (err) => t(ERRORS[err?.code] || 'cloud-err-failed');

let running = false; // one backup at a time, across every screen

/** The settings for a phone that backs up with this code. */
const enabledCloud = async (code, lastAt = null) => ({ on: true, code, deviceId: await deviceIdFor(code), consentAt: Date.now(), lastAt, lastError: null, failingSince: null });

/** Runs the backup and records the result in settings. Returns true when it worked. */
function useRunBackup() {
  const { state, exportData, updateSettings } = useStore();
  const cloudRef = useRef(state.settings.cloud);
  useEffect(() => {
    cloudRef.current = state.settings.cloud;
  });
  return useCallback(
    async ({ onProgress } = {}) => {
      const cloud = cloudRef.current;
      if (running || !cloud?.on || !cloud.code) return false;
      running = true;
      try {
        const done = await cloudBackup({ getJson: exportData, code: cloud.code, date: today(), onProgress });
        updateSettings({ cloud: { ...cloudRef.current, lastAt: done.at, lastSize: done.size, lastError: null, failingSince: null } });
        return true;
      } catch (err) {
        const c = cloudRef.current;
        updateSettings({ cloud: { ...c, lastError: err?.code || 'failed', failingSince: c.failingSince || Date.now() } });
        throw err;
      } finally {
        running = false;
      }
    },
    [exportData, updateSettings]
  );
}

/** Mounted once in the app: backs up by itself when the app opens or comes back, if one is due. */
export function useAutoCloudBackup() {
  const { state, ready } = useStore();
  const run = useRunBackup();
  const due = ready && cloudAvailable() && backupDue(state.settings.cloud, state.savedAt);
  useEffect(() => {
    if (!due) return undefined;
    // Wait a moment so opening the app stays quick, then back up quietly
    const timer = setTimeout(() => run().catch(() => {}), 4000);
    return () => clearTimeout(timer);
  }, [due, run]);
  useEffect(() => {
    const onBack = () => document.visibilityState === 'visible' && navigator.onLine !== false && due && run().catch(() => {});
    window.addEventListener('online', onBack);
    document.addEventListener('visibilitychange', onBack);
    return () => {
      window.removeEventListener('online', onBack);
      document.removeEventListener('visibilitychange', onBack);
    };
  }, [due, run]);
}

/** Turns backups on for this phone: a new recovery code, and the first backup straight away. */
function useEnableCloud() {
  const { state, updateSettings } = useStore();
  return useCallback(async () => {
    const prev = state.settings.cloud;
    const cloud = await enabledCloud(prev?.code || newRecoveryCode(), prev?.lastAt || null);
    updateSettings({ cloud });
    return cloud;
  }, [state.settings.cloud, updateSettings]);
}

/* ---------- the one-time question on Home ---------- */

export function CloudOfferCard() {
  const { state, updateSettings } = useStore();
  const enable = useEnableCloud();
  const [code, setCode] = useState(null);
  const [now] = useState(() => Date.now());
  const cloud = state.settings.cloud;
  // "Not now" means not for 30 days
  const asked = cloud && (cloud.on || (cloud.declined && now - (cloud.askedAt || 0) < 30 * 864e5));
  if (!cloudAvailable() || state.expenses.length < 1 || (asked && !code)) return null;

  return (
    <>
      {!code && (
        <section className="nudge nudge--cloud" aria-labelledby="cloud-title">
          <button className="icon-btn icon-btn--sm nudge__close" onClick={() => updateSettings({ cloud: { declined: true, askedAt: Date.now() } })} aria-label={t('Not now')}>
            <X size={16} />
          </button>
          <h2 id="cloud-title" className="nudge__title">
            <Lock size={17} className="inline-icon" aria-hidden="true" /> {t('Back up automatically?')}
          </h2>
          <p className="nudge__body">{t('cloud-offer', { owner: owner() })}</p>
          <div className="nudge__actions">
            <button
              className="btn btn--primary btn--sm"
              onClick={async () => {
                const c = await enable();
                setCode(c.code);
              }}
            >
              <CloudUpload size={16} aria-hidden="true" /> {t('Yes, back up automatically')}
            </button>
            <button className="link-btn" onClick={() => updateSettings({ cloud: { declined: true, askedAt: Date.now() } })}>
              {t('Not now')}
            </button>
          </div>
        </section>
      )}
      {code && (
        <Sheet title={t('Your recovery code')} onClose={() => setCode(null)}>
          <RecoveryCode code={code} onDone={() => setCode(null)} first />
        </Sheet>
      )}
    </>
  );
}

/** Shows the code with Copy and Share, and what it is for. */
function RecoveryCode({ code, onDone, first = false }) {
  const toast = useToast();
  const run = useRunBackup();
  const started = useRef(false);
  // The first backup runs while she reads this
  useEffect(() => {
    if (!first || started.current) return;
    started.current = true;
    run().catch(() => {});
  }, [first, run]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast(t('Code copied'));
    } catch {
      toast(t('Couldn’t copy. Write the code down instead.'), { tone: 'warn' });
    }
  };
  const share = async () => {
    try {
      await navigator.share({ text: t('cloud-share-text', { code }) });
    } catch (err) {
      if (err?.name !== 'AbortError') copy();
    }
  };

  return (
    <div className="panel cloud-code">
      {first && (
        <p className="cloud-code__ok">
          <Check size={18} aria-hidden="true" /> {t('Automatic backup is on.')}
        </p>
      )}
      <p className="muted">{t('cloud-code-why', { owner: owner() })}</p>
      <p className="cloud-code__code" aria-label={`${t('Your recovery code')}: ${code}`}>
        {code.split('-').map((group, i) => (
          <span key={i} aria-hidden="true">
            {group}
          </span>
        ))}
      </p>
      <div className="btn-pair">
        <button className="btn btn--ghost" onClick={copy}>
          <Copy size={18} aria-hidden="true" /> {t('Copy')}
        </button>
        {typeof navigator !== 'undefined' && navigator.share ? (
          <button className="btn btn--ghost" onClick={share}>
            <Share2 size={18} aria-hidden="true" /> {t('Save it')}
          </button>
        ) : null}
      </div>
      <p className="muted small">{t('cloud-code-tip')}</p>
      <button className="btn btn--primary btn--block" onClick={onDone}>
        {t('Done')}
      </button>
    </div>
  );
}

/* ---------- Settings → Your data ---------- */

export function CloudSection() {
  const { state, updateSettings } = useStore();
  const toast = useToast();
  const run = useRunBackup();
  const enable = useEnableCloud();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [panel, setPanel] = useState(null); // 'code' | 'restore'
  const [opened] = useState(() => Date.now());
  if (!cloudAvailable()) return null;
  const cloud = state.settings.cloud;
  const on = !!cloud?.on;
  const failing = on && cloud.failingSince && opened - cloud.failingSince > 3 * 864e5;

  const now = async () => {
    setBusy(true);
    setProgress(0);
    try {
      if (!on) await enable();
      await run({ onProgress: setProgress });
      toast(t('Backed up to {owner}’s Google Drive', { owner: owner() }));
    } catch (err) {
      toast(explain(err), { tone: 'warn', duration: 7000 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="drive">
      <h3 className="drive__title">
        <Lock size={18} aria-hidden="true" /> {t('Automatic backup')}
      </h3>
      {on ? (
        <p className={`small ${failing ? 'cloud__warn' : 'muted'}`}>
          {cloud.lastAt ? t('Last backup: {when} ({size}).', { when: dateTime(cloud.lastAt), size: kb(cloud.lastSize || 0) }) : t('No backup yet.')}{' '}
          {cloud.lastError ? (failing ? t('Backups have been failing for a few days: {why}', { why: explain({ code: cloud.lastError }) }) : t('The last try didn’t work; it will try again.')) : ''}
        </p>
      ) : (
        <p className="muted small">{t('cloud-offer', { owner: owner() })}</p>
      )}

      <div className="btn-pair">
        <button className="btn btn--primary" onClick={now} disabled={busy}>
          {busy ? <Loader2 size={18} className="spin" aria-hidden="true" /> : <CloudUpload size={18} aria-hidden="true" />}
          {busy ? (progress > 0 && progress < 1 ? `${Math.round(progress * 100)}%` : t('Backing up…')) : on ? t('Back up now') : t('Turn on automatic backup')}
        </button>
        <button className="btn btn--ghost" onClick={() => setPanel('restore')}>
          <CloudDownload size={18} aria-hidden="true" /> {t('Restore a backup')}
        </button>
      </div>
      {on && (
        <div className="cloud__links">
          <button className="link-btn" onClick={() => setPanel('code')}>
            <KeyRound size={15} className="inline-icon" aria-hidden="true" /> {t('Show recovery code')}
          </button>
          <button
            className="link-btn"
            onClick={() => {
              if (!window.confirm(t('Stop automatic backups? Backups already saved stay in the Drive.'))) return;
              updateSettings({ cloud: { ...cloud, on: false } });
            }}
          >
            {t('Turn off')}
          </button>
        </div>
      )}

      {panel === 'code' && (
        <Sheet title={t('Your recovery code')} onClose={() => setPanel(null)}>
          <RecoveryCode code={cloud.code} onDone={() => setPanel(null)} />
        </Sheet>
      )}
      {panel === 'restore' && (
        <Sheet title={t('Restore a backup')} onClose={() => setPanel(null)}>
          <CloudRestore initialCode={cloud?.code || ''} onDone={() => setPanel(null)} />
        </Sheet>
      )}
    </div>
  );
}

/* ---------- restore with a recovery code (Settings, and a new phone during setup) ---------- */

export function CloudRestore({ initialCode = '', onDone }) {
  const { state, importData, updateSettings } = useStore();
  const toast = useToast();
  const [code, setCode] = useState(initialCode);
  const [files, setFiles] = useState(null);
  const [busy, setBusy] = useState(false);
  const valid = !!normalizeCode(code);

  const find = async (e) => {
    e.preventDefault();
    if (!valid) return toast(t('cloud-err-code'), { tone: 'warn' });
    setBusy(true);
    try {
      setFiles(await listCloudBackups(code));
    } catch (err) {
      toast(explain(err), { tone: 'warn', duration: 7000 });
    } finally {
      setBusy(false);
    }
  };

  const restore = async (f) => {
    if (state.expenses.length && !window.confirm(t('Replace what’s in the app with this backup? A copy of the current data is kept, so you can switch back.'))) return;
    setBusy(true);
    try {
      const json = await restoreCloudBackup(code, f.id);
      await importData(json);
      // Keep backing up into the same folder with the same code
      updateSettings({ cloud: await enabledCloud(normalizeCode(code), Date.parse(f.modifiedTime) || null) });
      toast(t('Backup restored'));
      onDone?.();
    } catch (err) {
      toast(err?.code ? explain(err) : err.message || t('That file could not be read.'), { tone: 'warn', duration: 7000 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="panel" onSubmit={find}>
      <p className="muted">{t('cloud-restore-intro', { owner: owner() })}</p>
      <label className="field">
        <span className="field-label">{t('Recovery code')}</span>
        <input
          className="cloud-code__input"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setFiles(null);
          }}
          placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
        />
      </label>
      {!files && (
        <button className="btn btn--primary btn--block" type="submit" disabled={!valid || busy}>
          {busy ? <Loader2 size={18} className="spin" aria-hidden="true" /> : <CloudDownload size={18} aria-hidden="true" />} {t('Find my backups')}
        </button>
      )}
      {files && (
        <ul className="snaps">
          {files.length === 0 && <li className="muted">{t('No backups found for this code.')}</li>}
          {files.map((f) => (
            <li key={f.id}>
              <span>
                <strong>{dateTime(Date.parse(f.modifiedTime))}</strong>
                <span className="snaps__meta">{kb(f.size)}</span>
              </span>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => restore(f)} disabled={busy}>
                {busy ? <Loader2 size={16} className="spin" aria-hidden="true" /> : t('Restore')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
