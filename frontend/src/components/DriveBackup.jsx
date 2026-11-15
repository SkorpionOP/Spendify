/* eslint-disable react-refresh/only-export-components -- the hook and the section that uses it live together */
import { useCallback, useEffect, useState } from 'react';
import { CloudDownload, CloudUpload, Loader2 } from 'lucide-react';
import { backupToDrive, disconnectDrive, driveBackups, fetchDriveBackup, preloadDrive } from '../lib/drive';
import { dateTime, today } from '../lib/dates';
import { t } from '../lib/i18n';
import { useStore } from '../lib/store';
import { useToast } from './Toasts';

/* Backups in her own Google Drive: one tap, straight from this phone to Google. See lib/drive.js. */

const MESSAGES = {
  offline: 'drive-err-offline',
  popup: 'drive-err-popup',
  denied: 'drive-err-denied',
  scope: 'drive-err-scope',
  auth: 'drive-err-auth',
  full: 'drive-err-full',
};
// "cancelled" (she closed Google's window) needs no message
const explain = (err) => (err?.code === 'cancelled' ? null : t(MESSAGES[err?.code] || 'drive-err-failed'));

const kb = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** { drive, busy, backup() } where drive = { email, lastAt } once she has connected. */
export function useDriveBackup() {
  const { state, exportData, markBackedUp, updateSettings } = useStore();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const drive = state.settings.drive || null;
  const hint = drive?.email || '';

  // Have Google's sign-in script ready before she taps, so the popup opens at once
  useEffect(() => {
    preloadDrive().catch(() => {});
  }, []);

  const backup = useCallback(async () => {
    if (busy) return false;
    setBusy(true);
    try {
      const done = await backupToDrive({ getJson: exportData, date: today(), hint });
      updateSettings({ drive: { email: done.email, lastAt: done.at } });
      markBackedUp();
      toast(done.email ? t('Backed up to Google Drive ({email})', { email: done.email }) : t('Backed up to Google Drive'));
      return true;
    } catch (err) {
      const msg = explain(err);
      if (msg) toast(msg, { tone: 'warn', duration: 7000 });
      return false;
    } finally {
      setBusy(false);
    }
  }, [busy, exportData, hint, markBackedUp, toast, updateSettings]);

  return { drive, hint, busy, backup };
}

/** Settings → Your data: connect, back up now, restore from Drive, disconnect. */
export function DriveSection() {
  const { state, importData, updateSettings } = useStore();
  const toast = useToast();
  const { drive, hint, busy, backup } = useDriveBackup();
  const [files, setFiles] = useState(null); // null = closed, [] = none found
  const [loading, setLoading] = useState(false);

  const showFiles = async () => {
    if (files) return setFiles(null);
    setLoading(true);
    try {
      setFiles(await driveBackups({ hint }));
    } catch (err) {
      const msg = explain(err);
      if (msg) toast(msg, { tone: 'warn', duration: 7000 });
    } finally {
      setLoading(false);
    }
  };

  const restore = async (file) => {
    if (state.expenses.length && !window.confirm(t('Replace what’s in the app with this backup? A copy of the current data is kept, so you can switch back.'))) return;
    setLoading(true);
    try {
      await importData(await fetchDriveBackup(file.id, { hint }));
      // The backup carries the Drive details from when it was made; keep the current connection
      if (drive) updateSettings({ drive });
      setFiles(null);
      toast(t('Backup restored'));
    } catch (err) {
      toast(err?.code ? explain(err) || t('drive-err-failed') : err.message || t('That file could not be read.'), { tone: 'warn', duration: 7000 });
    } finally {
      setLoading(false);
    }
  };

  const disconnect = async () => {
    await disconnectDrive();
    updateSettings({ drive: null });
    setFiles(null);
    toast(t('Google Drive disconnected. Your backup files are still in your Drive.'));
  };

  return (
    <div className="drive">
      <h3 className="drive__title">
        <CloudUpload size={18} aria-hidden="true" /> Google Drive
      </h3>
      {drive ? (
        <p className="muted small">
          {drive.email ? t('Connected as {email}.', { email: drive.email }) : t('Connected.')}{' '}
          {drive.lastAt ? t('Last Drive backup: {when}.', { when: dateTime(drive.lastAt) }) : ''}
        </p>
      ) : (
        <p className="muted small">{t('drive-intro')}</p>
      )}

      <div className="btn-pair">
        <button className="btn btn--primary" onClick={backup} disabled={busy}>
          {busy ? <Loader2 size={18} className="spin" aria-hidden="true" /> : <CloudUpload size={18} aria-hidden="true" />}
          {busy ? t('Backing up…') : drive ? t('Back up now') : t('Back up to Google Drive')}
        </button>
        <button className="btn btn--ghost" onClick={showFiles} disabled={loading}>
          {loading ? <Loader2 size={18} className="spin" aria-hidden="true" /> : <CloudDownload size={18} aria-hidden="true" />}
          {files ? t('Hide Drive backups') : t('Restore from Drive')}
        </button>
      </div>

      {files && (
        <ul className="snaps">
          {files.length === 0 && <li className="muted">{t('No backups in this Google Drive yet.')}</li>}
          {files.map((f) => (
            <li key={f.id}>
              <span>
                <strong>{dateTime(Date.parse(f.modifiedTime))}</strong>
                <span className="snaps__meta">{kb(f.size)}</span>
              </span>
              <button className="btn btn--ghost btn--sm" onClick={() => restore(f)} disabled={loading}>
                {t('Restore')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {drive && (
        <button className="link-btn" onClick={disconnect}>
          {t('Disconnect Google Drive')}
        </button>
      )}
    </div>
  );
}
