import { SOURCES } from '../defaults';
import { norm } from './normalize';

const ALIASES: [RegExp, string][] = [
  [/mercado ?pago|mercadopago|\bmp\b/, 'Mercado Pago'],
  [/\buala\b/, 'Ualá'],
  [/brubank/, 'Brubank'],
  [/naranja ?x/, 'Naranja X'],
  [/personal ?pay/, 'Personal Pay'],
  [/\blemon\b/, 'Lemon'],
  [/\bbelo\b/, 'Belo'],
  [/\bprex\b/, 'Prex'],
  [/cuenta ?dni/, 'Cuenta DNI'],
  [/\bmodo\b/, 'MODO'],
  [/\breba\b/, 'Reba'],
  [/openbank/, 'Openbank'],
  [/wilobank/, 'Wilobank'],
  [/galicia mas|\bhsbc\b/, 'Banco Galicia Más (ex HSBC)'],
  [/galicia/, 'Banco Galicia'],
  [/santander/, 'Banco Santander'],
  [/bbva|frances/, 'BBVA'],
  [/macro/, 'Banco Macro'],
  [/\bicbc\b/, 'ICBC'],
  [/nacion|\bbna\b/, 'Banco Nación'],
  [/provincia|\bbapro\b/, 'Banco Provincia'],
  [/banco ciudad|bancociudad/, 'Banco Ciudad'],
  [/credicoop/, 'Banco Credicoop'],
  [/patagonia/, 'Banco Patagonia'],
  [/supervielle/, 'Banco Supervielle'],
  [/comafi/, 'Banco Comafi'],
  [/hipotecario/, 'Banco Hipotecario'],
  [/columbia/, 'Banco Columbia'],
  [/\bbind\b|banco industrial/, 'BIND Banco Industrial'],
  [/bancor|banco de cordoba/, 'Bancor (Córdoba)'],
  [/banco (de )?santa fe/, 'Banco Santa Fe'],
  [/entre rios/, 'Banco Entre Ríos'],
  [/american express|\bamex\b/, 'American Express'],
  [/tarjeta naranja/, 'Tarjeta Naranja'],
  [/cencosud/, 'Cencosud'],
  [/\bcabal\b/, 'Cabal'],
  [/mastercard/, 'Mastercard'],
  [/\bvisa\b/, 'Visa'],
];

/** Intenta adivinar el banco/app por el nombre del archivo y su contenido */
export function detectSource(fileName: string, text: string): string | null {
  const name = norm(fileName.replace(/[_\-.]+/g, ' '));
  const body = norm(text.slice(0, 3000));
  for (const hay of [name, body]) {
    for (const [re, src] of ALIASES) if (re.test(hay)) return SOURCES.includes(src) ? src : null;
  }
  return null;
}

const CARD_SOURCES = ['Visa', 'Mastercard', 'American Express', 'Cabal', 'Tarjeta Naranja', 'Cencosud'];
const WALLETS = ['Mercado Pago', 'Ualá', 'Brubank', 'Naranja X', 'Personal Pay', 'Lemon', 'Belo', 'Prex', 'Cuenta DNI', 'MODO', 'Reba', 'Openbank', 'Wilobank'];

export const isCardSource = (s: string) => CARD_SOURCES.includes(s);

/** Cuenta sugerida según el tipo de origen */
export function suggestAccount(source: string, isCard: boolean, accounts: string[]): string {
  const pick = (...names: string[]) => names.find((n) => accounts.includes(n));
  if (accounts.includes(source)) return source;
  if (isCard || isCardSource(source)) return pick('Tarjeta de crédito') ?? accounts[0] ?? '';
  if (WALLETS.includes(source)) return pick('Billetera virtual') ?? accounts[0] ?? '';
  return pick('Banco') ?? accounts[0] ?? '';
}
