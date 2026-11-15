import { afterEach, describe, expect, it } from 'vitest';
import { configure } from '../i18n';
import { cycleEnd, cycleStart, dateInCycle, dayOfCycle, daysInMonth, monthKey } from '../dates';
import { applyRecurring, monthSummary, normalize } from '../money';

const withPayday = (payday) => configure({ lang: 'id', currency: 'IDR', payday });
afterEach(() => withPayday(1));

describe('pay cycle', () => {
  it('payday 1 keeps calendar months', () => {
    withPayday(1);
    expect(monthKey('2026-11-30')).toBe('2026-11');
    expect(cycleStart('2026-11')).toBe('2026-11-01');
    expect(cycleEnd('2026-11')).toBe('2026-11-30');
    expect(daysInMonth('2026-02')).toBe(28);
  });

  it('payday 25: 25 Nov – 24 Dec is December', () => {
    withPayday(25);
    expect(monthKey('2026-11-24')).toBe('2026-11');
    expect(monthKey('2026-11-25')).toBe('2026-12');
    expect(monthKey('2026-12-24')).toBe('2026-12');
    expect(monthKey('2026-12-25')).toBe('2027-01');
    expect(cycleStart('2026-12')).toBe('2026-11-25');
    expect(cycleEnd('2026-12')).toBe('2026-12-24');
    expect(daysInMonth('2026-12')).toBe(30);
    expect(dayOfCycle('2026-11-25')).toBe(1);
    expect(dayOfCycle('2026-12-24')).toBe(30);
  });

  it('payday 10 names the cycle after the month it starts in', () => {
    withPayday(10);
    expect(monthKey('2026-11-10')).toBe('2026-11');
    expect(monthKey('2026-11-09')).toBe('2026-10');
    expect(cycleEnd('2026-11')).toBe('2026-12-09');
  });

  it('places a repeat day inside the cycle', () => {
    withPayday(25);
    expect(dateInCycle('2026-12', 1)).toBe('2026-12-01');
    expect(dateInCycle('2026-12', 28)).toBe('2026-11-28');
    expect(dateInCycle('2027-03', 31)).toBe('2027-02-28');
  });

  it('budget and spending follow the cycle', () => {
    withPayday(25);
    const s = normalize({
      profile: { name: 'A' },
      startMonth: '2026-12',
      plans: { '2026-12': { salary: 1000, needsPercent: 50 } },
      expenses: [
        { id: 'a', amount: 100, date: '2026-11-26', category: 'Food' },
        { id: 'b', amount: 50, date: '2026-12-24', category: 'Food' },
        { id: 'c', amount: 70, date: '2026-12-25', category: 'Food' },
      ],
    });
    expect(monthSummary(s, '2026-12').spent).toBe(150);
    expect(monthSummary(s, '2027-01').spent).toBe(70);
  });

  it('keeps payday in settings within 1–28', () => {
    expect(normalize({ settings: { payday: 31 } }).settings.payday).toBe(28);
    expect(normalize({}).settings.payday).toBe(1);
  });

  it('adds repeats on the right date of the cycle', () => {
    withPayday(25);
    const s = normalize({
      recurring: [{ id: 'r', amount: 10, category: 'Rent', note: '', day: 1, since: '2020-01', lastRun: '2020-01' }],
    });
    const out = applyRecurring({ ...s, recurring: [{ ...s.recurring[0], lastRun: undefined, since: monthKey(new Date().toISOString().slice(0, 10)) }] });
    for (const e of out.expenses) expect(e.date.slice(8)).toBe('01');
  });
});

describe('payday question for existing users', () => {
  it('asks people who set up before it existed', () => {
    expect(normalize({ profile: { name: 'A' }, settings: {} }).settings.paydayAsked).toBe(false);
  });
  it('does not ask again once a payday is chosen', () => {
    expect(normalize({ settings: { payday: 25 } }).settings.paydayAsked).toBe(true);
    expect(normalize({ settings: { payday: 1, paydayAsked: true } }).settings.paydayAsked).toBe(true);
  });
});
