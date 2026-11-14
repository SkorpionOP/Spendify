import { today } from './dates';

const fileName = () => `spendify-backup-${today()}.json`;

export const canShareFiles = () => {
  try {
    const f = new File(['{}'], 'x.json', { type: 'application/json' });
    return !!navigator.canShare?.({ files: [f] });
  } catch {
    return false;
  }
};

export const downloadBackup = (json) => {
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

/**
 * Opens the phone's share sheet so the backup can go to Google Drive, WhatsApp
 * ("Message yourself"), email, Files, etc. Returns false if the user cancelled.
 */
export const shareBackup = async (json) => {
  const file = new File([json], fileName(), { type: 'application/json' });
  try {
    await navigator.share({ files: [file], title: 'Spendify backup' });
    return true;
  } catch (e) {
    if (e?.name === 'AbortError') return false;
    // Some browsers refuse JSON in share; fall back to download.
    downloadBackup(json);
    return true;
  }
};
