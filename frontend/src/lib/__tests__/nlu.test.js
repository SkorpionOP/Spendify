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
