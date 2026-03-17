import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nProvider } from './i18n';
import { AuthContextProvider } from './services/authService';
import { CloudSyncProvider } from './services/cloudSyncService';
import App from './App.tsx';
import './index.css';

// Register service worker for offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('SW registration failed:', err);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <AuthContextProvider>
        <CloudSyncProvider>
          <App />
        </CloudSyncProvider>
      </AuthContextProvider>
    </I18nProvider>
  </StrictMode>
);
