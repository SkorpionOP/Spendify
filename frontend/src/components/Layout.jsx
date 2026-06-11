import React, { createContext, useContext, useState, useEffect } from 'react';
import { Navbar } from './Navbar';
import { useAuth } from '../hooks/useAuth';
import { X } from 'lucide-react';

const LayoutContext = createContext(null);

export const LayoutProvider = ({ children }) => {
  const [focusMode, setFocusMode] = useState(false);
  const [focusData, setFocusData] = useState({ remainingNeeds: 0, pctVal: 0 });

  const enterFocusMode = (remainingNeeds = 0, pctVal = 0) => {
    setFocusData({ remainingNeeds, pctVal });
    setFocusMode(true);
    document.body.classList.add('focus-mode');
  };

  const exitFocusMode = () => {
    setFocusMode(false);
    document.body.classList.remove('focus-mode');
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'f' || e.key === 'F') {
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
        if (document.body.classList.contains('focus-mode')) {
          exitFocusMode();
        } else {
          enterFocusMode(focusData.remainingNeeds, focusData.pctVal);
        }
      }
      if (e.key === 'Escape') {
        exitFocusMode();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [focusData]);

  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const promptInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  return (
    <LayoutContext.Provider value={{ focusMode, focusData, enterFocusMode, exitFocusMode, deferredPrompt, promptInstall }}>
      {children}
    </LayoutContext.Provider>
  );
};

export const useLayout = () => {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error('useLayout must be used within a LayoutProvider');
  }
  return context;
};

export const Layout = ({ children }) => {
  const { user } = useAuth();
  const { focusMode, focusData, exitFocusMode } = useLayout();
  const { remainingNeeds, pctVal } = focusData;

  return (
    <div className="app-container">
      {/* Focus Mode Overlay */}
      {focusMode && (
        <div className="focus-only" id="focus-overlay" style={{ display: 'flex' }} role="dialog" aria-modal="true">
          <div className="focus-banner">
            <div className="focus-week-label">This Week — Remaining Budget</div>
            <div className={`focus-amount ${remainingNeeds < 0 ? 'over' : pctVal >= 80 ? 'warn' : 'good'}`}>
              ₹{Number(remainingNeeds).toFixed(0)}
            </div>
            <div className="focus-sub">
              {remainingNeeds >= 0 ? (
                `You're on track. ${Math.max(0, (100 - pctVal)).toFixed(0)}% of needs budget remaining.`
              ) : (
                `Over budget by ₹${Math.abs(remainingNeeds).toFixed(0)}. Review your spending.`
              )}
            </div>
            <button className="focus-exit-btn" id="focus-exit-btn" onClick={exitFocusMode}>
              <X size={16} /> Exit Focus Mode
            </button>
          </div>
        </div>
      )}

      {user && <Navbar />}

      <main className="page-wrapper container fade-in" style={{ paddingTop: user ? '0px' : '20px' }}>
        {children}
      </main>
    </div>
  );
};
