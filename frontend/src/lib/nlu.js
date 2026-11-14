/*
 * Understands short "what if" sentences in Indonesian or English, entirely on the phone.
 *   "beli HP 3 juta dan nabung 200rb tiap bulan"
 *   "what if I spend 15% less on shopping and my salary goes up 10%"
 * Returns { changes, unclear } where `changes` match lib/twin.js and `unclear` lists the parts it couldn't use.
 */

/* ---------- numbers ---------- */

const UNITS = [
  [/^(miliar|milyar|billion|bn|b)$/, 1e9],
  [/^(juta|jt|million|mio|mil|m)$/, 1e6],
  [/^(ribu|rb|k|thousand|grand)$/, 1e3],
];
const unitValue = (u) => {
  if (!u) return 1;
  for (const [re, v] of UNITS) if (re.test(u)) return v;
  return 1;
};

const WORDS = {
  nol: 0, satu: 1, se: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9,
  sepuluh: 10, sebelas: 11, seratus: 100, seribu: 1000, sejuta: 1e6, setengah: 0.5,
  one: 1, a: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, half: 0.5,
};
const MULT = { puluh: 10, belas: 10, ratus: 100, hundred: 100, ribu: 1e3, thousand: 1e3, juta: 1e6, million: 1e6, miliar: 1e9, billion: 1e9 };

/** "dua ratus lima puluh ribu" → "250000", "satu setengah juta" → "1500000". Leaves other words alone. */
export const wordsToDigits = (text) =>
  text.replace(
    /\b((?:nol|satu|se|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas|seratus|seribu|sejuta|setengah|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|half|a)(?:\s+(?:satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|puluh|belas|ratus|ribu|juta|miliar|setengah|hundred|thousand|million|billion|and|one|two|three|four|five|six|seven|eight|nine|half))*)\b/gi,
    (match) => {
      const words = match.toLowerCase().split(/\s+/).filter((w) => w !== 'and');
      // A lone "a"/"se"/"one" is not a number worth converting
      if (words.length === 1 && ['a', 'se', 'one', 'satu'].includes(words[0])) return match;
      if (!words.some((w) => MULT[w] || (WORDS[w] != null && !['a', 'se'].includes(w)))) return match;
      let total = 0;
      let cur = 0;
      for (const w of words) {
        if (w === 'setengah' || w === 'half') {
          cur += 0.5;
        } else if (WORDS[w] != null) {
          cur += WORDS[w];
        } else if (w === 'belas') {
          cur += 10;
        } else if (MULT[w]) {
          const m = MULT[w];
          if (m >= 1000) {
            total += (cur || 1) * m;
            cur = 0;
          } else cur = (cur || 1) * m;
        }
      }
      const n = total + cur;
      return n ? String(n) : match;
    }
  );

/** Every money amount in a piece of text, in order. "1,5 jt" → 1500000, "Rp 250.000" → 250000. */
export const amountsIn = (text) => {
  const out = [];
  const re = /(?:rp\.?|rs\.?|idr|npr|\$)?\s*(\d+(?:[.,]\d+)*)\s*(miliar|milyar|billion|bn|juta|jt|million|mio|ribu|rb|k|thousand|grand|m|b)?\b/gi;
  for (const m of text.matchAll(re)) {
    const raw = m[1];
    const unit = (m[2] || '').toLowerCase();
    // "12 bulan", "15%", "2 kali" are not money (but "8jt bulan depan" is)
    if (!unit && /^\s*(%|persen|percent|bulan|months?|bln|tahun|years?|x\b|kali)/i.test(text.slice(m.index + m[0].length))) continue;
    let n;
    if (unit) n = parseFloat(raw.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
    else if (/^\d{1,3}([.,]\d{3})+$/.test(raw)) n = Number(raw.replace(/[.,]/g, ''));
    else n = parseFloat(raw.replace(',', '.'));
    n *= unitValue(unit);
    // Ignore small bare numbers ("2 kali", "day 5") unless they carry a unit or currency
    if (!unit && !/rp|rs|idr|npr|\$/i.test(m[0]) && n < 1000) continue;
    out.push(Math.round(n));
  }
  return out;
};

const percentIn = (text) => {
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*(%|persen|percent)/i);
  return m ? parseFloat(m[1].replace(',', '.')) / 100 : null;
};

const monthsIn = (text) => {
  const m = text.match(/(?:selama|for|dalam|in)?\s*(\d+)\s*(bulan|months?|bln)/i);
  return m ? Number(m[1]) : null;
};

/* ---------- categories ---------- */

// Words people use → stored category. Longer phrases first so "belanja dapur" beats "belanja".
const CATEGORY_WORDS = [
  ['makan di luar', 'Dining Out'], ['dining out', 'Dining Out'], ['eating out', 'Dining Out'], ['eat out', 'Dining Out'], ['nongkrong', 'Dining Out'], ['restoran', 'Dining Out'],
  ['belanja dapur', 'Groceries'], ['groceries', 'Groceries'], ['grocery', 'Groceries'], ['sayur', 'Groceries'],
  ['online shopping', 'Shopping'], ['shopping', 'Shopping'], ['belanja', 'Shopping'], ['shopee', 'Shopping'], ['baju', 'Shopping'], ['clothes', 'Shopping'],
  ['kopi', 'Coffee'], ['coffee', 'Coffee'], ['ngopi', 'Coffee'],
  ['jajan', 'Snacks'], ['snacks', 'Snacks'], ['snack', 'Snacks'], ['cemilan', 'Snacks'],
  ['makanan', 'Food'], ['makan', 'Food'], ['food', 'Food'],
  ['transportasi', 'Transport'], ['transport', 'Transport'], ['gojek', 'Transport'], ['grab', 'Transport'], ['ojol', 'Transport'], ['bensin', 'Transport'], ['taxi', 'Transport'],
  ['kecantikan', 'Beauty'], ['skincare', 'Beauty'], ['makeup', 'Beauty'], ['beauty', 'Beauty'],
  ['langganan', 'Subscriptions'], ['subscriptions', 'Subscriptions'], ['subscription', 'Subscriptions'], ['netflix', 'Subscriptions'],
  ['hiburan', 'Entertainment'], ['entertainment', 'Entertainment'], ['nonton', 'Entertainment'], ['movies', 'Entertainment'],
  ['game', 'Games'], ['games', 'Games'], ['gaming', 'Games'],
  ['pulsa', 'Phone'], ['kuota', 'Phone'], ['phone bill', 'Phone'],
  ['tagihan', 'Bills'], ['bills', 'Bills'], ['listrik', 'Bills'],
  ['olahraga', 'Fitness'], ['gym', 'Fitness'], ['fitness', 'Fitness'],
  ['liburan', 'Travel'], ['travel', 'Travel'],
  ['hadiah', 'Gifts'], ['gifts', 'Gifts'], ['kado', 'Gifts'],
];
const categoryIn = (text) => {
  for (const [w, cat] of CATEGORY_WORDS) if (new RegExp(`\\b${w}\\b`, 'i').test(text)) return cat;
  return null;
};

/* ---------- names ---------- */

const tidyName = (s) => {
  const clean = s
    .replace(/\b(rp\.?|rs\.?|idr)\b/gi, '')
    .replace(/[\d.,]+\s*(miliar|juta|jt|ribu|rb|k|million|thousand|m)?\b/gi, '')
    .replace(/\b(yang|seharga|harganya|harga|senilai|for|worth|about|sekitar|kira-kira|a|an|the|my|aku|saya|mau|ingin|pengen|pingin|i|want|to|dong|ya|sih|deh|bulan depan|next month|tiap bulan|per bulan|sebulan|monthly|a month)\b/gi, ' ')
    .replace(/[?!.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : '';
};

/* ---------- clauses ---------- */

const RE = {
  question: /\b(kapan|when|berapa lama|how long|how soon)\b/i,
  savingsWord: /\b(tabungan|tabunganku|savings|saved|nabung|menabung|terkumpul|punya|have|reach|capai|mencapai)\b/i,
  income: /\b(gaji|gajiku|salary|income|pemasukan|penghasilan|pay|bonus tetap|raise)\b/i,
  down: /\b(turun|berkurang|dipotong|potong|decrease|decreases|drop|drops|lower|cut|less)\b/i,
  set: /\b(jadi|menjadi|becomes|become|to)\b/i,
  cut: /\b(kurangi|mengurangi|kurangin|hemat|irit|cut|reduce|less|stop|berhenti|skip|tanpa)\b/i,
  stop: /\b(stop|berhenti|tanpa|no more|quit)\b/i,
  save: /\b(nabung|menabung|tabung|save|saving|sisihkan|simpan|put aside|set aside)\b/i,
  monthly: /\b(tiap bulan|setiap bulan|per bulan|perbulan|sebulan|monthly|a month|per month|each month|every month|bulanan)\b|\/\s*(bln|bulan|month|mo)\b/i,
  recurringWord: /\b(langganan|subscription|cicilan|installment|kredit|kos|kost|sewa|rent|nyicil|angsuran)\b/i,
  buy: /\b(beli|membeli|buy|purchase|afford|mampu|sanggup|bayar|pay for|liburan|trip|holiday|jalan-jalan|nikah|wedding)\b/i,
  later: /\b(bulan depan|next month)\b/i,
  inMonths: /\b(?:(\d+)\s*bulan lagi|in\s*(\d+)\s*months?)\b/i,
};

/** Split "A dan B, lalu C" into clauses, without breaking "1,5 juta". */
export const clauses = (text) =>
  text
    .split(/\s*(?:,(?!\d)|;|\.(?!\d)|\bdan\b|\band\b|\bterus\b|\blalu\b|\bplus\b|\bjuga\b|\bserta\b|\balso\b|\bthen\b)\s*/i)
    .map((s) => s.trim())
    .filter((s) => s && /\w/.test(s));

export const parseClause = (raw) => {
  const text = wordsToDigits(raw);
  const amounts = amountsIn(text);
  const amount = amounts[0];
  const pct = percentIn(text);

  // "Kapan tabunganku 10 juta?" / "When will I have 10M saved?"
  if (RE.question.test(text) && RE.savingsWord.test(text) && amount) return { type: 'target', amount };

  // Income up/down/to
  if (RE.income.test(text) && (amount || pct)) {
    const sign = RE.down.test(text) ? -1 : 1;
    if (pct != null) return { type: 'income', pct: sign * pct };
    if (RE.set.test(text) && !/\b(naik|increase|up|tambah)\b/i.test(text)) return { type: 'income', set: amount };
    return { type: 'income', delta: sign * amount };
  }

  // Spend less on a category
  const cat = categoryIn(text);
  if (RE.cut.test(text) && cat && !RE.save.test(text.replace(/\bhemat\b/i, ''))) {
    if (RE.stop.test(text)) return { type: 'cut', category: cat, pct: 1 };
    if (pct != null) return { type: 'cut', category: cat, pct: Math.min(1, pct) };
    if (amount) return { type: 'cut', category: cat, amount };
    return { type: 'cut', category: cat, pct: 0.2, assumed: true };
  }

  // Save more every month
  if (RE.save.test(text) && amount && !RE.buy.test(text)) return { type: 'save', amount };

  // A new monthly cost: subscription, instalment, rent…
  if (amount && (RE.recurringWord.test(text) || (RE.monthly.test(text) && !RE.save.test(text)))) {
    const months = monthsIn(text.replace(RE.monthly, ' '));
    const name = tidyName(text.replace(RE.monthly, ' ').replace(/\b(selama|for)\s*\d+\s*(bulan|months?|bln)\b/gi, '')) || '';
    return { type: 'monthly', amount, name, months: months || null };
  }

  // One-off purchase
  if (amount) {
    const at = RE.later.test(text) ? 1 : Number(text.match(RE.inMonths)?.slice(1).find(Boolean) || 0);
    const name = tidyName(text.replace(RE.later, ' ').replace(RE.inMonths, ' ').replace(RE.buy, ' ').replace(/\b(kalau|kalo|what if|if|can i|bisa|apa|aku|i)\b/gi, ' '));
    return { type: 'purchase', amount, name, at };
  }

  // "Bisa beli HP baru?" without a price
  if (RE.buy.test(text)) {
    const name = tidyName(text.replace(RE.buy, ' ').replace(/\b(kalau|kalo|what if|if|can i|bisa|apa|aku|i|nggak|gak|ga|enggak)\b/gi, ' '));
    return { type: 'needs-amount', name };
  }
  return null;
};

export const understand = (text) => {
  const changes = [];
  const unclear = [];
  for (const c of clauses(text || '')) {
    const r = parseClause(c);
    if (r && r.type !== 'needs-amount') changes.push(r);
    else unclear.push({ text: c, hint: r?.type === 'needs-amount' ? r.name || '' : null });
  }
  return { changes, unclear };
};
