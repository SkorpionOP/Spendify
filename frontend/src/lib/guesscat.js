/*
 * Guesses a category from an expense note ("kopi kenangan" → Coffee). Used by the expense sheet and
 * by Ask Spendify when it logs an expense from a chat message.
 */

const KEYWORD_MAP = [
  [['kopi', 'coffee', 'starbucks', 'kenangan', 'janji jiwa', 'fore', 'latte', 'espresso', 'cappuccino', 'cafe'], 'Coffee'],
  [['gojek', 'grab', 'mrt', 'lrt', 'bensin', 'pertamina', 'shell', 'toll', 'tol', 'parkir', 'parking', 'kereta', 'commuter', 'ojol', 'taxi', 'taksi', 'busway', 'transjakarta', 'angkot'], 'Transport'],
  [['indomaret', 'alfamart', 'supermarket', 'hypermart', 'superindo', 'sayur', 'buah', 'beras', 'telur', 'minyak', 'grocery', 'groceries', 'pasar'], 'Groceries'],
  [['restoran', 'restaurant', 'mcd', 'mcdonald', 'kfc', 'burger', 'pizza', 'sushi', 'hokben', 'bakso', 'mie gacoan', 'gacoan', 'nasi padang', 'sate', 'warteg', 'dining', 'lunch', 'dinner'], 'Dining Out'],
  [['netflix', 'spotify', 'youtube', 'disney', 'prime', 'icloud', 'google one', 'patreon', 'chatgpt', 'subscription'], 'Subscriptions'],
  [['pln', 'listrik', 'pdam', 'air', 'wifi', 'indihome', 'biznet', 'myrepublic', 'first media', 'gas', 'iuran', 'tagihan', 'token', 'electricity', 'electric', 'water bill', 'internet'], 'Bills'],
  [['pulsa', 'kuota', 'telkomsel', 'xl', 'indosat', 'tri', 'smartfren'], 'Phone'],
  [['obat', 'apotek', 'kimia farma', 'k24', 'dokter', 'klinik', 'hospital', 'rumah sakit', 'dentist', 'gigi', 'vitamin'], 'Health'],
  [['gym', 'fitness', 'badminton', 'futsal', 'padel', 'renang', 'workout'], 'Fitness'],
  [['steam', 'playstation', 'ps5', 'nintendo', 'game', 'topup ml', 'mobile legends', 'valorant', 'genshin', 'roblox'], 'Games'],
  [['bioskop', 'cinema', 'xxi', 'cgv', 'cinepolis', 'tiket', 'nonton', 'movie'], 'Entertainment'],
  [['shopee', 'tokopedia', 'lazada', 'baju', 'celana', 'sepatu', 'zara', 'uniqlo', 'h&m'], 'Shopping'],
  [['skincare', 'makeup', 'salon', 'barbershop', 'potong rambut', 'creambath', 'facial'], 'Beauty'],
  [['kos', 'kost', 'kontrakan', 'sewa', 'maintenance', 'ipl', 'apartemen'], 'Rent'],
];

const isWordChar = (ch) => /[a-z0-9]/.test(ch || '');
/** True when `word` appears in `text` at the start of a word ("tri" in "kartu tri", not in "electricity"). */
const startsWord = (text, word) => {
  for (let i = text.indexOf(word); i >= 0; i = text.indexOf(word, i + 1)) if (!isWordChar(text[i - 1])) return true;
  return false;
};

export function detectCategoryFromNote(text) {
  const clean = (text || '').toLowerCase();
  for (const [words, cat] of KEYWORD_MAP) {
    // Match at the start of a word, so "tri" (the operator) doesn't match "electricity"
    if (words.some((w) => startsWord(clean, w))) return cat;
  }
  return null;
}
