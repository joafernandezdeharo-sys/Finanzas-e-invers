import { describe, expect, it } from 'vitest';
import { detectDecimal, parseAmount, parseDate } from '../lib/importer/normalize';

describe('parseAmount: montos en formato argentino y extranjero', () => {
  it.each([
    ['$ -1.234,56', -1234.56],
    ['(1.234,56)', -1234.56],
    ['1.234,56-', -1234.56],
    ['1,234.56', 1234.56],
    ['U$S 12,00', 12],
    ['1.234', 1234],
    ['-74,07', -74.07],
    ['25432.5', 25432.5],
    ['', null],
    ['abc', null],
  ])('%s → %s', (raw, expected) => expect(parseAmount(raw)).toBe(expected));

  it('respeta el separador decimal detectado en el archivo', () => {
    expect(parseAmount('1.234', '.')).toBe(1.234);
    expect(detectDecimal(['1.234,50', '10,00'])).toBe(',');
    expect(detectDecimal(['1234.5', '10.00'])).toBe('.');
  });
});

describe('parseDate', () => {
  it.each([
    ['05/11/2026', '2026-11-05'],
    ['05-Nov-26', '2026-11-05'],
    ['5 de noviembre de 2026', '2026-11-05'],
    ['05.11.26', '2026-11-05'],
    ['2026-11-05T10:00:00-03:00', '2026-11-05'],
    ['20261105', '2026-11-05'],
  ])('%s → %s', (raw, expected) => expect(parseDate(raw)).toBe(expected));

  it('fechas sin año usan el año indicado', () => {
    expect(parseDate('05/11', { order: 'dmy', defaultYear: 2025 })).toBe('2025-11-05');
  });
  it('rechaza fechas imposibles', () => {
    expect(parseDate('31/02/2026')).toBeNull();
    expect(parseDate('hola')).toBeNull();
  });
  it('convierte fechas de Excel (número de serie)', () => {
    expect(parseDate(46331)).toBe('2026-11-05');
  });
});
