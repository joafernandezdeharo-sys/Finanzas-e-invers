import type { PriceAlert } from '../types';

export interface AlertReading {
  price: number | null;
  changePct: number | null;
}

/** ¿Se cumple la condición de la alerta? */
export function alertTriggered(a: PriceAlert, r: AlertReading): boolean {
  if (!a.active) return false;
  if (a.op === 'variacion') return r.changePct != null && Math.abs(r.changePct) >= a.value;
  if (r.price == null) return false;
  return a.op === 'mayor' ? r.price >= a.value : r.price <= a.value;
}

/** Evita repetir el mismo aviso: una alerta suena como máximo una vez por día */
export const alreadyToday = (a: PriceAlert, today: string) => !!a.lastTriggered && a.lastTriggered.slice(0, 10) === today;
