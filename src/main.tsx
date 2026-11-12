import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { AppStoreProvider } from './store/AppStore';
import { LiveDataProvider } from './store/LiveData';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <AppStoreProvider>
        <LiveDataProvider>
          <App />
        </LiveDataProvider>
      </AppStoreProvider>
    </HashRouter>
  </StrictMode>,
);

// app instalable y sin conexión (solo cuando se sirve por http/https, no al abrir el archivo local)
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
