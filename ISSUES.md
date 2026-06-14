# Project Issues & Improvements

## Frontend Issues (React/Vite)
1. **React Hooks Misuse (Cascading Renders)**: 
   - `src/pages/Landing.jsx` (line 72): `fetchHistory` is called directly within a `useEffect`, causing cascading renders. This should be wrapped in an async IIFE or using a proper data-fetching library.
   - `src/pages/Setup.jsx` (line 36): `checkExistingConfig` is called directly in an effect synchronously.
2. **Missing Hook Dependencies**:
   - `src/pages/Landing.jsx` (line 73): `useEffect` has a missing dependency `fetchHistory`.
3. **Unused Variables and Imports**:
   - Multiple instances of `import React` when React 17+ JSX transform is in use.
   - Unused error variables (`err`, `e`) in `Landing.jsx`, `Setup.jsx`, `api.js`.
   - `Shield` import is unused in `Login.jsx`.
   - The assigned `app` variable from Firebase initialization is not used in `firebase.js`.

## Backend Issues (FastAPI/Python)
1. **Code Style (PEP 8)**:
   - Numerous `E501` (line too long) warnings across `models/db_wrapper.py`, `routers/*.py`, and `services/*.py`.
   - `E302` (expected 2 blank lines) and trailing whitespace (`W291`, `W293`) scattered throughout the routers.
2. **Exception Handling**:
   - `routers/analysis.py` (line 80): Uses a bare `except:`, which is bad practice as it catches `SystemExit` and `KeyboardInterrupt`. It should catch `Exception` at the very least.
3. **Unused Imports & Variables**:
   - `test_alias.py`: `init_tables` is imported but unused, and local variable `e` is assigned but never used.

## Suggested Improvements

### Code Quality & Architecture
- **Implement Pre-commit Hooks**: Set up `husky` with `lint-staged` for the frontend and `pre-commit` for the backend to run `eslint`, `prettier`, and `flake8`/`black` before every commit. This ensures code quality stays high.
- **Frontend State Management**: Transition from pure React `useState`/`useEffect` data fetching to a caching library like **React Query (@tanstack/react-query)** or **SWR**. This eliminates the cascading render warnings and provides offline caching out of the box, aligning with the offline-first PWA goals.
- **Backend Formatting**: Adopt an opinionated formatter like `black` and a linter like `ruff` (replacing `flake8`) to automatically fix PEP8 errors and line lengths during development.
- **Error Handling**: Standardize error handling in the FastAPI backend by using custom exception handlers and ensuring no bare `except:` blocks exist to prevent masking critical application crashes.
- **Testing**: Add unit tests using `pytest` for the backend (especially for the budget carry-forward logic) and `vitest`/`React Testing Library` for the frontend.
