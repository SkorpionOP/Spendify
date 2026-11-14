import { catName, t } from './i18n';
import { money, roundNice } from './format';

/*
 * When the AI isn't available (offline, switched off, busy), questions like "analyse my money" or
 * "where can I save?" still get a short, honest answer built on the phone from the same summary.
 */

const QUESTION =
  /\b(analy[sz]e?|analysis|analisis|analisa|improve|hemat|boros|control|kontrol|kendali|where|di ?mana|how am i|how('s| is) my|gimana|bagaimana|keuangan|keuanganku|tips|saran|advice|review|cek|check|overview|summary|ringkas|rangkum|savings?|tabungan(ku)?)\b/i;

export const looksLikeQuestion = (text) => QUESTION.test(text || '');

/** A short answer from the summary built by buildContext(). */
export const localAnswer = (ctx) => {
  const lines = [];
  const s = ctx.spendingThisMonth;
  if (ctx.income.monthlySpendingBudget > 0) {
    lines.push(t('la-spent', { spent: money(s.spentSoFar), budget: money(ctx.income.monthlySpendingBudget), left: money(Math.max(0, s.spendingBudgetLeft)) }));
    if (s.forecastBudgetLeftOverAtMonthEnd != null) {
      lines.push(
        s.forecastBudgetLeftOverAtMonthEnd >= 0
          ? t('la-forecast-ok', { amount: money(roundNice(s.forecastBudgetLeftOverAtMonthEnd)) })
          : t('la-forecast-over', { amount: money(roundNice(-s.forecastBudgetLeftOverAtMonthEnd)) })
      );
    }
  }
  const tips = [];
  const up = [...ctx.categories].filter((c) => c.changeVsLastMonthBySameDay > 0 && c.spentLastMonthBySameDay > 0).sort((a, b) => b.changeVsLastMonthBySameDay - a.changeVsLastMonthBySameDay)[0];
  if (up) tips.push(t('la-up', { category: catName(up.category), amount: money(up.changeVsLastMonthBySameDay) }));
  const over = ctx.categoryLimits.find((l) => l.status === 'over') || ctx.categoryLimits.find((l) => l.status === 'near');
  if (over) tips.push(t(over.status === 'over' ? 'la-limit-over' : 'la-limit-near', { category: catName(over.category) }));
  const habit = ctx.repeatedSmallPurchasesThisMonth[0];
  if (habit) tips.push(t('la-habit', { category: catName(habit.category), n: habit.times, amount: money(habit.total) }));
  const top = ctx.categories[0];
  if (!tips.length && top) tips.push(t('la-top', { category: catName(top.category), amount: money(top.spentThisMonthSoFar) }));
  lines.push(...tips.slice(0, 3).map((x) => `- ${x}`));
  lines.push(t('la-savings', { amount: money(ctx.savings.totalSavingsNow) }));
  return {
    text: lines.join('\n'),
    suggestions: [t('ex-improve'), t('ex-goal')].slice(0, 2),
  };
};
