import { describe, expect, it } from 'vitest';
import { parseCsv } from '../lib/importer/readers';
import { analyze } from '../lib/importer/analyze';
import { buildCandidates, categorize, detectInstallment } from '../lib/importer/finalize';
import type { Transaction } from '../types';

const fallback = { ingreso: 'Otros ingresos', gasto: 'Otros gastos' };
const run = (csv: string, existing: Transaction[] = [], extra = {}) => {
  const a = analyze({ format: 'csv', rows: parseCsv(csv), text: csv }, { defaultCurrency: 'ARS' });
  return buildCandidates(a.rows, { positiveIsExpense: a.suggestPositiveIsExpense, rules: [], existing, fallback, ...extra });
};

const GALICIA = `Fecha;Concepto;Débito;Crédito;Saldo
05/11/2026;COMPRA DEBITO COTO SUC 123;12.345,67;;150.000,00
04/11/2026;ACRED. HABERES EMPRESA SA;;1.800.000,00;162.345,67
03/11/2026;DEBITO AUTOMATICO NETFLIX.COM;9.999,00;;-1.000,00
02/11/2026;PAGO VISA GALICIA;250.000,00;;0
01/11/2026;SALDO ANTERIOR;;;100.000,00`;

const MP = `"RELEASE_DATE","TRANSACTION_TYPE","REFERENCE_ID","TRANSACTION_NET_AMOUNT","PARTIAL_BALANCE"
"2026-11-01T10:22:33.000-03:00","Pago con QR Carrefour","1234567","-25432.5","100000.00"
"2026-11-02T08:00:00.000-03:00","Transferencia recibida de Juan Perez","1234568","50000","150000"`;

describe('importación de resúmenes', () => {
  it('lee un extracto con columnas débito/crédito y categoriza', () => {
    const c = run(GALICIA);
    const byDesc = Object.fromEntries(c.map((x) => [x.description, x]));
    expect(byDesc['COMPRA DEBITO COTO SUC 123']).toMatchObject({ type: 'gasto', amount: 12345.67, category: 'Supermercado' });
    expect(byDesc['ACRED. HABERES EMPRESA SA']).toMatchObject({ type: 'ingreso', amount: 1800000, category: 'Sueldo' });
    expect(byDesc['DEBITO AUTOMATICO NETFLIX.COM'].category).toBe('Suscripciones');
  });

  it('marca el pago de la tarjeta como movimiento entre cuentas', () => {
    const pago = run(GALICIA).find((x) => x.description === 'PAGO VISA GALICIA')!;
    expect(pago.internal).toBe(true);
  });

  it('lee el reporte de Mercado Pago (montos con signo y punto decimal)', () => {
    const c = run(MP);
    expect(c[0]).toMatchObject({ type: 'gasto', amount: 25432.5, category: 'Supermercado', date: '2026-11-01' });
    expect(c[1]).toMatchObject({ type: 'ingreso', amount: 50000 });
  });

  it('no duplica movimientos ya importados', () => {
    const first = run(MP);
    const existing = first.map((c, i) => ({ id: String(i), date: c.date, type: c.type, amount: c.amount, currency: c.currency, category: c.category, description: c.description, account: 'MP' }));
    const again = run(MP, existing);
    expect(again.every((c) => c.status === 'duplicado' && !c.include)).toBe(true);
  });

  it('reconoce un gasto fijo ya cargado automáticamente', () => {
    const fijo: Transaction = { id: 'r', date: '2026-11-04', type: 'gasto', amount: 12345.67, currency: 'ARS', category: 'Supermercado', description: 'Super', account: 'Banco', recurringId: 'x' };
    const c = run(GALICIA, [fijo]).find((x) => x.description.startsWith('COMPRA DEBITO COTO'))!;
    expect(c.status).toBe('duplicado');
  });

  it('detecta un pase entre cuentas por la otra punta en otra cuenta', () => {
    const otra: Transaction = { id: 'o', date: '2026-11-01', type: 'ingreso', amount: 25432.5, currency: 'ARS', category: 'x', description: 'Ingreso', account: 'Banco' };
    const c = run(MP, [otra], { account: 'Mercado Pago' });
    expect(c[0].internal).toBe(true);
  });

  it('detecta cuotas', () => {
    expect(detectInstallment('FRAVEGA C.03/06', false)).toEqual({ n: 3, total: 6 });
    expect(detectInstallment('Cuota 2 de 12 Garbarino', false)).toEqual({ n: 2, total: 12 });
    expect(detectInstallment('FRAVEGA 03/06', true)).toEqual({ n: 3, total: 6 });
    expect(detectInstallment('TRANSFERENCIA 05/11', false)).toBeUndefined();
  });

  it('las reglas del usuario tienen prioridad sobre las automáticas', () => {
    expect(categorize('PAGO GIMNASIO SPORTCLUB', 'gasto', [{ keyword: 'sportclub', category: 'Salud' }], fallback)).toBe('Salud');
    expect(categorize('COMPRA*COTO 123', 'gasto', [], fallback)).toBe('Supermercado');
    expect(categorize('algo raro', 'gasto', [], fallback)).toBe('Otros gastos');
  });
});
