import { describe, expect, it } from 'vitest';
import { configure } from '../i18n';
import { compact, currencySymbol, money } from '../format';

// Browsers put a non-breaking space between symbol and number; compare with plain spaces.
const clean = (s) => s.split(String.fromCharCode(160)).join(' ').split(String.fromCharCode(8239)).join(' ');

describe('money', () => {
  it('writes Nepalese rupees with Rs', () => {
    configure({ lang: 'en', currency: 'NPR' });
    expect(clean(money(1250))).toBe('Rs 1,250');
    expect(clean(money(1250.5, { precise: true }))).toBe('Rs 1,250.5');
    expect(currencySymbol()).toBe('Rs');
    expect(clean(compact(1250000))).toBe('Rs 1.3m');
  });

  it('keeps Rupiah in Indonesian style, even in English', () => {
    configure({ lang: 'en', currency: 'IDR' });
    expect(clean(money(25000))).toBe('Rp 25.000');
  });
});
