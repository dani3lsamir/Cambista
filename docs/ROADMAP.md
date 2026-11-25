# Roadmap de Cambista

Una cosa por Pull Request, en este orden. Por ahora solo hay APK de Android, armado por GitHub (sin Play Store ni iPhone).

## v0.1

- Pantallas Hoy, Calcular e Historial; Ajustes se abre con la tuerca de Hoy, con exportar e importar ajustes.
- La pestaña Bancos se quitó: no se entendía.
- Oficial BCB y paralelo Binance P2P (mediana), con respaldos.
- Actualización diaria en segundo plano con notificación.
- Idioma español e inglés (Ajustes → Idioma).
- v0.2.1: arreglos de una auditoría: lectura del BCB sin valores falsos, límite de 15 s por consulta, reintento en segundo plano si falla una fuente, importación de CSV de Sheets, errores en inglés, botón Atrás de Android.
- v0.2.0: precio para tu monto en Calcular; lectura del nuevo formato del BCB (tipo de cambio flexible) y de paralelo.bo.
- v0.1.6: la calculadora acepta punto o coma como decimal; Hoy muestra el cambio desde ayer y si el P2P está barato o caro frente a los últimos 7 y 30 días.
- Pendiente de probar en el celular: que el BCB y Binance respondan desde el APK, y que la tarea diaria y las notificaciones funcionen en Android.

## v0.2: precio para mi monto y "¿hoy está barato?" (hecho en v0.2.0)

- ~~**Precio ejecutable para mi monto:** el anuncio más barato de Binance P2P que acepta mi monto (dentro de su mínimo y máximo) y tiene USDT suficiente.~~ Hecho en v0.2.0 (Calcular → Precio para tu monto).
- ~~**Percentil del precio de hoy** frente a los últimos 7 y 30 días del historial, con un aviso tipo "hoy está barato" o "hoy está caro".~~ Hecho en v0.1.6.

