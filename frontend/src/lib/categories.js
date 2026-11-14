// `name` is the stored key (never translated); use catName() from i18n for display.
export const CATEGORIES = [
  { name: 'Food', emoji: '🍛', color: '#E5487A' },
  { name: 'Snacks', emoji: '🍡', color: '#E0705A' },
  { name: 'Coffee', emoji: '☕', color: '#8A6D3B' },
  { name: 'Groceries', emoji: '🛒', color: '#2F9E7A' },
  { name: 'Dining Out', emoji: '🍽️', color: '#D9692E' },
  { name: 'Transport', emoji: '🛵', color: '#3C7DD9' },
  { name: 'Shopping', emoji: '🛍️', color: '#9B4FD1' },
  { name: 'Beauty', emoji: '💄', color: '#D14F9B' },
  { name: 'Phone', emoji: '📶', color: '#4F8FA8' },
  { name: 'Bills', emoji: '⚡', color: '#C9A227' },
  { name: 'Rent', emoji: '🏠', color: '#6B5B95' },
  { name: 'Subscriptions', emoji: '📺', color: '#4F6FA8' },
  { name: 'Health', emoji: '💊', color: '#3FA796' },
  { name: 'Fitness', emoji: '🏸', color: '#5E9E3F' },
  { name: 'Entertainment', emoji: '🎬', color: '#C2453F' },
  { name: 'Travel', emoji: '✈️', color: '#2E8FC9' },
  { name: 'Education', emoji: '📚', color: '#7A5C2E' },
  { name: 'Family', emoji: '👨‍👩‍👧', color: '#B5651D' },
  { name: 'Gifts', emoji: '🎁', color: '#D9534F' },
  { name: 'Charity', emoji: '🤲', color: '#3F9E8F' },
  { name: 'Pets', emoji: '🐱', color: '#A8784F' },
  { name: 'Investment', emoji: '📈', color: '#2F7E5E' },
  { name: 'Games', emoji: '🎮', color: '#6A6FD1' },
  { name: 'Others', emoji: '📦', color: '#8A8199' },
];

const byName = Object.fromEntries(CATEGORIES.map((c) => [c.name, c]));
export const category = (name) => byName[name] || byName.Others;
