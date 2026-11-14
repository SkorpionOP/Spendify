import { useEffect } from 'react';
import { X } from 'lucide-react';
import { t } from '../lib/i18n';

/** Bottom sheet on phones, centered dialog on larger screens. */
export function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, [onClose]);

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="gsheet-title">
        <div className="sheet__grip" aria-hidden="true" />
        <header className="sheet__head">
          <h2 id="gsheet-title">{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('Close')}>
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
