import { useState } from 'react';
import { ArrowDown, ArrowUp, PartyPopper, PiggyBank, Plus, Target, Trash2 } from 'lucide-react';
import { goalProgress } from '../lib/money';
import { useStore } from '../lib/store';
import { amountToInput, currencySymbol, formatAmountInput, money, parseAmountInput } from '../lib/format';
import { t } from '../lib/i18n';
import { useToast } from './Toasts';

/** Savings, with each goal's progress underneath. Replaces the separate savings tile and goal list on Home. */
export function SavingsCard({ savings, carriedIn, onEdit }) {
  const { state } = useStore();
  const { list } = goalProgress(state.goals, savings);
  return (
    <section className="savings" aria-labelledby="savings-title">
      <div className="savings__top">
        <span className="savings__icon" aria-hidden="true">
          <PiggyBank size={20} />
        </span>
        <div className="savings__text">
          <p id="savings-title" className="savings__label">
            {t('Savings')}
          </p>
          <p className="savings__num private-num">{money(savings)}</p>
        </div>
        <button className="link-btn" onClick={() => onEdit({})}>
          <Plus size={15} className="inline-icon" /> {t('Goal')}
        </button>
      </div>
      {list.length === 0 ? (
        <p className="savings__hint">{carriedIn > 0 ? t('savings-hint-carry', { amount: money(carriedIn) }) : t('savings-hint')}</p>
      ) : (
        <ul className="savings__goals">
          {list.map((g) => (
            <li key={g.id}>
              <button className={`mini-goal ${g.done ? 'is-done' : ''}`} onClick={() => onEdit(g)}>
                <span className="mini-goal__top">
                  <span className="mini-goal__name">
                    {g.done && <PartyPopper size={14} className="inline-icon" />} {g.name}
                  </span>
                  <span className="mini-goal__amt private-num">
                    {g.done ? t('Reached!') : t('{saved} of {target}', { saved: money(g.saved), target: money(g.target) })}
                  </span>
                </span>
                <span className="goal__bar" aria-hidden="true">
                  <span style={{ '--w': `${g.frac * 100}%` }} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Create or change one goal. `goal` is {} for a new one. */
export function GoalEditor({ goal, onDone }) {
  const { state, addGoal, updateGoal, removeGoal, moveGoal } = useStore();
  const toast = useToast();
  const isEdit = !!goal.id;
  const [name, setName] = useState(goal.name || '');
  const [target, setTarget] = useState(() => amountToInput(goal.target || ''));
  const index = state.goals.findIndex((g) => g.id === goal.id);

  const save = (e) => {
    e.preventDefault();
    const v = parseAmountInput(target);
    if (!name.trim()) return toast(t('Give your goal a name.'), { tone: 'warn' });
    if (!(v > 0)) return toast(t('Enter an amount above zero.'), { tone: 'warn' });
    if (isEdit) updateGoal(goal.id, { name: name.trim(), target: v });
    else addGoal({ name, target: v });
    toast(isEdit ? t('Goal saved') : t('Goal added: {name}', { name: name.trim() }));
    onDone();
  };

  return (
    <form className="panel" onSubmit={save}>
      {!isEdit && <p className="muted">{t('goal-intro')}</p>}
      <label className="field">
        <span className="field-label">{t('What are you saving for?')}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('e.g. Holiday in Bali')} maxLength={40} autoFocus={!isEdit} />
      </label>
      <label className="field">
        <span className="field-label">{t('Amount needed')}</span>
        <div className="input-prefix">
          <span aria-hidden="true">{currencySymbol()}</span>
          <input inputMode="numeric" value={target} onChange={(e) => setTarget(formatAmountInput(e.target.value))} placeholder="5.000.000" />
        </div>
      </label>
      {!isEdit && (
        <div className="goal-ideas" role="group" aria-label={t('Ideas')}>
          {['Holiday', 'New phone', 'Emergency fund', 'Gift'].map((idea) => (
            <button type="button" key={idea} className="chip" onClick={() => setName(t(idea))}>
              {t(idea)}
            </button>
          ))}
        </div>
      )}
      <button className="btn btn--primary btn--block" type="submit">
        <Target size={18} /> {isEdit ? t('Save goal') : t('Add goal')}
      </button>
      {isEdit && (
        <div className="goal-tools">
          {state.goals.length > 1 && (
            <>
              <button type="button" className="btn btn--ghost btn--sm" disabled={index <= 0} onClick={() => moveGoal(goal.id, -1)}>
                <ArrowUp size={16} /> {t('Fill first')}
              </button>
              <button type="button" className="btn btn--ghost btn--sm" disabled={index >= state.goals.length - 1} onClick={() => moveGoal(goal.id, 1)}>
                <ArrowDown size={16} /> {t('Later')}
              </button>
            </>
          )}
          <button
            type="button"
            className="btn btn--ghost btn--sm goal-tools__delete"
            onClick={() => {
              removeGoal(goal.id);
              toast(t('Goal removed. Your savings stay the same.'));
              onDone();
            }}
          >
            <Trash2 size={16} /> {t('Remove')}
          </button>
        </div>
      )}
      {isEdit && state.goals.length > 1 && <p className="muted small">{t('goal-order')}</p>}
    </form>
  );
}
