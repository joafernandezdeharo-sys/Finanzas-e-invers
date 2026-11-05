import type { AppData, AssetType, CategoryRule, DollarKind, Settings } from '../types';

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
  incomeCategories: ['Sueldo', 'Freelance', 'Ventas', 'Intereses', 'Alquileres', 'Regalos', 'Reintegros', 'Transferencias recibidas', 'Otros ingresos'],
  expenseCategories: [
    'Supermercado', 'Alquiler / Expensas', 'Servicios', 'Transporte', 'Salud', 'Educación',
    'Salidas', 'Ropa', 'Suscripciones', 'Tarjeta de crédito', 'Impuestos', 'Comisiones bancarias', 'Hogar', 'Mascotas',
    'Delivery', 'Combustible', 'Transferencias enviadas', 'Otros gastos',
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
  categoryRules: [],
};

export const emptyData = (): AppData => ({
  version: 1,
  transactions: [],
  goals: [],
  savings: [],
  dollarOps: [],
  investments: [],
  imports: [],
  settings: structuredClone(DEFAULT_SETTINGS),
});

/** Bancos, billeteras y tarjetas de Argentina (para identificar el origen de cada resumen) */
export const SOURCES = [
  'Mercado Pago', 'Ualá', 'Brubank', 'Naranja X', 'Personal Pay', 'Lemon', 'Belo', 'Prex', 'Cuenta DNI', 'MODO', 'Reba', 'Openbank', 'Wilobank',
  'Banco Galicia', 'Banco Santander', 'BBVA', 'Banco Macro', 'ICBC', 'Banco Nación', 'Banco Provincia', 'Banco Ciudad', 'Banco Credicoop',
  'Banco Patagonia', 'Banco Supervielle', 'Banco Comafi', 'Banco Hipotecario', 'Banco Galicia Más (ex HSBC)', 'Banco Columbia', 'BIND Banco Industrial',
  'Bancor (Córdoba)', 'Banco Santa Fe', 'Banco Entre Ríos', 'Banco San Juan', 'Banco Santa Cruz', 'Banco del Chubut', 'BPN (Neuquén)',
  'Banco de Corrientes', 'Banco del Sol', 'Banco Tierra del Fuego', 'Banco de La Pampa', 'Banco Municipal de Rosario', 'Banco Mariva', 'Banco CMF',
  'Visa', 'Mastercard', 'American Express', 'Cabal', 'Tarjeta Naranja', 'Cencosud', 'Otro',
];

/**
 * Reglas automáticas de categorización por palabra clave. Las reglas que crea el usuario
 * (Configuración / al importar) tienen prioridad sobre estas.
 */
export const BUILTIN_RULES: CategoryRule[] = [
  ...['haberes', 'sueldo', 'acred. haberes', 'acreditacion de haberes', 'remuneracion', 'pago de sueldo', 'aguinaldo', 'sac '].map((k) => ({ keyword: k, category: 'Sueldo', type: 'ingreso' as const })),
  ...['interes', 'rendimiento', 'rend. ', 'plazo fijo', 'fci '].map((k) => ({ keyword: k, category: 'Intereses', type: 'ingreso' as const })),
  ...['reintegro', 'devolucion', 'cashback', 'bonificacion', 'contracargo'].map((k) => ({ keyword: k, category: 'Reintegros', type: 'ingreso' as const })),
  ...['transferencia recibida', 'transf. recibida', 'dinero recibido', 'recibiste', 'cobro', 'ingreso de dinero', 'deposito'].map((k) => ({ keyword: k, category: 'Transferencias recibidas', type: 'ingreso' as const })),
  ...['coto', 'carrefour', 'jumbo', 'disco ', 'vea ', 'supermercado dia', 'dia tienda', 'changomas', 'chango mas', 'la anonima', 'walmart', 'makro', 'vital', 'maxiconsumo', 'diarco', 'super ', 'supermercado', 'autoservicio', 'almacen', 'verduleria', 'carniceria', 'dietetica'].map((k) => ({ keyword: k, category: 'Supermercado' })),
  ...['rappi', 'pedidosya', 'pedidos ya', 'pedidos ya'].map((k) => ({ keyword: k, category: 'Delivery' })),
  ...['mcdonald', 'burger king', 'mostaza', 'starbucks', 'havanna', 'cafe ', 'resto', 'bar ', 'cerveceria', 'parrilla', 'pizzeria', 'heladeria', 'grido', 'freddo', 'cine', 'cinemark', 'hoyts', 'ticketek', 'all access', 'passline'].map((k) => ({ keyword: k, category: 'Salidas' })),
  ...['ypf', 'shell', 'axion', 'puma energy', 'gulf', 'combustible', 'nafta', 'estacion de servicio'].map((k) => ({ keyword: k, category: 'Combustible' })),
  ...['sube', 'uber', 'cabify', 'didi', 'peaje', 'ausol', 'autopista', 'aubasa', 'estacionamiento', 'parking', 'trenes', 'subte', 'emova', 'aerolineas', 'flybondi', 'jetsmart', 'despegar', 'colectivo', 'telepase'].map((k) => ({ keyword: k, category: 'Transporte' })),
  ...['edenor', 'edesur', 'edelap', 'epec', 'metrogas', 'naturgy', 'camuzzi', 'ecogas', 'aysa', 'absa', 'telecom', 'personal', 'movistar', 'claro', 'fibertel', 'flow', 'telecentro', 'directv', 'iplan', 'starlink', 'internet', 'luz ', 'gas ', 'agua '].map((k) => ({ keyword: k, category: 'Servicios' })),
  ...['netflix', 'spotify', 'disney', 'hbo', 'max.com', 'star+', 'paramount', 'prime video', 'amazon prime', 'youtube', 'apple.com', 'icloud', 'google', 'microsoft', 'openai', 'chatgpt', 'anthropic', 'claude.ai', 'adobe', 'canva', 'dropbox', 'crunchyroll', 'mubi', 'deezer', 'tidal', 'playstation', 'xbox', 'steam', 'nintendo', 'patreon', 'suscripcion'].map((k) => ({ keyword: k, category: 'Suscripciones' })),
  ...['farmacia', 'farmacity', 'farmaonline', 'osde', 'swiss medical', 'galeno', 'omint', 'medife', 'sancor salud', 'medicus', 'ioma', 'pami', 'hospital', 'clinica', 'sanatorio', 'odontolog', 'laboratorio', 'optica'].map((k) => ({ keyword: k, category: 'Salud' })),
  ...['afip', 'arca', 'arba', 'agip', 'rentas', 'iibb', 'ingresos brutos', 'imp. ', 'impuesto', 'ley 25413', 'ley 25.413', 'sellos', 'percepcion', 'retencion', 'iva ', 'abl', 'patente', 'monotributo', 'ganancias', 'bienes personales', 'pais '].map((k) => ({ keyword: k, category: 'Impuestos' })),
  ...['comision', 'mantenimiento', 'cargo por', 'costo de', 'seguro de vida', 'servicio de cuenta', 'paquete', 'cuota de mantenimiento', 'renovacion anual', 'intereses de financiacion', 'interes financiacion', 'punitorios'].map((k) => ({ keyword: k, category: 'Comisiones bancarias', type: 'gasto' as const })),
  ...['alquiler', 'expensas', 'consorcio', 'inmobiliaria'].map((k) => ({ keyword: k, category: 'Alquiler / Expensas' })),
  ...['colegio', 'escuela', 'universidad', 'facultad', 'instituto', 'curso', 'udemy', 'coursera', 'platzi', 'domestika', 'libreria', 'cuspide', 'yenny'].map((k) => ({ keyword: k, category: 'Educación' })),
  ...['zara', 'h&m', 'nike', 'adidas', 'dexter', 'grimoldi', 'falabella', 'kevingston', 'mimo', 'cheeky', 'rapsodia', 'indumentaria', 'zapateria', 'shein', 'temu'].map((k) => ({ keyword: k, category: 'Ropa' })),
  ...['easy', 'sodimac', 'blaisten', 'ferreteria', 'pintureria', 'fravega', 'garbarino', 'musimundo', 'cetrogar', 'naldo', 'megatone', 'on city', 'mueble', 'bazar', 'mercadolibre', 'mercado libre'].map((k) => ({ keyword: k, category: 'Hogar' })),
  ...['veterinaria', 'puppis', 'pet shop', 'petshop', 'mascota'].map((k) => ({ keyword: k, category: 'Mascotas' })),
  ...['pago de tarjeta', 'pago tarjeta', 'pago tc', 'pago resumen', 'pago visa', 'pago master', 'pago amex', 'su pago en pesos', 'su pago en dolares'].map((k) => ({ keyword: k, category: 'Tarjeta de crédito', type: 'gasto' as const })),
  ...['transferencia enviada', 'transf. enviada', 'transferencia a', 'transferiste', 'dinero enviado', 'enviaste', 'debin', 'transferencia'].map((k) => ({ keyword: k, category: 'Transferencias enviadas', type: 'gasto' as const })),
];
