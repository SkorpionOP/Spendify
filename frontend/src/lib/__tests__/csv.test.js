import { describe, expect, it } from 'vitest';
import { catName, configure } from '../i18n';
import { buildCsv } from '../csv';

const rows = [
  { id: '1', date: '2026-11-02', amount: 18000, category: 'Coffee', note: 'Kopi; susu "gula aren"', createdAt: 2 },
  { id: '2', date: '2026-11-01', amount: 1500000, category: 'Rent', note: 'Kos', createdAt: 1, recurringId: 'r', pay: 'gopay' },
];

describe('buildCsv', () => {
  it('uses ; for Indonesian Excel, oldest first, with a total', () => {
    configure({ lang: 'id', currency: 'IDR' });
    const lines = buildCsv(rows).replace('﻿', '').trim().split('\r\n');
    expect(lines[0]).toBe('Tanggal;Kategori;Catatan;Dibayar pakai;Jumlah;Rutin bulanan');
    expect(lines[1]).toBe(`2026-11-01;${catName('Rent')};Kos;GoPay;1500000;Ya`);
    expect(lines[2]).toBe(`2026-11-02;${catName('Coffee')};"Kopi; susu ""gula aren""";;18000;`);
    expect(lines[3]).toBe(';;Total;;1518000;');
  });

  it('uses , in English and starts with a byte-order mark', () => {
    configure({ lang: 'en', currency: 'IDR' });
    const csv = buildCsv(rows.slice(0, 1));
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.split('\r\n')[0]).toBe('﻿Date,Category,Note,Amount,Monthly repeat');
  });
});
