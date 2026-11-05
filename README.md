# Mis Finanzas

App web para manejar tus finanzas personales día a día: ingresos y gastos, ahorro, dólares e inversiones, con cotizaciones y noticias en tiempo real.

## Secciones

| Sección | Qué hace |
|---|---|
| **Resumen** | Balance del mes, ahorro, valor de la cartera, dólares comprados, gráfico de ingresos vs. gastos (12 meses), mayores gastos, presupuesto mensual y metas. |
| **Ingresos y gastos** | Tabla con filtros desplegables (mes, tipo, categoría, cuenta, moneda, búsqueda), orden por columna, gráfico por categoría y exportación a CSV. |
| **Ahorro** | Metas de ahorro en ARS o USD con progreso, fecha límite y cuota mensual sugerida; aportes y retiros; evolución del ahorro acumulado. |
| **Dólar** | Cotizaciones en vivo (oficial, blue, MEP, CCL, mayorista, cripto, tarjeta), histórico (1M a 5A), calculadora, y registro de tus compras y ventas con el precio que pagaste, precio promedio y ganancia/pérdida contra hoy. |
| **Inversiones** | CEDEARs, acciones argentinas y de EE.UU., bonos/ONs, cripto, plazos fijos (con TNA), FCIs y otros. Precio en vivo, variación diaria, resultado por activo y total, distribución de la cartera. |
| **Noticias** | Feed de noticias de economía y mercados (Ámbito, Infobae, La Nación, Google News…) con filtro por fuente y búsqueda. Podés agregar cualquier RSS. |
| **Configuración** | Nombre, tema claro/oscuro, moneda de visualización, dólar usado para convertir, presupuesto, frecuencia de actualización, categorías, cuentas, fuentes de noticias, API keys, backup/importación JSON, datos de ejemplo. |

En la barra superior podés cambiar en cualquier momento entre **pesos y dólares**: todos los montos se convierten con el tipo de dólar que elijas en Configuración.

## Fuentes de datos en tiempo real

| Dato | Fuente | Requiere key |
|---|---|---|
| Cotizaciones del dólar | [DolarAPI](https://dolarapi.com) | No |
| Histórico del dólar | [ArgentinaDatos](https://argentinadatos.com) | No |
| CEDEARs, acciones, bonos y ONs (BYMA) y acciones EE.UU. | [data912](https://data912.com) | No |
| Criptomonedas | [CoinGecko](https://www.coingecko.com) | No |
| Acciones EE.UU. (alternativa) | [Finnhub](https://finnhub.io) | Sí (gratis) |
| Noticias (RSS) | rss2json + proxies CORS públicos | Opcional |

Las cotizaciones se refrescan automáticamente (cada 60 s por defecto, configurable).

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
