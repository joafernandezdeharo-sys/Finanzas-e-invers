import { useStore } from '../store/AppStore';
import { useLive } from '../store/LiveData';
import { monthLabel } from '../lib/util';

/** Interruptor "pesos de hoy": ajusta ingresos y gastos pasados por la inflación oficial (INDEC) */
export function RealTermsToggle() {
  const { data, setSettings } = useStore();
  const { inflationLastMonth } = useLive();
  if (data.settings.displayCurrency !== 'ARS') return null;
  return (
    <label className="small toggle" title={inflationLastMonth ? `Ajusta cada monto por la inflación mensual del INDEC hasta ${monthLabel(inflationLastMonth, true)} (último dato publicado)` : 'Cargando datos de inflación…'}>
      <input type="checkbox" checked={data.settings.inflationAdjusted} onChange={(e) => setSettings({ inflationAdjusted: e.target.checked })} disabled={!inflationLastMonth} />
      Pesos de hoy
    </label>
  );
}

/** Texto aclaratorio de cómo se convirtieron los montos */
export function useFlowNote() {
  const { data } = useStore();
  const { realTerms, inflationLastMonth } = useLive();
  const cur = data.settings.displayCurrency;
  if (realTerms && inflationLastMonth) return `en pesos de ${monthLabel(inflationLastMonth, true)} (ajustado por inflación)`;
  return cur === 'USD' ? 'en USD, con el dólar de cada fecha' : 'en ARS (los movimientos en USD, con el dólar de su fecha)';
}
