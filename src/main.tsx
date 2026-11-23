import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(registration => {
      const notify = () => window.dispatchEvent(new Event('studio-update-ready'));
      if (registration.waiting) notify();
      const observe = (worker: ServiceWorker | null) => {
        if (!worker) return;
        const changed = () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) notify();
          if (worker.state === 'redundant') window.dispatchEvent(new Event(
            navigator.serviceWorker.controller ? 'studio-update-failed' : 'studio-offline-unavailable',
          ));
        };
        worker.addEventListener('statechange', changed);
        changed();
      };
      registration.addEventListener('updatefound', () => observe(registration.installing));
      observe(registration.installing);
    }).catch(() => {
      window.dispatchEvent(new Event('studio-offline-unavailable'));
    });
  });
}
