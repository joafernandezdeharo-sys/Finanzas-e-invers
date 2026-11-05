import type { AppData, DollarKind, Settings, AssetType } from '../types';

export const DOLLAR_KINDS: { value: DollarKind; label: string }[] = [
  { value: 'oficial', label: 'Oficial' },
  { value: 'blue', label: 'Blue' },
  { value: 'bolsa', label: 'MEP (Bolsa)' },
  { value: 'contadoconliqui', label: 'CCL' },
  { value: 'mayorista', label: 'Mayorista' },
  { value: 'cripto', label: 'Cripto' },
  { value: 'tarjeta', label: 'Tarjeta' },
];

export const dollarLabel = (k: string) => DOLLAR_KINDS.find((d) => d.value === k)?.label ?? k;

export const ASSET_TYPES: { value: AssetType; label: string; hint: string }[] = [
  { value: 'cripto', label: 'Cripto', hint: 'Cotiza en vivo vía CoinGecko. Símbolo = id de CoinGecko (ej. bitcoin, ethereum, tether).' },
  { value: 'cedear', label: 'CEDEAR', hint: 'Cotiza en vivo en ARS vía data912 (BYMA). Símbolo = ticker (ej. AAPL, SPY, MELI).' },
  { value: 'accion_ar', label: 'Acción argentina', hint: 'Cotiza en vivo en ARS vía data912 (BYMA). Símbolo = ticker (ej. GGAL, YPFD, PAMP).' },
  { value: 'bono', label: 'Bono / ON', hint: 'Cotiza en vivo vía data912. Ej. AL30 (ARS), AL30D (USD), GD30.' },
  { value: 'accion_us', label: 'Acción EE.UU.', hint: 'Cotiza en vivo en USD vía data912 o Finnhub (si cargaste la API key).' },
  { value: 'plazo_fijo', label: 'Plazo fijo', hint: 'Se calcula con la TNA desde la fecha de constitución.' },
  { value: 'fci', label: 'FCI', hint: 'Cargá el valor de la cuotaparte manualmente.' },
  { value: 'otro', label: 'Otro', hint: 'Precio actual manual.' },
];

export const assetLabel = (t: AssetType) => ASSET_TYPES.find((a) => a.value === t)?.label ?? t;

export const DEFAULT_SETTINGS: Settings = {
  userName: '',
  displayCurrency: 'ARS',
  rateKind: 'blue',
  theme: 'system',
  refreshSeconds: 60,
  finnhubKey: '',
  rss2jsonKey: '',
  incomeCategories: ['Sueldo', 'Freelance', 'Ventas', 'Intereses', 'Alquileres', 'Regalos', 'Otros ingresos'],
  expenseCategories: [
    'Supermercado', 'Alquiler / Expensas', 'Servicios', 'Transporte', 'Salud', 'Educación',
    'Salidas', 'Ropa', 'Suscripciones', 'Tarjeta de crédito', 'Impuestos', 'Hogar', 'Mascotas', 'Otros gastos',
  ],
  accounts: ['Efectivo', 'Banco', 'Billetera virtual', 'Tarjeta de crédito'],
  newsSources: [
    { id: 'ambito-fin', name: 'Ámbito · Finanzas', url: 'https://www.ambito.com/rss/pages/finanzas.xml', enabled: true },
    { id: 'ambito-eco', name: 'Ámbito · Economía', url: 'https://www.ambito.com/rss/pages/economia.xml', enabled: true },
    { id: 'infobae-eco', name: 'Infobae · Economía', url: 'https://www.infobae.com/arc/outboundfeeds/rss/category/economia/', enabled: true },
    { id: 'lanacion-eco', name: 'La Nación · Economía', url: 'https://www.lanacion.com.ar/arc/outboundfeeds/rss/category/economia/', enabled: false },
    { id: 'gnews-dolar', name: 'Google News · Dólar', url: 'https://news.google.com/rss/search?q=d%C3%B3lar+hoy&hl=es-419&gl=AR&ceid=AR:es-419', enabled: true },
    { id: 'gnews-mercados', name: 'Google News · Mercados', url: 'https://news.google.com/rss/search?q=merval+bonos+acciones&hl=es-419&gl=AR&ceid=AR:es-419', enabled: false },
  ],
  monthlyBudget: 0,
};

export const emptyData = (): AppData => ({
  version: 1,
  transactions: [],
  goals: [],
  savings: [],
  dollarOps: [],
  investments: [],
  settings: structuredClone(DEFAULT_SETTINGS),
});
