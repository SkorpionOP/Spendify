# Spendify — Status & Improvements

## Architecture Evolution: Local-First PWA

Spendify was migrated from a client-server model (FastAPI + Supabase PostgreSQL + Firebase Auth) to a **100% Local-First Offline PWA**.
- Everything is stored on device in `localStorage` + IndexedDB mirror with automated snapshots.
- No remote backend or account is required.
- Deploys as a static site directly from `frontend/` on Vercel.

---

## Resolved Legacy Issues

1. **Cascading Renders & Hooks Dependencies**:
   - The legacy `Landing.jsx`, `Setup.jsx`, and `Login.jsx` components have been retired and replaced by clean, unified `Onboarding.jsx` and reactive `useStore` hooks.
2. **Unused Imports & React 17+ JSX**:
   - Removed legacy `import React` statements and unused variables across the codebase.
   - Clean ESLint pass with zero warnings.
3. **Backend / Vercel Build Blocker**:
   - Removed obsolete serverless Python entry points (`api/index.py`, `.python-version`) that previously prevented Vercel from building the static site.
4. **Sideways Category Scrolling on Mobile**:
   - Replaced horizontally overflowing category lists with a responsive 4-column category grid (Top 7 categories + "More" expander).
5. **Mobile Gesture / Hardware Back Navigation**:
   - Implemented `useBackClose` hook to integrate bottom sheets and modal dialogs with browser history (`popstate`), ensuring Android back gestures dismiss sheets instead of leaving the app.
6. **Smart Recurring & Note Autocomplete**:
   - Added automatic "Make it monthly" smart toast action for frequent bills.
   - Added note autocomplete from transaction history.
7. **Privacy Mode (`hideAmounts`)**:
   - Added global privacy masking that blurs financial numbers across Home, Calendar, Insights, History, and Expense sheets.
   - Accessible from Home, Settings, and desktop navigation rail.
8. **Internationalization (i18n)**:
   - Full bilingual coverage (English and Indonesian / Bahasa Indonesia) verified across 220+ translation keys.

---

## Current Health & Verification

- **Linting**: `npm run lint` — 0 errors, 0 warnings.
- **Build**: `npm run build` — Clean Vite production build with PWA service worker precaching.
- **i18n Coverage**: 100% key parity between `DICT.en` and `DICT.id`.

---

## Roadmap & Future Enhancements

1. **Biometric App Lock (WebAuthn)**:
   - Allow users to protect local financial data using Face ID, Touch ID, or Windows Hello via the Web Authentication API.
2. **Web Share Target API**:
   - Allow sharing bank notification text or digital receipts directly from other apps into Spendify's quick-add expense sheet.
3. **Automated Remote Sync / WebDAV**:
   - Optional encrypted sync to personal Nextcloud/WebDAV or Google Drive for users wanting cross-device synchronization without centralized servers.
