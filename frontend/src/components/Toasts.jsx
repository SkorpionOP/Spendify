/* eslint-disable react-refresh/only-export-components -- provider + hook live together on purpose */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  useEffect(() => {
    const currentTimers = timers.current;
    return () => {
      Object.values(currentTimers).forEach(clearTimeout);
    };
  }, []);

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    setToasts((list) => list.filter((x) => x.id !== id));
  }, []);

  /**
   * toast('Saved')
   * toast('Deleted', { action: { label: 'Undo', onClick } })
   * toast('Added', { actions: [{ label: 'Make it monthly', onClick }, { label: 'Undo', onClick }] })
   * toast('…', { tone: 'warn' })
   */
  const toast = useCallback(
    (message, { tone = 'plain', action = null, actions = null, duration = 4000 } = {}) => {
      const id = Math.random().toString(36).slice(2);
      const all = actions || (action ? [action] : []);
      setToasts((list) => [...list.slice(-1), { id, message, tone, actions: all }]);
      timers.current[id] = setTimeout(() => dismiss(id), duration);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((item) => (
          <div key={item.id} className={`toast toast--${item.tone} ${item.actions.length > 1 ? 'toast--stack' : ''}`}>
            <span className="toast__msg">{item.message}</span>
            {item.actions.length > 0 && (
              <span className="toast__actions">
                {item.actions.map((a) => (
                  <button
                    key={a.label}
                    className={`toast__action ${a.primary ? 'toast__action--primary' : ''}`}
                    onClick={() => {
                      a.onClick();
                      dismiss(item.id);
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </span>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
