# Mis Finanzas

App web para manejar tus finanzas personales día a día: ingresos y gastos, ahorro, dólares e inversiones, con cotizaciones y noticias en tiempo real.

## Secciones

| Sección | Qué hace |
|---|---|
| **Resumen** | Balance del mes, patrimonio neto, inversiones, dólares, fijos que faltan, cuotas del mes que viene, metas e ingresos vs. gastos de 12 meses. |
| **Ingresos y gastos** | Tabla con filtros (mes, tipo, categoría, cuenta, moneda, origen, búsqueda), movimientos entre cuentas, cuotas, gráfico por categoría y exportación a CSV. |
| **Importar resúmenes** | PDF (también escaneados), fotos/capturas, Excel, CSV u OFX de cualquier banco, billetera o tarjeta argentina. Detecta columnas, montos, moneda, banco, cuotas, pagos de tarjeta y pases entre cuentas propias; categoriza solo y no duplica. |
| **Presupuesto y fijos** | Proyección de fin de mes, presupuesto por categoría con avisos al 90% y 100%, gastos/ingresos fijos que se cargan solos y cuotas comprometidas por mes. |
| **Historial** | Mes a mes y año a año, con filtros por año y origen. |
| **Patrimonio** | Saldo de cada cuenta (con ajuste al saldo real), dólares, inversiones y deuda de tarjetas en un solo número. |
| **Ahorro** | Metas en ARS o USD con progreso y cuota mensual sugerida (lo apartado no se suma dos veces al patrimonio). |
| **Dólar** | Cotizaciones en vivo, oficial del BCRA, histórico, calculadora y registro de compras/ventas vinculado a tus cuentas. |
| **Inversiones** | Registro de operaciones (compras, ventas parciales, dividendos, comisiones), precio promedio, resultado realizado y no realizado, gráfico y precios en vivo. |
| **Mercado** | Indicadores oficiales del BCRA, riesgo país, índices, commodities y ADRs argentinos. |
| **Alertas** | Aviso cuando el dólar o una inversión llegan a un precio o se mueven un %, con notificaciones. |
| **Fuentes de datos** | De dónde sale cada número, prueba en vivo de cada fuente y guía para conectar Yahoo y la sincronización. |
| **Configuración** | Sincronización, bloqueo con PIN/huella, instalar como app, categorías, cuentas, reglas, noticias, backup. |

## Cómo se calculan los números

- **Ingresos y gastos con el dólar de su fecha:** un gasto en dólares de marzo se pasa a pesos con el dólar de marzo (y al revés), usando el histórico del tipo de dólar elegido en Configuración. Los saldos y valores actuales se convierten con el dólar de hoy.
- **Pesos de hoy:** el interruptor "Pesos de hoy" ajusta montos pasados por la inflación mensual oficial (INDEC, vía BCRA), para comparar meses en términos reales.
- **Movimientos entre cuentas propias** (pagar la tarjeta, pasar a Mercado Pago, comprar dólares) mueven saldos pero no cuentan como ingreso ni gasto.
- **Inversiones:** método de precio promedio ponderado; el costo en dólares de cada compra usa el dólar de su fecha, así el rendimiento en USD es real.

## Fuentes de datos

Priorizamos fuentes **oficiales** y de **mercado**; los agregadores se usan solo donde no hay una fuente oficial accesible. La sección *Fuentes de datos* de la app muestra este detalle y permite probar cada fuente en vivo.

| Dato | Fuente | Tipo |
|---|---|---|
| Acciones argentinas, CEDEARs, acciones de EE.UU./ADRs, cripto, índices (Merval, S&P 500, Nasdaq…), oro, petróleo, gráficos históricos | [Yahoo Finance](https://finance.yahoo.com) (requiere el puente, ver abajo) | Mercado |
| Dólar oficial mayorista (Com. A 3500) y minorista, reservas, tasas (BADLAR, TAMAR, plazo fijo), inflación (INDEC), REM, UVA, CER, ICL | [API oficial del BCRA](https://www.bcra.gob.ar/BCRAyVos/catalogo-de-APIs-banco-central.asp) | Oficial |
| Bonos y ONs (AL30, GD30…); respaldo de acciones y CEDEARs | [BYMA](https://www.byma.com.ar) vía [data912](https://data912.com) | Mercado |
| Dólar blue, MEP, CCL, cripto, tarjeta | [DolarAPI](https://dolarapi.com) (el blue no tiene fuente oficial) | Agregador |
| Histórico del dólar, riesgo país (JP Morgan EMBI) | [ArgentinaDatos](https://argentinadatos.com) | Agregador |
| Respaldo de cripto y buscador | [CoinGecko](https://www.coingecko.com) | Agregador |
| Respaldo opcional de acciones de EE.UU. | [Finnhub](https://finnhub.io) (API key gratis) | Agregador |
| Noticias | Ámbito, Infobae, La Nación, Google News (RSS) | Prensa |

Si una fuente no responde, la app pasa automáticamente a la siguiente y muestra debajo de cada precio de dónde salió.

### Conectar Yahoo Finance (una sola vez, gratis)

Yahoo Finance no permite que una página web consulte sus precios directamente desde el navegador, y los intermediarios públicos gratuitos no son confiables. Por eso se usa un **puente propio** en Cloudflare Workers (plan gratuito: 100.000 consultas por día). El código está en [`proxy/yahoo-worker.js`](proxy/yahoo-worker.js): solo deja pasar consultas de cotizaciones, gráficos y búsqueda de Yahoo Finance.

1. Crear una cuenta gratuita en [dash.cloudflare.com](https://dash.cloudflare.com/sign-up).
2. *Workers & Pages* → *Create* → *Create Worker* → nombre `yahoo-finanzas` → *Deploy*.
3. *Edit code* → reemplazar todo por el contenido de `proxy/yahoo-worker.js` → *Deploy*.
4. Copiar la dirección del Worker (`https://yahoo-finanzas.<usuario>.workers.dev`) y pegarla en la app, en *Fuentes de datos → Conectar Yahoo Finance*.

Sin el puente, la app funciona igual usando BYMA (vía data912) y CoinGecko.

## Importación de resúmenes

- **Se acumula:** cada archivo nuevo se suma a lo que ya tenías. Si subís dos veces el mismo resumen (o dos resúmenes que se superponen), los movimientos repetidos se detectan y se omiten.
- **Historial de importaciones:** cada archivo queda registrado (origen, período, cantidad, totales) y se puede deshacer individualmente.
- **Borrar memoria:** elimina todos los movimientos importados y el historial de archivos, sin tocar lo que cargaste a mano.
- **Aprende:** si cambiás la categoría de un movimiento al importar, se guarda como regla para los próximos resúmenes (editables en Configuración).
- **PDF con contraseña:** se pide la contraseña (suele ser el DNI) y se usa solo para leer el archivo.
- Los archivos se procesan **en tu dispositivo**: no se suben a ningún servidor.

## Sincronización entre dispositivos

Opcional, usando el mismo puente de Cloudflare: los datos se cifran **en tu dispositivo** con una frase secreta (AES-256-GCM, clave derivada con PBKDF2) antes de subirse; en la nube solo queda contenido ilegible. Cada dispositivo usa la misma frase. Si dos dispositivos cambian algo a la vez, gana la versión más reciente y la otra queda guardada como copia. Configuración paso a paso en la sección *Fuentes de datos* de la app (hay que vincular un espacio Workers KV llamado `SYNC`).

## Privacidad

Todos tus datos se guardan en tu navegador (localStorage). No hay servidor ni cuenta: la única copia fuera del dispositivo es la sincronización cifrada, si la activás. La app avisa si pasan más de 14 días sin backup ni sincronización. El bloqueo con PIN/huella evita que alguien que agarre tu dispositivo vea tus finanzas, pero no cifra los datos guardados en el navegador.

## Cómo usarla

Requisitos: Node.js 20+.

```bash
npm install
npm run dev       # modo desarrollo en http://localhost:5173
npm run build     # genera la versión estática en dist/
npm run preview   # sirve dist/ localmente
npm test          # pruebas automáticas (vitest)
npm run check     # tipos + pruebas
```

Cada cambio en GitHub corre las pruebas y la compilación (`.github/workflows/ci.yml`); al actualizar `main`, se publica sola en GitHub Pages.

**Versión en un solo archivo:** `npm run build:single` genera `dist-single/index.html` (copia en `MisFinanzas.html`), que se abre con doble clic sin instalar nada.

La carpeta `dist/` es un sitio estático: se puede publicar gratis en GitHub Pages, Netlify, Vercel, etc.

Para probarla rápido: *Configuración → Cargar datos de ejemplo*.

## Tecnologías

React 19 + TypeScript + Vite, Recharts (gráficos), React Router, SheetJS (Excel), PDF.js (PDF), Tesseract.js (OCR), Vitest (pruebas). App instalable (PWA) con service worker.
