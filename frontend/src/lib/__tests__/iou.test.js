import { describe, expect, it } from 'vitest';
import { balanceWith, daysUntilDue, debtSummary, isOverdue, isSettled, knownPeople, normalizeDebts, paidOf, remainingOf, sortDebts } from '../iou';
import { configure } from '../i18n';
import { normalize } from '../money';
import { buildContext } from '../aicontext';

const TODAY = '2026-11-15';
const debt = (over) => ({ id: 'x', direction: 'lent', person: 'Budi', amount: 300000, note: '', date: '2026-11-01', due: null, payments: [], createdAt: 1, ...over });

describe('IOU maths', () => {
  it('works out what is paid, what is left and when it is settled', () => {
    const d = debt({ payments: [{ id: 'p', amount: 100000, date: '2026-11-05' }] });
    expect(paidOf(d)).toBe(100000);
    expect(remainingOf(d)).toBe(200000);
    expect(isSettled(d)).toBe(false);
    const done = debt({ payments: [{ id: 'p', amount: 300000, date: '2026-11-05' }] });
    expect(isSettled(done)).toBe(true);
    // Paying a little too much never makes it negative
    expect(remainingOf(debt({ payments: [{ id: 'p', amount: 350000, date: '2026-11-05' }] }))).toBe(0);
  });

  it('knows overdue from due soon, and never calls a settled IOU overdue', () => {
    expect(isOverdue(debt({ due: '2026-11-12' }), TODAY)).toBe(true);
    expect(isOverdue(debt({ due: TODAY }), TODAY)).toBe(false);
    expect(isOverdue(debt({ due: '2026-11-12', payments: [{ id: 'p', amount: 300000, date: '2026-11-13' }] }), TODAY)).toBe(false);
    expect(daysUntilDue(debt({ due: '2026-11-17' }), TODAY)).toBe(2);
    expect(daysUntilDue(debt({ due: '2026-11-12' }), TODAY)).toBe(-3);
    expect(daysUntilDue(debt(), TODAY)).toBeNull();
  });

  it('sums up both directions separately', () => {
    const debts = [
      debt({ id: 'a', due: '2026-11-12' }), // overdue, 300k owed to her
      debt({ id: 'b', person: 'Sari', amount: 500000, due: '2026-11-17', payments: [{ id: 'p', amount: 200000, date: '2026-11-13' }] }), // 300k left, due soon
      debt({ id: 'c', direction: 'borrowed', person: 'Dewi', amount: 1000000, due: '2026-12-05' }),
      debt({ id: 'd', person: 'Rina', amount: 50000, payments: [{ id: 'p', amount: 50000, date: '2026-11-02' }] }), // settled
    ];
    expect(debtSummary(debts, TODAY)).toEqual({ owedToMe: 600000, iOwe: 1000000, openLent: 2, openBorrowed: 1, overdue: 1, dueSoon: 1, settled: 1, net: -400000, open: 3 });
    expect(sortDebts(debts, TODAY).map((d) => d.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('nets out one person across IOUs, ignoring case', () => {
    const debts = [debt({ id: 'a', amount: 300000 }), debt({ id: 'b', direction: 'borrowed', person: 'budi', amount: 100000 }), debt({ id: 'c', person: 'Sari' })];
    expect(balanceWith(debts, 'BUDI')).toBe(200000);
    expect(knownPeople([debt({ id: 'a', createdAt: 1 }), debt({ id: 'b', person: 'Sari', createdAt: 5 }), debt({ id: 'c', person: 'budi', createdAt: 3 })])).toEqual(['Sari', 'budi']);
  });
});

describe('normalizeDebts', () => {
  it('cleans up anything from storage or a backup', () => {
    const out = normalizeDebts([
      { id: 'a', direction: 'weird', person: '  Budi ', amount: '300000', date: '2026-11-01', due: 'soon', payments: [{ amount: 1000 }, { amount: -5 }, null] },
      { id: 'b', person: '', amount: 5 },
      { id: 'c', person: 'X', amount: 0 },
      null,
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'a', direction: 'lent', person: 'Budi', amount: 300000, due: null, note: '' });
    expect(out[0].payments).toEqual([{ id: 'a-p0', amount: 1000, date: '2026-11-01' }]);
    expect(normalizeDebts(undefined)).toEqual([]);
  });

  it('is part of the saved state, and old backups without IOUs still load', () => {
    expect(normalize({ expenses: [], plans: {} }).debts).toEqual([]);
    expect(normalize({ debts: [debt()] }).debts).toHaveLength(1);
  });
});

describe('IOUs and the AI summary', () => {
  it('sends totals only, never the names', () => {
    configure({ lang: 'id', currency: 'IDR', payday: 1 });
    const state = normalize({
      profile: { name: 'Putri' },
      startMonth: '2026-10',
      plans: { '2026-10': { salary: 6_000_000, needsPercent: 70 } },
      debts: [debt({ person: 'Budi Rahasia', note: 'tiket konser diam-diam', due: '2026-11-12' })],
    });
    const ctx = buildContext(state, new Date(2026, 10, 15, 12));
    expect(ctx.iou).toEqual({ moneyOthersOweHer: 300000, moneySheOwesOthers: 0, openIous: 1, pastDueDate: 1 });
    const json = JSON.stringify(ctx);
    expect(json).not.toContain('Budi');
    expect(json).not.toContain('konser');
  });
});
