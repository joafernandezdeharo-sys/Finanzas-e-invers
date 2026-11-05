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
