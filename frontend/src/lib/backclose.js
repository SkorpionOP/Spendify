import { useCallback, useEffect } from 'react';

/*
 * Makes the phone's Back button/gesture close an open sheet instead of leaving the app.
 *
 *   const { markOpen, requestClose } = useBackClose(isOpen, () => setOpen(false));
 *   open:  markOpen(); setOpen(true);
 *   close: requestClose();          // goes "back", which triggers the close
 *
 * Closing always flows through the browser's history, so there's exactly one code path
 * whether she taps ✕, saves, or presses Back.
 */
export function useBackClose(isOpen, onClosed) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const onPop = () => onClosed();
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [isOpen, onClosed]);

  const markOpen = useCallback(() => {
    try {
      window.history.pushState({ ...(window.history.state || {}), sheet: true }, '');
    } catch {
      /* ignore */
    }
  }, []);

  const requestClose = useCallback(() => {
    if (window.history.state?.sheet) window.history.back();
    else onClosed();
  }, [onClosed]);

  return { markOpen, requestClose };
}
