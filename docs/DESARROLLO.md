# Desarrollo de Cambista

Notas técnicas para el dueño del proyecto y para los agentes de IA. Lo que ve el usuario está en el [README](../README.md).

## Cómo se arma el APK

GitHub lo arma solo (`.github/workflows/android.yml`) cada vez que subes cambios a `main`:

1. Ve a la pestaña **Actions** del repo, abre la última ejecución de **Android APK** y descarga el archivo de **Artifacts**.
2. Para tener un link directo desde el celular, crea un tag con la versión de `package.json` (por ejemplo `v0.1.1`). GitHub publica entonces un **Release** con el APK adjunto.
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
src/styles.css           diseño (colores, tarjetas, barra inferior)
scripts/build-runner.mjs junta rates-core + daily en public/runners/daily.js
scripts/prepare-android.mjs  ajusta el proyecto Android que genera Capacitor
tests/                   pruebas con Vitest
```

Usa [Vite](https://vite.dev) para la web y [Capacitor](https://capacitorjs.com) para convertirla en app de Android. La carpeta `android/` no se sube al repo: GitHub la genera en cada build.

© 2026 dani3lsamir. Todos los derechos reservados.
