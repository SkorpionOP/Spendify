import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { initInstallCapture } from './lib/install';
import './index.css';
import App from './App.jsx';

initInstallCapture();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Silent auto-update; data is in localStorage so a reload never loses anything.
registerSW({ immediate: true });
