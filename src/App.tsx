import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useStore } from './store/AppStore';
import { useLive } from './store/LiveData';
import { CurrencyToggle } from './components/ui';
import { IconChart, IconDollar, IconHome, IconList, IconMenu, IconNews, IconPiggy, IconRefresh, IconSettings } from './components/Icons';
import { dollarLabel } from './lib/defaults';
import { formatMoney } from './lib/util';
import Dashboard from './pages/Dashboard';
import Movimientos from './pages/Movimientos';
import Ahorro from './pages/Ahorro';
import Dolar from './pages/Dolar';
import Inversiones from './pages/Inversiones';
import Noticias from './pages/Noticias';
import Configuracion from './pages/Configuracion';

const NAV = [
  { to: '/', label: 'Resumen', icon: IconHome },
  { to: '/movimientos', label: 'Ingresos y gastos', icon: IconList },
  { to: '/ahorro', label: 'Ahorro', icon: IconPiggy },
  { to: '/dolar', label: 'Dólar', icon: IconDollar },
  { to: '/inversiones', label: 'Inversiones', icon: IconChart },
  { to: '/noticias', label: 'Noticias', icon: IconNews },
  { to: '/configuracion', label: 'Configuración', icon: IconSettings },
];

const TICKER_KINDS = ['oficial', 'blue', 'bolsa', 'contadoconliqui', 'cripto', 'tarjeta'] as const;

export default function App() {
  const { data, setSettings } = useStore();
  const { settings } = data;
  const live = useLive();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setMenuOpen(false), [location.pathname]);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  return (
    <div className="app">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="brand"><img src="./favicon.svg" alt="" />Mis Finanzas</div>
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <Icon />{label}
          </NavLink>
        ))}
        <div className="sidebar-foot">
          Tus datos se guardan solo en este navegador. Hacé un backup desde Configuración.
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="btn-icon menu-btn" onClick={() => setMenuOpen((o) => !o)} aria-label="Menú"><IconMenu /></button>
          <div className="ticker" aria-label="Cotizaciones del dólar">
            {live.dollars.length === 0 && <span className="ticker-item muted">{live.dollarsError ? 'Sin conexión con DolarAPI' : 'Cargando cotizaciones…'}</span>}
            {TICKER_KINDS.map((k) => {
              const q = live.dollars.find((d) => d.casa === k);
              if (!q) return null;
              return (
                <span key={k} className="ticker-item" title={`Compra ${formatMoney(q.compra ?? 0, 'ARS')} · Venta ${formatMoney(q.venta ?? 0, 'ARS')}`}>
                  {dollarLabel(k)} <b>{formatMoney(q.venta ?? 0, 'ARS', { decimals: 0 })}</b>
                </span>
              );
            })}
          </div>
          {live.dollarsUpdated && <span className="live-dot" title={`Actualizado ${live.dollarsUpdated.toLocaleTimeString('es-AR')}`} />}
          <button className="btn-icon" onClick={live.refresh} aria-label="Actualizar cotizaciones" title="Actualizar cotizaciones">
            <IconRefresh style={live.loading ? { animation: 'spin 1s linear infinite' } : undefined} />
          </button>
          <CurrencyToggle value={settings.displayCurrency} onChange={(c) => setSettings({ displayCurrency: c })} />
        </header>

        <main className="content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/movimientos" element={<Movimientos />} />
            <Route path="/ahorro" element={<Ahorro />} />
            <Route path="/dolar" element={<Dolar />} />
            <Route path="/inversiones" element={<Inversiones />} />
            <Route path="/noticias" element={<Noticias />} />
            <Route path="/configuracion" element={<Configuracion />} />
            <Route path="*" element={<Dashboard />} />
          </Routes>
        </main>
      </div>
      {menuOpen && <div className="modal-backdrop" style={{ zIndex: 30, background: 'rgb(0 0 0 / .3)' }} onClick={() => setMenuOpen(false)} />}
    </div>
  );
}
