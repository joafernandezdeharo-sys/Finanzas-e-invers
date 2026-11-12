import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store/AppStore';
import { useLive } from '../store/LiveData';
import { Card, Empty, Field, Modal, NumberInput, PageHead, Stat } from '../components/ui';
import { IconEdit } from '../components/Icons';
import { useThemeColors } from '../components/charts';
import { ACCOUNT_KINDS } from '../lib/defaults';
import { accountBalances, openingForRealBalance, unlinkedUsd, type AccountBalance } from '../lib/accounts';
import { valueInvestment } from '../lib/portfolio';
import { formatDate, formatMoney, sum, todayISO } from '../lib/util';
import type { AccountInfo, AccountKind, Currency } from '../types';

function AccountForm({ acc, onClose }: { acc: AccountBalance; onClose: () => void }) {
  const { data, setSettings } = useStore();
  const [info, setInfo] = useState<AccountInfo>(acc.info);
  const [real, setReal] = useState<number | null>(null);
  const [realCur, setRealCur] = useState<Currency>(acc.info.currency);

  const save = () => {
    let next = { ...info };
    if (real != null) next = { ...next, ...openingForRealBalance(real, todayISO()), currency: realCur };
    setSettings({ accountInfo: { ...data.settings.accountInfo, [acc.name]: next } });
    onClose();
  };

  return (
    <Modal title={`Cuenta: ${acc.name}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn btn-primary" onClick={save}>Guardar</button></>}>
      <div className="form-grid">
        <Field label="Tipo de cuenta">
          <select className="select" value={info.kind} onChange={(e) => setInfo({ ...info, kind: e.target.value as AccountKind })}>
            {ACCOUNT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </Field>
        <Field label="Moneda principal">
          <select className="select" value={info.currency} onChange={(e) => { setInfo({ ...info, currency: e.target.value as Currency }); setRealCur(e.target.value as Currency); }}>
            <option value="ARS">Pesos</option><option value="USD">Dólares</option>
          </select>
        </Field>
        <div className="full alert">
          <b>¿El saldo no coincide con el real?</b> Escribí cuánto tenés hoy en esta cuenta y la app ajusta el punto de partida.
          Los movimientos de hoy o anteriores quedan incluidos; los que cargues o importes después de hoy lo van actualizando.
        </div>
        <Field label={`Saldo real hoy (${realCur})`} hint={info.openingDate ? `Último ajuste: ${formatDate(info.openingDate)} con ${formatMoney(info.opening, info.currency)}` : 'Todavía no ajustaste el saldo de esta cuenta'}>
          <NumberInput value={real} onChange={setReal} placeholder={info.kind === 'tarjeta' ? 'Ej. -150000 si debés' : 'Ej. 250000'} />
        </Field>
        <Field label="Moneda del saldo">
          <select className="select" value={realCur} onChange={(e) => setRealCur(e.target.value as Currency)}>
            <option value="ARS">Pesos</option><option value="USD">Dólares</option>
          </select>
        </Field>
      </div>
    </Modal>
  );
}

export default function Patrimonio() {
  const { data } = useStore();
  const { settings, transactions, investments, savings, dollarOps } = data;
  const live = useLive();
  const colors = useThemeColors();
  const cur = settings.displayCurrency;
  const [edit, setEdit] = useState<AccountBalance | null>(null);

  const accounts = useMemo(() => accountBalances(settings.accounts, settings.accountInfo, transactions), [settings.accounts, settings.accountInfo, transactions]);
  const accValue = (a: AccountBalance) => live.toDisplay(a.balances.ARS, 'ARS') + live.toDisplay(a.balances.USD, 'USD');

  const cash = sum(accounts.filter((a) => a.info.kind !== 'tarjeta').map(accValue));
  const debt = sum(accounts.filter((a) => a.info.kind === 'tarjeta').map(accValue));
  const looseUsd = unlinkedUsd(dollarOps);
  const looseUsdValue = live.toDisplay(looseUsd, 'USD');
  const inv = sum(investments.map((i) => valueInvestment(i, live.quotes[i.id], cur, live.rate, live.rateOn).value));
  const total = cash + debt + looseUsdValue + inv;
  const earmarked = sum(savings.map((s) => live.toDisplay(s.amount, s.currency)));

  const usdTotal = sum(accounts.map((a) => a.balances.USD)) + looseUsd;
  const parts = [
    { label: 'Cuentas y efectivo', value: cash, color: colors.series[0] },
    { label: 'Inversiones', value: inv, color: colors.series[2] },
    { label: 'Dólares sin cuenta', value: looseUsdValue, color: colors.series[3] },
  ].filter((p) => p.value > 0);
  const maxPart = Math.max(1, ...parts.map((p) => p.value));
  const noBalances = accounts.every((a) => !a.info.openingDate);

  return (
    <>
      <PageHead title="Patrimonio" subtitle="Todo lo que tenés, en un solo lugar: cuentas, efectivo, dólares e inversiones, menos lo que debés en tarjetas." />

      <div className="grid grid-4">
        <Stat label="Patrimonio neto" value={formatMoney(total, cur)} tone={total >= 0 ? undefined : 'bad'} sub={`al dólar ${formatMoney(live.rate, 'ARS', { decimals: 0 })} de hoy`} />
        <Stat label="Dólares" value={formatMoney(usdTotal, 'USD')} sub="en cuentas + registrados en Dólar" />
        <Stat label="Deuda de tarjetas" value={formatMoney(-debt, cur)} tone={debt < 0 ? 'bad' : undefined} />
        <Stat label="Apartado para metas" value={formatMoney(earmarked, cur)} sub={<>Ya está dentro del total · <Link to="/ahorro">Ahorro</Link></>} />
      </div>

      {noBalances && (
        <div className="alert">
          Para que los saldos sean exactos, tocá el lápiz de cada cuenta y cargá <b>cuánto tenés hoy</b>. A partir de ahí la app los mantiene actualizados con lo que cargues o importes.
        </div>
      )}

      <div className="grid grid-3">
        <Card title="Cuentas" subtitle="Saldo calculado con tus movimientos" className="span-2">
          {accounts.length ? (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Cuenta</th><th>Tipo</th><th className="r">Pesos</th><th className="r">Dólares</th><th className="r">Total ({cur})</th><th /></tr></thead>
                <tbody>
                  {accounts.map((a) => (
                    <tr key={a.name}>
                      <td>
                        <Link to={`/movimientos?mes=&cuenta=${encodeURIComponent(a.name)}`}><b>{a.name}</b></Link>
                        <div className="small muted">{a.count} movimientos{a.info.openingDate ? ` · saldo ajustado el ${formatDate(a.info.openingDate)}` : ' · sin saldo inicial'}</div>
                      </td>
                      <td className="small">{ACCOUNT_KINDS.find((k) => k.value === a.info.kind)?.label}</td>
                      <td className={`r ${a.balances.ARS < 0 ? 'bad' : ''}`}>{a.balances.ARS ? formatMoney(a.balances.ARS, 'ARS') : <span className="muted">—</span>}</td>
                      <td className={`r ${a.balances.USD < 0 ? 'bad' : ''}`}>{a.balances.USD ? formatMoney(a.balances.USD, 'USD') : <span className="muted">—</span>}</td>
                      <td className="r"><b>{formatMoney(accValue(a), cur)}</b></td>
                      <td className="actions"><button className="btn-icon" aria-label="Editar cuenta y saldo" title="Tipo de cuenta y saldo real" onClick={() => setEdit(a)}><IconEdit /></button></td>
                    </tr>
                  ))}
                  {looseUsd !== 0 && (
                    <tr>
                      <td><Link to="/dolar"><b>Dólares registrados en Dólar</b></Link><div className="small muted">Compras sin cuenta vinculada</div></td>
                      <td className="small">Dólares</td>
                      <td className="r muted">—</td>
                      <td className="r">{formatMoney(looseUsd, 'USD')}</td>
                      <td className="r"><b>{formatMoney(looseUsdValue, cur)}</b></td>
                      <td />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : <Empty title="No tenés cuentas" />}
          <p className="small muted" style={{ marginBottom: 0 }}>
            Las cuentas se crean y renombran en <Link to="/configuracion">Configuración</Link>. Los pases entre cuentas propias (pagar la tarjeta, pasar a Mercado Pago, comprar dólares) mueven los saldos sin contar como gasto.
          </p>
        </Card>

        <Card title="Composición">
          {parts.length ? (
            <div className="list">
              {parts.map((p) => (
                <div key={p.label} className="list-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span><i className="dot" style={{ background: p.color, marginRight: 6 }} />{p.label}</span>
                    <b className="num">{formatMoney(p.value, cur, { compact: true })}</b>
                  </div>
                  <div className="progress"><div style={{ width: `${(p.value / maxPart) * 100}%`, background: p.color }} /></div>
                </div>
              ))}
              {debt < 0 && (
                <div className="list-row" style={{ justifyContent: 'space-between' }}>
                  <span><i className="dot" style={{ background: 'var(--bad)', marginRight: 6 }} />Deuda de tarjetas</span>
                  <b className="num bad">{formatMoney(debt, cur, { compact: true })}</b>
                </div>
              )}
            </div>
          ) : <Empty title="Sin datos todavía" />}
          <p className="small muted" style={{ marginBottom: 0 }}>
            Lo ahorrado en metas no se suma de nuevo: es plata que ya está en tus cuentas, solo que apartada para un objetivo.
          </p>
        </Card>
      </div>

      {edit && <AccountForm acc={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

