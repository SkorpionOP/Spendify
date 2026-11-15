import { Link } from 'react-router-dom';
import { BellRing, ChevronRight, HandCoins } from 'lucide-react';
import { today } from '../lib/dates';
import { money } from '../lib/format';
import { t, tn } from '../lib/i18n';
import { debtSummary } from '../lib/iou';
import { useStore } from '../lib/store';

/** Home: a one-line look at open IOUs. Hidden when there are none. */
export function IouCard() {
  const { state } = useStore();
  const sum = debtSummary(state.debts, today());
  if (!sum.open) return null;
  return (
    <Link to="/iou" className="iou-card" aria-label={t('IOUs')}>
      <span className="iou-card__icon" aria-hidden="true">
        <HandCoins size={20} />
      </span>
      <span className="iou-card__body">
        <span className="iou-card__nums private-num">
          {sum.owedToMe > 0 && (
            <span>
              <span className="iou-card__label">{t('Owed to you')}</span> <strong className="is-in">{money(sum.owedToMe)}</strong>
            </span>
          )}
          {sum.iOwe > 0 && (
            <span>
              <span className="iou-card__label">{t('You owe')}</span> <strong className="is-out">{money(sum.iOwe)}</strong>
            </span>
          )}
        </span>
        {(sum.overdue > 0 || sum.dueSoon > 0) && (
          <span className={`iou-card__note ${sum.overdue ? 'is-bad' : ''}`}>
            <BellRing size={13} aria-hidden="true" />{' '}
            {sum.overdue ? tn(sum.overdue, '{n} IOU is past its due date', '{n} IOUs are past their due date') : tn(sum.dueSoon, '{n} IOU is due soon', '{n} IOUs are due soon')}
          </span>
        )}
      </span>
      <ChevronRight size={18} aria-hidden="true" className="iou-card__go" />
    </Link>
  );
}
