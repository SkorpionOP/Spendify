/* eslint-disable react-refresh/only-export-components -- the receipt hook lives with the view that uses it */
import { useEffect, useState } from 'react';
import { Download, PencilLine, Receipt, Repeat, Trash2, X } from 'lucide-react';
import { category as catMeta } from '../lib/categories';
import { dateTime, parseISO } from '../lib/dates';
import { money } from '../lib/format';
import { catName, getConfig, t } from '../lib/i18n';
import { payName } from '../lib/payments';
import { getReceipt } from '../lib/persist';
import { useStore } from '../lib/store';
import { CategoryIcon } from './CategoryIcon';

/** An object URL for a stored receipt photo, or null while loading / when there is none. */
export function useReceiptUrl(id) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!id) return undefined;
    let made = null;
    let alive = true;
    getReceipt(id).then((blob) => {
      if (!alive || !blob) return;
      made = URL.createObjectURL(blob);
      setUrl(made);
    });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
      setUrl(null);
    };
  }, [id]);
  return url;
}

const fullDate = (iso) =>
  parseISO(iso).toLocaleDateString(getConfig().locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/** The receipt photo, full screen. Tap anywhere or ✕ to close. */
function Lightbox({ url, name, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={t('Receipt photo')} onClick={onClose}>
      <img src={url} alt={t('Receipt photo')} />
      <div className="lightbox__bar" onClick={(e) => e.stopPropagation()}>
        <a className="btn btn--ghost btn--sm" href={url} download={name}>
          <Download size={16} aria-hidden="true" /> {t('Save photo')}
        </a>
        <button type="button" className="icon-btn" onClick={onClose} aria-label={t('Close')}>
          <X size={22} />
        </button>
      </div>
    </div>
  );
}

/**
 * Everything about one expense, read-only, with Edit and Delete. Opened by tapping it in a list.
 * Reads the live expense from the store, so it shows the changes right after an edit.
 */
export function ExpenseDetail({ id, onClose, onEdit, onDelete }) {
  const { state } = useStore();
  const e = state.expenses.find((x) => x.id === id);
  const photo = useReceiptUrl(e?.receiptId);
  const [big, setBig] = useState(false);

  // Deleted (from here or elsewhere): nothing to show
  useEffect(() => {
    if (!e) onClose();
  }, [e, onClose]);

  useEffect(() => {
    const onKey = (ev) => ev.key === 'Escape' && !big && onClose();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, [onClose, big]);

  if (!e) return null;
  const c = catMeta(e.category);
  const rule = e.recurringId ? state.recurring.find((r) => r.id === e.recurringId) : null;
  const checkin = e.checkinId ? (state.checkins || []).find((x) => x.id === e.checkinId) : null;
  const title = e.note || catName(e.category);
  const itemsTotal = (e.items || []).reduce((s, it) => s + (it.amount || 0), 0);

  const rows = [
    [t('Category'), catName(e.category)],
    [t('Date'), fullDate(e.date)],
    e.merchant && e.merchant !== e.note ? [t('Place'), e.merchant] : null,
    e.pay ? [t('Paid with'), payName(e.pay)] : null,
    rule ? [t('Monthly repeat'), `${rule.note || catName(rule.category)}, ${rule.mandatory !== false ? t('Mandatory') : t('Flexible')}`] : null,
    e.recurringId && !rule ? [t('Monthly repeat'), t('Repeat removed')] : null,
    checkin ? [t('Daily check-in'), checkin.name] : null,
    e.createdAt ? [t('Added'), dateTime(e.createdAt)] : null,
  ].filter(Boolean);

  return (
    <div className="scrim" onMouseDown={(ev) => ev.target === ev.currentTarget && onClose()}>
      <div className="sheet detail" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <div className="sheet__grip" aria-hidden="true" />
        <header className="entry__head">
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('Close')}>
            <X size={22} />
          </button>
          <h2>{t('Expense')}</h2>
          <span className="entry__spacer" />
        </header>

        <div className="detail__hero">
          <span className="detail__icon" style={{ '--cat': c.color }} aria-hidden="true">
            <CategoryIcon name={e.category} size={28} color={c.color} />
          </span>
          <p className="detail__amount private-num">{money(e.amount, { precise: true })}</p>
          <p id="detail-title" className="detail__title">
            {title}
            {e.recurringId && <Repeat size={14} className="inline-icon" aria-label={t('Monthly repeat')} />}
          </p>
        </div>

        <dl className="detail__rows">
          {rows.map(([k, v]) => (
            <div key={k} className="detail__row">
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>

        {e.items?.length > 0 && (
          <section className="detail__items" aria-label={t('Items')}>
            <h3>{t('Items')}</h3>
            <ul className="private-num">
              {e.items.map((it, i) => (
                <li key={i}>
                  <span>{it.name}</span>
                  {it.amount != null && <span>{money(it.amount, { precise: true })}</span>}
                </li>
              ))}
            </ul>
            {itemsTotal > 0 && Math.round(itemsTotal) !== Math.round(e.amount) && (
              <p className="muted small">{t('Items add up to {amount}; the total includes tax, fees or discounts.', { amount: money(itemsTotal) })}</p>
            )}
          </section>
        )}

        {e.receiptId && (
          <section className="detail__receipt" aria-label={t('Receipt photo')}>
            {photo ? (
              <button type="button" className="detail__photo" onClick={() => setBig(true)} aria-label={t('Open receipt photo')}>
                <img src={photo} alt={t('Receipt photo')} />
              </button>
            ) : (
              <p className="muted small">
                <Receipt size={14} aria-hidden="true" /> {t('The receipt photo isn’t on this phone.')}
              </p>
            )}
          </section>
        )}

        <div className="detail__actions">
          <button type="button" className="btn btn--ghost" onClick={() => onDelete(e.id)}>
            <Trash2 size={18} aria-hidden="true" /> {t('Delete')}
          </button>
          <button type="button" className="btn btn--primary" onClick={() => onEdit(e)} autoFocus>
            <PencilLine size={18} aria-hidden="true" /> {t('Edit')}
          </button>
        </div>
      </div>
      {big && photo && <Lightbox url={photo} name={`receipt-${e.date}.jpg`} onClose={() => setBig(false)} />}
    </div>
  );
}
