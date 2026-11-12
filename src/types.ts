export type Currency = 'ARS' | 'USD';

export type TxType = 'ingreso' | 'gasto';

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  type: TxType;
  amount: number;
  currency: Currency;
  category: string;
  description: string;
  account: string;
  source?: string; // banco / app de donde se importó (ej. "Mercado Pago")
  importId?: string; // lote de importación al que pertenece
  /** Transferencia entre cuentas propias: mueve saldos pero no cuenta como ingreso ni gasto */
  internal?: boolean;
  /** Compra en cuotas: número de cuota y total (ej. 3 de 6) */
  installment?: { n: number; total: number };
  /** Generado automáticamente por un gasto/ingreso fijo */
  recurringId?: string;
  /** Movimiento creado por otra operación (compra de dólares, aporte de ahorro…), se borra junto con ella */
  linkId?: string;
}

export type AccountKind = 'efectivo' | 'banco' | 'billetera' | 'tarjeta' | 'broker' | 'otro';

export interface AccountInfo {
  currency: Currency;
  kind: AccountKind;
  opening: number; // saldo inicial
  openingDate: string; // fecha del saldo inicial (los movimientos anteriores no lo modifican)
}

/** Ingreso o gasto fijo que se carga solo todos los meses */
export interface Recurring {
  id: string;
  description: string;
  type: TxType;
  amount: number;
  currency: Currency;
  category: string;
  account: string;
  day: number; // día del mes (1-31)
  start: string; // YYYY-MM
  end: string; // YYYY-MM o '' (sin fin)
  active: boolean;
}

export interface CategoryBudget {
  category: string;
  amount: number;
  currency: Currency;
}

export interface PriceAlert {
  id: string;
  kind: 'dolar' | 'activo';
  target: string; // casa de dólar (blue, oficial…) o id de la inversión
  op: 'mayor' | 'menor' | 'variacion'; // precio mayor/menor a value, o variación diaria (±value %)
  value: number;
  active: boolean;
  lastTriggered: string | null; // ISO
}

/** Un archivo de resumen importado */
export interface ImportBatch {
  id: string;
  fileName: string;
  source: string;
  importedAt: string; // ISO datetime
  count: number;
  skipped: number; // duplicados omitidos
  from: string; // fecha del primer movimiento
  to: string; // fecha del último movimiento
  totalIn: number; // en ARS
  totalOut: number; // en ARS
}

export interface CategoryRule {
  keyword: string; // texto a buscar en la descripción (sin distinguir mayúsculas)
  category: string;
  type?: TxType; // si se indica, la regla solo aplica a ese tipo
}

export interface SavingsGoal {
  id: string;
  name: string;
  target: number;
  currency: Currency;
  deadline: string; // YYYY-MM-DD o ''
}

export interface SavingsMovement {
  id: string;
  goalId: string; // '' = ahorro general
  date: string;
  amount: number; // positivo = aporte, negativo = retiro
  currency: Currency;
  note: string;
}

/** Casas de cambio que publica DolarAPI / ArgentinaDatos */
export type DollarKind =
  | 'oficial'
  | 'blue'
  | 'bolsa'
  | 'contadoconliqui'
  | 'mayorista'
  | 'cripto'
  | 'tarjeta';

export interface DollarOperation {
  id: string;
  date: string;
  operation: 'compra' | 'venta';
  usdAmount: number;
  rate: number; // ARS por USD al momento de la operación
  kind: DollarKind;
  note: string;
  /** Cuentas vinculadas: de dónde salen los pesos y adónde entran los dólares */
  fromAccount?: string;
  toAccount?: string;
}

export type AssetType = 'cripto' | 'accion_ar' | 'cedear' | 'bono' | 'accion_us' | 'plazo_fijo' | 'fci' | 'otro';

export type InvestmentOpKind = 'compra' | 'venta' | 'dividendo' | 'comision';

export interface InvestmentOp {
  id: string;
  date: string;
  kind: InvestmentOpKind;
  quantity: number; // compra/venta: unidades; dividendo/comisión: 0
  price: number; // compra/venta: precio unitario; dividendo/comisión: monto total
  currency: Currency;
  note?: string;
}

export interface Investment {
  id: string;
  type: AssetType;
  symbol: string; // ticker (AAPL, GGAL, AL30) o id de CoinGecko (bitcoin)
  name: string;
  quantity: number;
  buyPrice: number; // precio unitario de compra
  currency: Currency; // moneda del precio de compra
  buyDate: string;
  broker: string;
  manualPrice: number | null; // precio actual manual (si no hay cotización online)
  annualRate: number | null; // TNA % para plazo fijo
  note: string;
  /** Registro de operaciones. Si existe, cantidad y precio de compra se calculan a partir de él */
  ops?: InvestmentOp[];
}

export interface NewsSource {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
}

export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  userName: string;
  displayCurrency: Currency;
  rateKind: DollarKind; // cotización usada para convertir ARS <-> USD
  theme: Theme;
  refreshSeconds: number;
  finnhubKey: string;
  yahooProxyUrl: string; // URL del puente (Cloudflare Worker) para consultar Yahoo Finance
  rss2jsonKey: string;
  incomeCategories: string[];
  expenseCategories: string[];
  accounts: string[];
  newsSources: NewsSource[];
  monthlyBudget: number; // en moneda de visualización, 0 = sin presupuesto
  categoryRules: CategoryRule[];
  /** Mostrar ingresos y gastos ajustados por inflación (pesos de hoy) */
  inflationAdjusted: boolean;
  accountInfo: Record<string, AccountInfo>;
  budgets: CategoryBudget[];
  alerts: PriceAlert[];
  notifications: boolean;
}

export interface AppData {
  version: 1;
  transactions: Transaction[];
  goals: SavingsGoal[];
  savings: SavingsMovement[];
  dollarOps: DollarOperation[];
  investments: Investment[];
  imports: ImportBatch[];
  recurring: Recurring[];
  settings: Settings;
  /** Última modificación (para la sincronización entre dispositivos) */
  updatedAt: string;
}

export type CollectionKey = 'transactions' | 'goals' | 'savings' | 'dollarOps' | 'investments' | 'imports' | 'recurring';
