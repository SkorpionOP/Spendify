const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export const money = (n, { precise = false } = {}) => {
  const v = Number(n) || 0;
  const s = (precise ? inr2 : inr).format(Math.abs(v));
  return `${v < 0 ? '−' : ''}₹${s}`;
};

export const compact = (n) => {
  const v = Math.abs(Number(n) || 0);
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(1).replace(/\.0$/, '')}Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1).replace(/\.0$/, '')}L`;
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(1).replace(/\.0$/, '')}k`;
  return `₹${Math.round(v)}`;
};
