# Cambista

Tipo de cambio del dólar en Bolivia, en el celular: **oficial del BCB** frente al **paralelo P2P (USDT en Binance)**, la **brecha** entre los dos y una calculadora. Se actualiza sola una vez al día, a la hora que elijas, y te avisa con una notificación.

![Pantallas de Cambista](docs/capturas.png)

## Qué hace

| Pantalla | Para qué |
|---|---|
| **Hoy** | Oficial BCB (con su vigencia), paralelo P2P (comprar, vender, promedio) y brecha = P2P / BCB − 1 |
| **Calcular** | "Tengo dólares" o "Tengo bolivianos": cuánto recibes al oficial y en P2P, y la diferencia |
| **Historial** | Un registro por día guardado en el celular, con gráfico de los últimos 30 días |
| **Ajustes** | Actualización diaria (sí/no y hora), notificación, precio para la brecha, anuncios para la mediana, tema, idioma |

## De dónde salen los datos

| Dato | Fuente principal | Respaldo si falla |
|---|---|---|
| Oficial | Página de inicio del [BCB](https://www.bcb.gob.bo/) ("Tipo de cambio oficial") | DolarApi `/v1/dolares/oficial` |
| Paralelo | Binance P2P USDT/BOB: mediana de los primeros N anuncios de compra y de venta | [paralelo.bo](https://paralelo.bo/api) (datos CC BY 4.0), luego DolarApi |

La app está en **español** y en **inglés**. En Ajustes → Idioma eliges Sistema (usa el idioma del celular), Español o English. En inglés los números usan punto decimal (12.40) y la notificación diaria también sale en inglés.

En P2P, **comprar dólar** es lo que pagas por 1 USDT, y **vender dólar** es lo que te pagan.

## Cómo armar el APK

GitHub lo arma solo (`.github/workflows/android.yml`) cada vez que subes cambios a `main`:

1. Ve a la pestaña **Actions** del repo, abre la última ejecución de **Android APK** y descarga el archivo de **Artifacts**.
2. Para tener un link directo desde el celular, crea un tag `v0.1.0`. GitHub publica entonces un **Release** con el APK adjunto.
3. Con los 4 secretos `CAMBISTA_*` configurados, el APK sale firmado con tu llave y las versiones nuevas se instalan encima de las viejas sin perder datos. Sin los secretos sale un APK de prueba (debug).

Para instalarlo en Android, abre el APK y permite "instalar apps de origen desconocido" para tu navegador o tu gestor de archivos.

## Probar en la computadora

```bash
npm install
npm test            # pruebas de la lógica (parsers, cálculo, horario, tarea en segundo plano)
npm run dev         # abre http://localhost:5173/?demo
```

En un navegador normal, el BCB y Binance bloquean las consultas desde otros sitios (CORS), así que se usa `?demo` con datos de ejemplo. En la app de Android las consultas pasan por código nativo y no tienen ese límite.

## Cómo está hecho

```
src/core/rates-core.js   lógica pura: leer BCB y Binance, mediana, brecha, formato, horario
src/runner/daily.js      tarea en segundo plano (Android la corre cada ~30 min, actualiza 1 vez al día)
src/store.js             guardar ajustes e historial; hablar con la tarea en segundo plano
src/main.js              pantallas y botones
src/i18n.js              textos de la app en español e inglés
src/styles.css           diseño (colores, tarjetas, barra inferior)
scripts/build-runner.mjs junta rates-core + daily en public/runners/daily.js
scripts/prepare-android.mjs  ajusta el proyecto Android que genera Capacitor
tests/                   pruebas con Vitest
```

Usa [Vite](https://vite.dev) para la web y [Capacitor](https://capacitorjs.com) para convertirla en app de Android. La carpeta `android/` no se sube al repo: GitHub la genera en cada build.

## Aviso

Cambista es informativa. Las tasas pueden cambiar en cualquier momento y no son una oferta de compra o venta.

## Licencia

© 2026 dani3lsamir. Todos los derechos reservados. Ver [LICENSE](LICENSE).
