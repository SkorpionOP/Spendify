import { LANGS, t } from '../lib/i18n';
import { useStore } from '../lib/store';

/** Compact ID | EN switch. */
export function LangSwitch() {
  const { state, updateSettings } = useStore();
  return (
    <div className="lang-switch" role="radiogroup" aria-label={t('Language')}>
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          role="radio"
          aria-checked={state.settings.lang === l.code}
          className={state.settings.lang === l.code ? 'is-on' : ''}
          onClick={() => updateSettings({ lang: l.code })}
          lang={l.code}
          title={l.name}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
