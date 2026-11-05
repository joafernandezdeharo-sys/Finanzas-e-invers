import type { AppData } from '../types';
import { addMonths, currentMonth, todayISO, uid } from './util';

/** Genera datos de ejemplo para los últimos 8 meses */
export function sampleData(base: AppData): AppData {
  const months = Array.from({ length: 8 }, (_, i) => addMonths(currentMonth(), i - 7));
  const tx: AppData['transactions'] = [];
  const rnd = (min: number, max: number) => Math.round(min + Math.random() * (max - min));
  months.forEach((m, i) => {
    const inflation = 1 + i * 0.025;
    const d = (day: number) => `${m}-${String(day).padStart(2, '0')}`;
    tx.push({ id: uid(), date: d(1), type: 'ingreso', amount: Math.round(1_800_000 * inflation), currency: 'ARS', category: 'Sueldo', description: 'Sueldo mensual', account: 'Banco' });
    if (i % 2 === 0) tx.push({ id: uid(), date: d(12), type: 'ingreso', amount: rnd(300, 600), currency: 'USD', category: 'Freelance', description: 'Proyecto freelance', account: 'Billetera virtual' });
    tx.push({ id: uid(), date: d(5), type: 'gasto', amount: Math.round(550_000 * inflation), currency: 'ARS', category: 'Alquiler / Expensas', description: 'Alquiler', account: 'Banco' });
    tx.push({ id: uid(), date: d(8), type: 'gasto', amount: rnd(80_000, 120_000), currency: 'ARS', category: 'Servicios', description: 'Luz, gas e internet', account: 'Banco' });
    for (let k = 0; k < 4; k++) tx.push({ id: uid(), date: d(3 + k * 7), type: 'gasto', amount: rnd(60_000, 110_000), currency: 'ARS', category: 'Supermercado', description: 'Compra semanal', account: 'Tarjeta de crédito' });
    tx.push({ id: uid(), date: d(15), type: 'gasto', amount: rnd(40_000, 90_000), currency: 'ARS', category: 'Transporte', description: 'SUBE y nafta', account: 'Billetera virtual' });
    tx.push({ id: uid(), date: d(20), type: 'gasto', amount: rnd(50_000, 150_000), currency: 'ARS', category: 'Salidas', description: 'Cenas y salidas', account: 'Tarjeta de crédito' });
    tx.push({ id: uid(), date: d(10), type: 'gasto', amount: 25, currency: 'USD', category: 'Suscripciones', description: 'Streaming y nube', account: 'Tarjeta de crédito' });
    if (i % 3 === 1) tx.push({ id: uid(), date: d(18), type: 'gasto', amount: rnd(60_000, 200_000), currency: 'ARS', category: 'Salud', description: 'Consulta y farmacia', account: 'Efectivo' });
  });

  const g1 = uid(), g2 = uid();
  const goals: AppData['goals'] = [
    { id: g1, name: 'Fondo de emergencia', target: 5000, currency: 'USD', deadline: `${addMonths(currentMonth(), 10)}-01` },
    { id: g2, name: 'Vacaciones', target: 3_000_000, currency: 'ARS', deadline: `${addMonths(currentMonth(), 4)}-15` },
  ];
  const savings: AppData['savings'] = months.flatMap((m) => [
    { id: uid(), goalId: g1, date: `${m}-02`, amount: rnd(200, 400), currency: 'USD' as const, note: 'Aporte mensual' },
    { id: uid(), goalId: g2, date: `${m}-03`, amount: rnd(150_000, 300_000), currency: 'ARS' as const, note: '' },
  ]);

  const dollarOps: AppData['dollarOps'] = [
    { id: uid(), date: `${months[0]}-02`, operation: 'compra', usdAmount: 500, rate: 1180, kind: 'blue', note: 'Ahorro' },
    { id: uid(), date: `${months[3]}-02`, operation: 'compra', usdAmount: 300, rate: 1310, kind: 'bolsa', note: 'MEP homebanking' },
    { id: uid(), date: `${months[6]}-04`, operation: 'compra', usdAmount: 400, rate: 1450, kind: 'oficial', note: '' },
  ];

  const investments: AppData['investments'] = [
    { id: uid(), type: 'cedear', symbol: 'SPY', name: 'S&P 500 ETF', quantity: 40, buyPrice: 19500, currency: 'ARS', buyDate: `${months[1]}-10`, broker: 'IOL', manualPrice: null, annualRate: null, note: '' },
    { id: uid(), type: 'cedear', symbol: 'AAPL', name: 'Apple', quantity: 25, buyPrice: 24000, currency: 'ARS', buyDate: `${months[2]}-05`, broker: 'IOL', manualPrice: null, annualRate: null, note: '' },
    { id: uid(), type: 'accion_ar', symbol: 'GGAL', name: 'Grupo Galicia', quantity: 150, buyPrice: 5200, currency: 'ARS', buyDate: `${months[0]}-20`, broker: 'Balanz', manualPrice: null, annualRate: null, note: '' },
    { id: uid(), type: 'bono', symbol: 'AL30D', name: 'Bonar 2030 (USD)', quantity: 1000, buyPrice: 58, currency: 'USD', buyDate: `${months[2]}-15`, broker: 'Balanz', manualPrice: null, annualRate: null, note: '' },
    { id: uid(), type: 'cripto', symbol: 'bitcoin', name: 'Bitcoin', quantity: 0.015, buyPrice: 82000, currency: 'USD', buyDate: `${months[3]}-01`, broker: 'Binance', manualPrice: null, annualRate: null, note: '' },
    { id: uid(), type: 'cripto', symbol: 'ethereum', name: 'Ethereum', quantity: 0.4, buyPrice: 2600, currency: 'USD', buyDate: `${months[4]}-11`, broker: 'Binance', manualPrice: null, annualRate: null, note: '' },
    { id: uid(), type: 'plazo_fijo', symbol: 'PF', name: 'Plazo fijo 30 días', quantity: 1, buyPrice: 1_000_000, currency: 'ARS', buyDate: `${months[7]}-01`, broker: 'Banco', manualPrice: null, annualRate: 30, note: '' },
  ];

  // no generar movimientos con fecha futura
  const today = todayISO();
  return {
    ...base,
    transactions: tx.filter((t) => t.date <= today),
    goals,
    savings: savings.filter((s) => s.date <= today),
    dollarOps,
    investments,
  };
}
