# Mis Finanzas

App web para manejar tus finanzas personales día a día: ingresos y gastos, ahorro, dólares e inversiones, con cotizaciones y noticias en tiempo real.

## Secciones

| Sección | Qué hace |
|---|---|
| **Resumen** | Balance del mes, ahorro, valor de la cartera, dólares comprados, gráfico de ingresos vs. gastos (12 meses), mayores gastos, presupuesto mensual y metas. |
| **Ingresos y gastos** | Tabla con filtros desplegables (mes, tipo, categoría, cuenta, moneda, búsqueda), orden por columna, gráfico por categoría y exportación a CSV. |
| **Importar resúmenes** | Subí extractos y resúmenes de cualquier banco, billetera o tarjeta de Argentina (Mercado Pago, Ualá, Brubank, Naranja X, Galicia, Santander, BBVA, Macro, ICBC, Nación, Provincia, Visa, Mastercard, Amex y más) en **PDF, Excel, CSV u OFX**. Detecta solo las columnas, fechas, montos en pesos y dólares, el banco de origen y si es un resumen de tarjeta; categoriza automáticamente y omite movimientos repetidos. Muestra una vista previa para revisar antes de importar. |
| **Historial** | Todo lo acumulado mes a mes y año a año: ingresos, gastos, balance, % de ahorro y en qué se fue la plata, con filtros por año y por banco/app. |
| **Ahorro** | Metas de ahorro en ARS o USD con progreso, fecha límite y cuota mensual sugerida; aportes y retiros; evolución del ahorro acumulado. |
| **Dólar** | Cotizaciones en vivo (oficial, blue, MEP, CCL, mayorista, cripto, tarjeta), histórico (1M a 5A), calculadora, y registro de tus compras y ventas con el precio que pagaste, precio promedio y ganancia/pérdida contra hoy. |
| **Mercado** | Indicadores oficiales del BCRA (dólar A 3500, reservas, inflación, tasas, UVA, CER), riesgo país, índices, commodities y ADRs argentinos con gráficos históricos. |
| **Fuentes de datos** | De dónde sale cada dato, con prueba en vivo de cada fuente y la guía para conectar Yahoo Finance. |
| **Inversiones** | CEDEARs, acciones argentinas y de EE.UU., bonos/ONs, cripto, plazos fijos (con TNA), FCIs y otros. Precio en vivo, variación diaria, resultado por activo y total, distribución de la cartera. |
| **Noticias** | Feed de noticias de economía y mercados (Ámbito, Infobae, La Nación, Google News…) con filtro por fuente y búsqueda. Podés agregar cualquier RSS. |
| **Configuración** | Nombre, tema claro/oscuro, moneda de visualización, dólar usado para convertir, presupuesto, frecuencia de actualización, categorías, cuentas, fuentes de noticias, API keys, backup/importación JSON, datos de ejemplo. |

En la barra superior podés cambiar en cualquier momento entre **pesos y dólares**: todos los montos se convierten con el tipo de dólar que elijas en Configuración.

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

## Privacidad

Todos tus datos se guardan **solo en tu navegador** (localStorage). No hay servidor ni cuenta. Usá *Configuración → Exportar backup* para guardar una copia o pasar tus datos a otro dispositivo.

## Cómo usarla

Requisitos: Node.js 20+.

```bash
npm install
npm run dev       # modo desarrollo en http://localhost:5173
npm run build     # genera la versión estática en dist/
npm run preview   # sirve dist/ localmente
```

**Versión en un solo archivo:** `npm run build:single` genera `dist-single/index.html` (copia en `MisFinanzas.html`), que se abre con doble clic sin instalar nada.

La carpeta `dist/` es un sitio estático: se puede publicar gratis en GitHub Pages, Netlify, Vercel, etc.

Para probarla rápido: *Configuración → Cargar datos de ejemplo*.

## Tecnologías

React 19 + TypeScript + Vite, Recharts para gráficos, React Router.
