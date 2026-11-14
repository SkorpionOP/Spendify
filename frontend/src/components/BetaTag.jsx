import { t } from '../lib/i18n';

/** Small "Beta" pill for features that are still being tried out, like the AI assistant. */
export function BetaTag() {
  return (
    <span className="beta-tag" title={t('beta-hint')}>
      {t('Beta')}
    </span>
  );
}
