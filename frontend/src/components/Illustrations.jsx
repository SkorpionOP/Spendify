/*
 * Small flat drawings for the setup screen. They use the app's colour tokens, so they follow light and dark mode.
 * Purely decorative: each one is hidden from screen readers.
 */

const Frame = ({ children }) => (
  <svg className="illo" viewBox="0 0 72 72" width="72" height="72" aria-hidden="true" focusable="false">
    <rect x="0" y="0" width="72" height="72" rx="22" className="illo__bg" />
    {children}
  </svg>
);

/** A phone showing an e-wallet, with a coin and a card beside it. */
export const PayIllo = () => (
  <Frame>
    <rect x="22" y="12" width="26" height="46" rx="6" className="illo__ink" />
    <rect x="25" y="17" width="20" height="30" rx="3" className="illo__paper" />
    <rect x="28" y="21" width="14" height="5" rx="2.5" className="illo__jam" />
    <rect x="28" y="30" width="9" height="3" rx="1.5" className="illo__line" />
    <rect x="28" y="36" width="12" height="3" rx="1.5" className="illo__line" />
    <circle cx="35" cy="52.5" r="2" className="illo__paper" />
    <circle cx="53" cy="44" r="9" className="illo__leaf" />
    <text x="53" y="47.5" textAnchor="middle" className="illo__coin">
      Rp
    </text>
    <rect x="9" y="38" width="18" height="12" rx="3" className="illo__amber" transform="rotate(-12 18 44)" />
  </Frame>
);

/** A balance card with blurred amounts and a closed eye. */
export const PrivacyIllo = () => (
  <Frame>
    <rect x="11" y="18" width="42" height="28" rx="6" className="illo__paper" />
    <rect x="16" y="24" width="14" height="3" rx="1.5" className="illo__line" />
    <rect x="16" y="31" width="28" height="7" rx="3.5" className="illo__blur" />
    <circle cx="50" cy="48" r="12" className="illo__ink" />
    <path d="M43 48 q7 6 14 0" className="illo__stroke" />
    <path d="M45.5 51.5 l-1.5 2.5 M50 53 v2.8 M54.5 51.5 l1.5 2.5" className="illo__stroke" />
  </Frame>
);

/** A savings jar filling up, with a little flag on top. */
export const GoalIllo = () => (
  <Frame>
    <rect x="21" y="16" width="26" height="6" rx="3" className="illo__ink" />
    <path d="M19 26 q0-4 4-4 h22 q4 0 4 4 v24 q0 8-8 8 h-14 q-8 0-8-8 z" className="illo__paper" />
    <path d="M19 40 h30 v10 q0 8-8 8 h-14 q-8 0-8-8 z" className="illo__leaf" />
    <circle cx="28" cy="35" r="3.5" className="illo__amber" />
    <circle cx="38" cy="31" r="3" className="illo__amber" />
    <path d="M52 10 v18" className="illo__pole" />
    <path d="M52 11 l10 4 l-10 4 z" className="illo__jam" />
  </Frame>
);

/** A phone home screen with the app's icon standing out. */
export const InstallIllo = () => (
  <Frame>
    <rect x="20" y="9" width="32" height="54" rx="7" className="illo__ink" />
    <rect x="23" y="14" width="26" height="42" rx="4" className="illo__paper" />
    {[0, 1, 2].map((c) =>
      [0, 1, 2].map((r) =>
        c === 1 && r === 1 ? null : <rect key={`${c}${r}`} x={26 + c * 7.5} y={18 + r * 8} width="5" height="5" rx="1.5" className="illo__line" />
      )
    )}
    <rect x="31.5" y="24.5" width="9" height="9" rx="2.5" className="illo__jam" />
    <path d="M36 40 v8 M32.5 45 l3.5 3.5 l3.5-3.5" className="illo__arrow" />
  </Frame>
);
