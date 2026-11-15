import { describe, expect, it } from 'vitest';
import { amountsIn, clauses, understand, wordsToDigits } from '../nlu';

const one = (text) => {
  const { changes, unclear } = understand(text);
  expect(unclear).toEqual([]);
  expect(changes).toHaveLength(1);
  return changes[0];
};

describe('amounts', () => {
  it('reads the ways people write money', () => {
    expect(amountsIn('1,5 jt')).toEqual([1_500_000]);
    expect(amountsIn('1.5jt')).toEqual([1_500_000]);
    expect(amountsIn('Rp 250.000')).toEqual([250_000]);
    expect(amountsIn('Rp1.500.000')).toEqual([1_500_000]);
    expect(amountsIn('200rb')).toEqual([200_000]);
    expect(amountsIn('200k')).toEqual([200_000]);
    expect(amountsIn('3 juta')).toEqual([3_000_000]);
    expect(amountsIn('10M')).toEqual([10_000_000]);
    expect(amountsIn('2,000,000')).toEqual([2_000_000]);
  });

  it('ignores percentages, durations and small bare numbers', () => {
    expect(amountsIn('15%')).toEqual([]);
    expect(amountsIn('12 bulan')).toEqual([]);
    expect(amountsIn('2 kali')).toEqual([]);
  });

  it('turns spoken numbers into digits', () => {
    expect(wordsToDigits('dua ratus ribu')).toBe('200000');
    expect(wordsToDigits('satu setengah juta')).toBe('1500000');
    expect(wordsToDigits('sejuta')).toBe('1000000');
    expect(wordsToDigits('lima puluh ribu')).toBe('50000');
    expect(wordsToDigits('two hundred thousand')).toBe('200000');
    expect(wordsToDigits('beli HP')).toBe('beli HP');
  });
});

describe('clauses', () => {
  it('splits on dan / and / commas but not inside numbers', () => {
    expect(clauses('beli HP 1,5 juta dan nabung 200rb, lalu gaji naik 10%')).toEqual(['beli HP 1,5 juta', 'nabung 200rb', 'gaji naik 10%']);
  });
});

describe('understand (Indonesian)', () => {
  it('purchases', () => {
    expect(one('Kalau beli HP baru 3 juta?')).toEqual({ type: 'purchase', amount: 3_000_000, name: 'HP baru', at: 0 });
    expect(one('beli laptop 8jt bulan depan')).toMatchObject({ type: 'purchase', amount: 8_000_000, name: 'Laptop', at: 1 });
    expect(one('liburan ke Bali 4 juta 3 bulan lagi')).toMatchObject({ type: 'purchase', amount: 4_000_000, at: 3 });
  });

  it('saving more', () => {
    expect(one('nabung 200rb tiap bulan')).toEqual({ type: 'save', amount: 200_000 });
    expect(one('sisihkan dua ratus ribu per bulan')).toEqual({ type: 'save', amount: 200_000 });
  });

  it('cutting a category', () => {
    expect(one('kurangi belanja 15%')).toEqual({ type: 'cut', category: 'Shopping', pct: 0.15 });
    expect(one('stop jajan')).toEqual({ type: 'cut', category: 'Snacks', pct: 1 });
    expect(one('hemat kopi 100rb')).toEqual({ type: 'cut', category: 'Coffee', amount: 100_000 });
    expect(one('kurangi belanja dapur 10 persen')).toEqual({ type: 'cut', category: 'Groceries', pct: 0.1 });
  });

  it('income changes', () => {
    expect(one('gaji naik 10%')).toEqual({ type: 'income', pct: 0.1 });
    expect(one('gaji naik 500rb')).toEqual({ type: 'income', delta: 500_000 });
    expect(one('gaji jadi 7 juta')).toEqual({ type: 'income', set: 7_000_000 });
    expect(one('gaji turun 1 juta')).toEqual({ type: 'income', delta: -1_000_000 });
  });

  it('new monthly costs', () => {
    expect(one('cicilan HP 500rb selama 12 bulan')).toEqual({ type: 'monthly', amount: 500_000, name: 'Cicilan HP', months: 12 });
    expect(one('langganan Netflix 54rb per bulan')).toMatchObject({ type: 'monthly', amount: 54_000, months: null });
  });

  it('savings targets', () => {
    expect(one('kapan tabunganku 10 juta?')).toEqual({ type: 'target', amount: 10_000_000 });
  });

  it('several at once', () => {
    const { changes } = understand('beli HP 3 juta dan nabung 200rb tiap bulan, kurangi jajan 20%');
    expect(changes.map((c) => c.type)).toEqual(['purchase', 'save', 'cut']);
  });

  it('asks for a price when there is none', () => {
    expect(understand('bisa beli HP baru?')).toEqual({ changes: [], unclear: [{ text: 'bisa beli HP baru?', hint: 'HP baru' }] });
  });
});

describe('understand (English)', () => {
  it('handles the same ideas', () => {
    expect(one('buy a new phone for 3M')).toMatchObject({ type: 'purchase', amount: 3_000_000, name: 'New phone' });
    expect(one('save another 200k a month')).toEqual({ type: 'save', amount: 200_000 });
    expect(one('spend 15% less on shopping')).toEqual({ type: 'cut', category: 'Shopping', pct: 0.15 });
    expect(one('my salary increases by 10%')).toEqual({ type: 'income', pct: 0.1 });
    expect(one('when will I have 10 million saved')).toEqual({ type: 'target', amount: 10_000_000 });
  });
});

describe('when a purchase happens', () => {
  const NOV = new Date(2026, 10, 16); // November
  const at = (text) => understand(text, NOV).changes[0];
  it('reads year end, next year and month names', () => {
    expect(at('mau ke jepang akhir tahun 20jt')).toMatchObject({ type: 'purchase', at: 1, name: 'Ke jepang' });
    expect(at('beli motor tahun depan 25 juta')).toMatchObject({ at: 2, name: 'Motor' });
    expect(at('liburan bulan Maret 5 juta')).toMatchObject({ at: 4 });
    expect(at('buy a laptop in March for 10 million')).toMatchObject({ at: 4, name: 'Laptop' });
    expect(at('beli tas 2 juta')).toMatchObject({ at: 0 });
  });
});

describe('saving up for something', () => {
  const NOV = new Date(2026, 10, 16);
  const g = (text) => understand(text, NOV).changes;
  it('turns "save for X" into a goal, with or without a deadline', () => {
    expect(g('nabung 5 juta buat liburan dalam 6 bulan')).toEqual([{ type: 'goal', amount: 5_000_000, name: 'Liburan', months: 6 }]);
    expect(g('mau nabung buat HP baru 3 juta')).toEqual([{ type: 'goal', amount: 3_000_000, name: 'HP baru', months: null }]);
    expect(g('save 3M for a phone by June')).toEqual([{ type: 'goal', amount: 3_000_000, name: 'Phone', months: 7 }]);
    expect(g('target 10 juta untuk dana darurat')).toEqual([{ type: 'goal', amount: 10_000_000, name: 'Dana darurat', months: null }]);
  });
  it('still reads a plain monthly saving as saving more', () => {
    expect(g('nabung 200rb tiap bulan')).toEqual([{ type: 'save', amount: 200_000 }]);
  });
});

describe('missing prices', () => {
  const NOV = new Date(2026, 10, 16);
  it('asks for the price of the thing she named, with a clean name', () => {
    expect(understand('Wanna buy iqoo in 6 months how should I save', NOV)).toEqual({
      changes: [],
      unclear: [{ text: 'Wanna buy iqoo in 6 months how should I save', hint: 'Iqoo' }],
    });
    expect(understand('mau beli iqoo 6 bulan lagi gimana nabungnya', NOV).unclear[0].hint).toBe('Iqoo');
  });
  it('plans once the price is added', () => {
    expect(understand('Wanna buy iqoo in 6 months how should I save 4000000', NOV).changes).toEqual([
      { type: 'purchase', amount: 4_000_000, name: 'Iqoo', at: 6 },
    ]);
  });
});


describe('category limits', () => {
  it('reads a limit with an amount', () => {
    expect(understand('batasi jajan 500rb sebulan').changes).toEqual([{ type: 'limit', category: 'Snacks', amount: 500000 }]);
    expect(understand('set a food limit of 2 million').changes[0]).toMatchObject({ type: 'limit', category: 'Food', amount: 2000000 });
  });
  it('reads removing a limit', () => {
    expect(understand('hapus batas jajan').changes).toEqual([{ type: 'limit', category: 'Snacks', amount: null }]);
  });
  it('still reads "kurangi jajan" as a what-if cut', () => {
    expect(understand('kurangi jajan 20%').changes[0].type).toBe('cut');
  });
});
