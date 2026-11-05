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
}

export type AssetType = 'cripto' | 'accion_ar' | 'cedear' | 'bono' | 'accion_us' | 'plazo_fijo' | 'fci' | 'otro';

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
  rss2jsonKey: string;
  incomeCategories: string[];
  expenseCategories: string[];
  accounts: string[];
  newsSources: NewsSource[];
  monthlyBudget: number; // en moneda de visualización, 0 = sin presupuesto
}

export interface AppData {
  version: 1;
  transactions: Transaction[];
  goals: SavingsGoal[];
  savings: SavingsMovement[];
  dollarOps: DollarOperation[];
  investments: Investment[];
  settings: Settings;
}

export type CollectionKey = 'transactions' | 'goals' | 'savings' | 'dollarOps' | 'investments';
