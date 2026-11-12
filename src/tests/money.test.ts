import { describe, expect, it } from 'vitest';
import { makeInflationFactor, makeRateOn } from '../lib/fx';
import { computePosition, valueInvestment } from '../lib/portfolio';
import { accountBalances } from '../lib/accounts';
import { dayInMonth, pendingRecurring } from '../lib/recurring';
import { installmentPlans, installmentSchedule } from '../lib/installments';
import { alertTriggered } from '../lib/alerts';
import type { Investment, Recurring, Transaction } from '../types';

describe('dólar de cada fecha', () => {
  const rateOn = makeRateOn([{ fecha: '2026-01-02', venta: 1000 }, { fecha: '2026-06-01', venta: 1300 }, { fecha: '2026-11-01', venta: 1500 }], 1550);
  it('usa la cotización del último día hábil anterior', () => {
    expect(rateOn('2026-03-15')).toBe(1000);
    expect(rateOn('2026-06-01')).toBe(1300);
    expect(rateOn('2026-10-31')).toBe(1300);
  });
  it('después del último dato usa la cotización actual; antes del primero, el primero', () => {
    expect(rateOn('2026-11-12')).toBe(1550);
    expect(rateOn('2020-01-01')).toBe(1000);
  });
});

describe('pesos de hoy (inflación)', () => {
  const { factor, lastMonth } = makeInflationFactor([{ month: '2026-08', pct: 2 }, { month: '2026-09', pct: 10 }, { month: '2026-10', pct: 5 }]);
  it('lleva pesos de un mes al último mes publicado', () => {
    expect(lastMonth).toBe('2026-10');
    expect(factor('2026-10-15')).toBe(1);
    expect(factor('2026-09-10')).toBeCloseTo(1.05);
    expect(factor('2026-08-01')).toBeCloseTo(1.1 * 1.05);
    expect(factor('2026-12-01')).toBe(1);
  });
});

describe('inversiones con operaciones', () => {
  const rateOn = (d: string) => (d < '2026-06-01' ? 1000 : 1500);
  const inv: Investment = {
    id: 'i', type: 'cedear', symbol: 'SPY', name: '', quantity: 0, buyPrice: 0, currency: 'ARS', buyDate: '2026-01-10', broker: '', manualPrice: null, annualRate: null, note: '',
    ops: [
      { id: '1', date: '2026-01-10', kind: 'compra', quantity: 10, price: 10000, currency: 'ARS' },
      { id: '2', date: '2026-07-10', kind: 'compra', quantity: 10, price: 20000, currency: 'ARS' },
      { id: '3', date: '2026-08-10', kind: 'venta', quantity: 5, price: 30000, currency: 'ARS' },
      { id: '4', date: '2026-09-10', kind: 'dividendo', quantity: 0, price: 1500, currency: 'ARS' },
      { id: '5', date: '2026-09-10', kind: 'comision', quantity: 0, price: 500, currency: 'ARS' },
    ],
  };
  it('precio promedio ponderado; la venta no lo cambia', () => {
    const p = computePosition(inv, rateOn);
    expect(p.quantity).toBe(15);
    expect(p.avgPrice).toBeCloseTo(15000);
    // venta de 5 a 30.000 con promedio 15.000 → +75.000, menos 500 de comisión
    expect(p.realized.ARS).toBeCloseTo(74500);
    expect(p.dividends.ARS).toBe(1500);
  });
  it('el costo en dólares usa el dólar de cada compra', () => {
    const p = computePosition(inv, rateOn);
    // compras: 100.000/1000 = 100 USD y 200.000/1500 = 133,33 USD; se vendió 1/4 → queda 175 USD
    expect(p.basis.USD).toBeCloseTo((100 + 133.333) * 0.75, 1);
    const v = valueInvestment(inv, { price: 30000, currency: 'ARS', changePct: 1, source: 'x' }, 'USD', 1500, rateOn);
    expect(v.value).toBeCloseTo(300); // 15 × 30.000 / 1500
    expect(v.pnl).toBeCloseTo(300 - 175, 0);
  });
  it('los bonos cotizan cada 100 nominales', () => {
    const bono: Investment = { ...inv, type: 'bono', ops: [{ id: 'b', date: '2026-01-10', kind: 'compra', quantity: 1000, price: 60, currency: 'USD' }] };
    expect(valueInvestment(bono, { price: 70, currency: 'USD', changePct: 0, source: 'x' }, 'USD', 1500, rateOn).value).toBeCloseTo(700);
  });
});

describe('saldos de cuentas', () => {
  const tx = (p: Partial<Transaction>): Transaction => ({ id: Math.random().toString(), date: '2026-11-05', type: 'gasto', amount: 0, currency: 'ARS', category: '', description: '', account: 'Banco', ...p });
  it('saldo inicial + movimientos posteriores; las transferencias mueven saldos', () => {
    const b = accountBalances(['Banco', 'MP'], { Banco: { currency: 'ARS', kind: 'banco', opening: 1000, openingDate: '2026-11-01' } }, [
      tx({ date: '2026-10-30', amount: 999 }), // anterior al saldo inicial: no cuenta
      tx({ type: 'ingreso', amount: 500 }),
      tx({ amount: 200, internal: true }),
      tx({ type: 'ingreso', amount: 200, internal: true, account: 'MP' }),
      tx({ amount: 10, currency: 'USD' }),
    ]);
    const banco = b.find((a) => a.name === 'Banco')!;
    expect(banco.balances).toEqual({ ARS: 1300, USD: -10 });
    expect(b.find((a) => a.name === 'MP')!.balances.ARS).toBe(200);
  });
});

describe('gastos fijos', () => {
  const r: Recurring = { id: 'r1', description: 'Alquiler', type: 'gasto', amount: 600000, currency: 'ARS', category: 'Alquiler', account: 'Banco', day: 31, start: '2026-09', end: '', active: true };
  it('genera un movimiento por mes hasta hoy y no repite', () => {
    const first = pendingRecurring([r], [], '2026-11-12');
    expect(first.map((t) => t.date)).toEqual(['2026-09-30', '2026-10-31']);
    const again = pendingRecurring([r], first.map((t, i) => ({ ...t, id: String(i) })), '2026-11-12');
    expect(again).toHaveLength(0);
  });
  it('el día 31 en febrero cae el último día', () => {
    expect(dayInMonth('2026-02', 31)).toBe('2026-02-28');
  });
});

describe('cuotas', () => {
  it('proyecta las cuotas que faltan', () => {
    const t = (n: number, date: string): Transaction => ({ id: String(n), date, type: 'gasto', amount: 1000, currency: 'ARS', category: 'Hogar', description: `FRAVEGA C.0${n}/06`, account: 'Visa', installment: { n, total: 6 } });
    const plans = installmentPlans([t(1, '2026-09-10'), t(2, '2026-10-10')]);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ paid: 2, remaining: 4, nextMonth: '2026-11', description: 'FRAVEGA' });
    const s = installmentSchedule(plans, '2026-11', 6);
    expect(s.map((x) => x.ARS)).toEqual([1000, 1000, 1000, 1000, 0, 0]);
  });
});

describe('alertas', () => {
  const base = { id: 'a', kind: 'dolar' as const, target: 'blue', active: true, lastTriggered: null };
  it('precio mayor / menor / variación', () => {
    expect(alertTriggered({ ...base, op: 'mayor', value: 1600 }, { price: 1610, changePct: null })).toBe(true);
    expect(alertTriggered({ ...base, op: 'mayor', value: 1600 }, { price: 1590, changePct: null })).toBe(false);
    expect(alertTriggered({ ...base, op: 'menor', value: 1500 }, { price: 1490, changePct: null })).toBe(true);
    expect(alertTriggered({ ...base, op: 'variacion', value: 5 }, { price: 1, changePct: -6 })).toBe(true);
    expect(alertTriggered({ ...base, active: false, op: 'mayor', value: 1 }, { price: 2, changePct: null })).toBe(false);
  });
});
