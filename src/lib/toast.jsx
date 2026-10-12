import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { IconCheck, IconAlert } from './icons.jsx';

// One toast at a time: confirms an action, then clears itself. Errors stay up
// longer and are announced assertively.
const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const [open, setOpen] = useState(false);
  const timer = useRef(null);

  const show = useCallback((text, { error = false } = {}) => {
    clearTimeout(timer.current);
    setToast({ text, error, id: Date.now() });
    setOpen(true);
    timer.current = setTimeout(() => setOpen(false), error ? 6000 : 3200);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toast-region" role={toast?.error ? 'alert' : 'status'} aria-live={toast?.error ? 'assertive' : 'polite'}>
        {toast && (
          <div className={`toast${open ? ' is-open' : ''}${toast.error ? ' is-error' : ''}`} onClick={() => setOpen(false)}>
            {toast.error ? <IconAlert /> : <IconCheck />}
            <span>{toast.text}</span>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
